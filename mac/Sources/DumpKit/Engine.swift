import Foundation
import JavaScriptCore
import Network
import Security
import os

public struct EngineError: LocalizedError, Equatable {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}

let log = Logger(subsystem: "np.com.abishrestha.dump", category: "engine")

@MainActor
public final class Engine {
  public var onChange: (() -> Void)?

  private let context: JSContext
  private let directory: URL
  private let settings: UserDefaults
  private let keys: OwnerKeys
  private let writer = DispatchQueue(label: "np.com.abishrestha.dump.notebook-writer")
  private var timers: [Int: DispatchWorkItem] = [:]
  private var http: HTTPBridge!
  private var sockets: SocketBridge!
  private let monitor = NWPathMonitor()
  private var changePending = false
  private var exception: String?

  public init(directory: URL, settings: UserDefaults = .standard, keys: OwnerKeys = OwnerKeys()) throws {
    self.directory = directory
    self.settings = settings
    self.keys = keys
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    guard let context = JSContext() else { throw EngineError("JavaScriptCore is unavailable.") }
    self.context = context
    context.name = "Dump"
    context.exceptionHandler = { [weak self] _, value in
      let message = Engine.describe(value)
      self?.exception = message
      let stack = value?.objectForKeyedSubscript("stack")?.toString() ?? ""
      log.error("JavaScript: \(message, privacy: .public)\n\(stack, privacy: .public)")
    }
    http = HTTPBridge { [weak self] id, response in
      let error: Any = response.error ?? NSNull()
      let arguments: [Any] = [id, response.status, response.headers, response.body, response.url, error]
      self?.callHost("response", arguments)
    }
    sockets = SocketBridge { [weak self] id, type, data, code in
      self?.callHost("socket", [id, type, data, code])
    }
    installNative()
    context.evaluateScript(try Engine.bundledScript(), withSourceURL: URL(string: "dump://engine.js"))
    if let failure = takeException() { throw EngineError("The notebook engine failed to load: \(failure)") }
    watchNetwork()
  }

  // MARK: Notebook

  public func launch() async throws {
    try await callAsync("launch")
  }

  public func close() async throws {
    try await callAsync("close")
  }

  public func snapshot(full: Bool = false) throws -> Snapshot? {
    try decode(Snapshot?.self, call("snapshot", [full]))
  }

  public func search(_ query: String) throws -> [Snapshot.Section] {
    try decode([Snapshot.Section].self, call("search", [query]))
  }

  public func list(forDraft text: String) throws -> String? {
    let value = try call("listFor", [text])
    return value.isString ? value.toString() : nil
  }

  public func due(forDraft text: String) throws -> Day? {
    try decode(Day?.self, call("dueFor", [text]))
  }

  public func day(at date: Date) throws -> Day {
    try decode(Day.self, call("dayAt", [date.timeIntervalSince1970 * 1000]))
  }

  public func capture(_ text: String, list: String?, due: String?) throws -> Captured {
    try decode(Captured.self, call("capture", [text, list ?? NSNull(), due ?? NSNull()]))
  }

  // MARK: Dumps and lists

  public func setDone(_ id: String, _ done: Bool) throws {
    try call("setDone", [id, done])
  }

  public func setDue(_ id: String, _ due: String?) throws {
    try call("setDue", [id, due ?? NSNull()])
  }

  public func file(_ id: String, list: String?) throws {
    try call("file", [id, list ?? NSNull()])
  }

  public func remove(_ id: String) throws {
    try call("remove", [id])
  }

  @discardableResult
  public func saveList(label: String, color: String, id: String? = nil) throws -> Snapshot.List {
    try decode(Snapshot.List.self, call("saveList", [label, color, id ?? NSNull()]))
  }

  public func deleteList(_ id: String) throws {
    try call("deleteList", [id])
  }

  @discardableResult
  public func clearDone() throws -> Int {
    Int(try call("clearDone").toInt32())
  }

  public func resume() { notify("resume") }
  public func suspend() { notify("suspend") }

  // MARK: Notebooks and servers

  public func check(_ address: String) async throws -> ServerCheck {
    try decode(ServerCheck.self, await callAsync("check", [address]))
  }

  public func connect(_ server: ServerCheck, key: String) async throws {
    let location = String(decoding: try JSONEncoder().encode(server.location), as: UTF8.self)
    try await callAsync("connect", [location, key])
  }

  public func signIn(key: String) async throws {
    try await callAsync("signIn", [key])
  }

  public func switchTo(_ profile: Profile) async throws {
    try await callAsync("switchTo", [profile.id])
  }

  @discardableResult
  public func chooseWebApp(_ input: String) throws -> String? {
    let value = try call("chooseWebApp", [input])
    return value.isString ? value.toString() : nil
  }

  // MARK: Calling JavaScript

  func evaluate(_ source: String) throws -> JSValue {
    exception = nil
    let value = context.evaluateScript(source)
    if let failure = takeException() { throw EngineError(failure) }
    return value ?? JSValue(undefinedIn: context)
  }

  @discardableResult
  private func call(_ method: String, _ arguments: [Any] = []) throws -> JSValue {
    exception = nil
    let api = context.objectForKeyedSubscript("DumpEngine")
    let value = api?.invokeMethod(method, withArguments: arguments)
    if let failure = takeException() { throw EngineError(failure) }
    return value ?? JSValue(undefinedIn: context)
  }

  private func notify(_ method: String, _ arguments: [Any] = []) {
    do { try call(method, arguments) } catch {
      log.error("\(method, privacy: .public): \(error.localizedDescription, privacy: .public)")
    }
  }

  private func decode<T: Decodable>(_ type: T.Type, _ value: JSValue) throws -> T {
    try JSONDecoder().decode(type, from: Data((value.toString() ?? "").utf8))
  }

  @discardableResult
  private func callAsync(_ method: String, _ arguments: [Any] = []) async throws -> JSValue {
    let promise = try call(method, arguments)
    return try await withCheckedThrowingContinuation { continuation in
      let fulfilled: @convention(block) (JSValue) -> Void = { continuation.resume(returning: $0) }
      let rejected: @convention(block) (JSValue) -> Void = {
        continuation.resume(throwing: EngineError(Engine.describe($0)))
      }
      promise.invokeMethod("then", withArguments: [fulfilled, rejected])
    }
  }

  private func callHost(_ name: String, _ arguments: [Any]) {
    context.objectForKeyedSubscript("__host")?.objectForKeyedSubscript(name)?.call(
      withArguments: arguments)
  }

  private func takeException() -> String? {
    defer { exception = nil }
    return exception
  }

  nonisolated static func describe(_ value: JSValue?) -> String {
    guard let value, !value.isUndefined, !value.isNull else { return "Unknown error" }
    if value.isObject, let message = value.objectForKeyedSubscript("message"), message.isString {
      return message.toString()
    }
    return value.toString() ?? "Unknown error"
  }

  // MARK: The platform

  private func installNative() {
    guard let native = JSValue(newObjectIn: context) else { return }
    func define(_ name: String, _ block: Any) {
      native.setObject(block, forKeyedSubscript: name as NSString)
    }
    let null = { [unowned self] in JSValue(nullIn: self.context)! }

    let logMessage: @convention(block) (String, String) -> Void = { level, message in
      switch level {
      case "error": log.error("\(message, privacy: .public)")
      case "warn": log.warning("\(message, privacy: .public)")
      case "debug": log.debug("\(message, privacy: .public)")
      default: log.info("\(message, privacy: .public)")
      }
    }
    define("log", logMessage)

    let setTimer: @convention(block) (Int, Double) -> Void = { [weak self] id, milliseconds in
      guard let self else { return }
      let item = DispatchWorkItem { [weak self] in
        guard let self, self.timers.removeValue(forKey: id) != nil else { return }
        self.callHost("timer", [id])
      }
      self.timers[id]?.cancel()
      self.timers[id] = item
      DispatchQueue.main.asyncAfter(deadline: .now() + milliseconds / 1000, execute: item)
    }
    define("setTimer", setTimer)
    let clearTimer: @convention(block) (Int) -> Void = { [weak self] id in
      self?.timers.removeValue(forKey: id)?.cancel()
    }
    define("clearTimer", clearTimer)

    let randomBytes: @convention(block) (Int) -> [Int] = { length in
      var bytes = [UInt8](repeating: 0, count: max(0, min(length, 65_536)))
      _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
      return bytes.map(Int.init)
    }
    define("randomBytes", randomBytes)
    let uuid: @convention(block) () -> String = { UUID().uuidString.lowercased() }
    define("uuid", uuid)

    let request: @convention(block) (Int, String, String, String, JSValue) -> Void = {
      [weak self] id, method, url, headers, body in
      self?.http.start(
        id: id, method: method, url: url, headers: headers,
        body: body.isNull || body.isUndefined ? nil : body.toString())
    }
    define("request", request)
    let cancelRequest: @convention(block) (Int) -> Void = { [weak self] id in self?.http.cancel(id) }
    define("cancelRequest", cancelRequest)

    let socketOpen: @convention(block) (Int, String, String) -> Void = { [weak self] id, url, origin in
      self?.sockets.open(id: id, url: url, origin: origin)
    }
    define("socketOpen", socketOpen)
    let socketSend: @convention(block) (Int, String) -> Void = { [weak self] id, data in
      self?.sockets.send(id: id, data)
    }
    define("socketSend", socketSend)
    let socketClose: @convention(block) (Int, Int, String) -> Void = { [weak self] id, code, reason in
      self?.sockets.close(id: id, code: code, reason: reason)
    }
    define("socketClose", socketClose)

    let readFile: @convention(block) (String) -> JSValue = { [weak self] name in
      guard let self, let url = self.file(name),
        let text = try? String(contentsOf: url, encoding: .utf8)
      else { return null() }
      return JSValue(object: text, in: self.context)
    }
    define("readFile", readFile)
    let writeFile: @convention(block) (Int, String, String) -> Void = {
      [weak self] id, name, content in
      guard let self else { return }
      guard let url = self.file(name) else {
        self.callHost("written", [id, "Invalid notebook file name."])
        return
      }
      let data = Data(content.utf8)
      self.writer.async {
        var failure: String?
        do { try data.write(to: url, options: .atomic) } catch {
          failure = error.localizedDescription
          log.error("Saving \(name, privacy: .public) failed: \(failure ?? "", privacy: .public)")
        }
        DispatchQueue.main.async { [weak self] in
          self?.callHost("written", [id, failure ?? NSNull()])
        }
      }
    }
    define("writeFile", writeFile)

    // Settings written before the engine kept them may be JSON data rather than text.
    let readSetting: @convention(block) (String) -> JSValue = { [weak self] name in
      guard let self else { return null() }
      let value = self.settings.string(forKey: name)
        ?? self.settings.data(forKey: name).map { String(decoding: $0, as: UTF8.self) }
      return value.map { JSValue(object: $0, in: self.context) } ?? null()
    }
    define("readSetting", readSetting)
    let writeSetting: @convention(block) (String, JSValue) -> Void = { [weak self] name, value in
      if value.isNull || value.isUndefined { self?.settings.removeObject(forKey: name) } else {
        self?.settings.set(value.toString(), forKey: name)
      }
    }
    define("writeSetting", writeSetting)
    let ownerKey: @convention(block) (String) -> JSValue = { [weak self] profileId in
      guard let self, let key = self.keys.read(profileId) else { return null() }
      return JSValue(object: key, in: self.context)
    }
    define("ownerKey", ownerKey)
    let saveOwnerKey: @convention(block) (String, String, String) -> Void = {
      [weak self] profileId, key, server in
      guard let self else { return }
      do { try self.keys.save(key, for: profileId, server: server) } catch {
        self.context.exception = JSValue(newErrorFromMessage: error.localizedDescription, in: self.context)
      }
    }
    define("saveOwnerKey", saveOwnerKey)
    let changed: @convention(block) () -> Void = { [weak self] in
      guard let self, !self.changePending else { return }
      self.changePending = true
      DispatchQueue.main.async { [weak self] in
        self?.changePending = false
        self?.onChange?()
      }
    }
    define("changed", changed)

    context.setObject(native, forKeyedSubscript: "__native" as NSString)
  }

  private func file(_ name: String) -> URL? {
    guard name.range(of: #"^[0-9a-f-]{36}\.json$"#, options: .regularExpression) != nil else {
      return nil
    }
    return directory.appendingPathComponent(name)
  }

  private func watchNetwork() {
    monitor.pathUpdateHandler = { [weak self] path in
      let online = path.status == .satisfied
      DispatchQueue.main.async { [weak self] in self?.notify("network", [online]) }
    }
    monitor.start(queue: DispatchQueue(label: "np.com.abishrestha.dump.network"))
  }

  /// engine.js: inside the app bundle, else DUMP_ENGINE, else mac/build/ next to these sources
  /// (for `swift run` and Xcode during development).
  static func bundledScript() throws -> String {
    let candidates = [
      Bundle.main.url(forResource: "engine", withExtension: "js"),
      ProcessInfo.processInfo.environment["DUMP_ENGINE"].map { URL(fileURLWithPath: $0) },
      URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("../../build/engine.js").standardizedFileURL,
    ]
    for case let url? in candidates {
      if let script = try? String(contentsOf: url, encoding: .utf8) { return script }
    }
    throw EngineError("engine.js is missing. Run `npm run mac:engine` in the repository first.")
  }
}
