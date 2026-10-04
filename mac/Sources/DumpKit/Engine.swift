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

/// Runs the web app's notebook core (mac/engine, bundled as engine.js) in JavaScriptCore and gives
/// it the platform a browser would: timers, randomness, HTTP, WebSockets, files and network state.
/// Everything, JavaScript included, runs on the main thread.
@MainActor
public final class Engine {
  /// Called once per run of main-queue work after the notebook changed.
  public var onChange: (() -> Void)?
  /// The owner key for a profile ID, read whenever sync or filing needs it.
  public var ownerKey: (String) -> String? = { _ in nil }
  /// The Origin header for a request to a server.
  public var origin: (URL) -> String = ClientOrigin.standard(for:)

  public private(set) var isOnline = true

  private let context: JSContext
  private let directory: URL
  private let writer = DispatchQueue(label: "np.com.abishrestha.dump.notebook-writer")
  private var timers: [Int: DispatchWorkItem] = [:]
  private var http: HTTPBridge!
  private var sockets: SocketBridge!
  private let monitor = NWPathMonitor()
  private var changePending = false
  private var exception: String?

  /// `directory` holds one JSON file per notebook.
  public init(directory: URL, script: String? = nil) throws {
    self.directory = directory
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
    let origin: (URL) -> String = { [weak self] url in
      self?.origin(url) ?? ClientOrigin.standard(for: url)
    }
    http = HTTPBridge(origin: origin) { [weak self] id, response in
      let error: Any = response.error ?? NSNull()
      let arguments: [Any] = [id, response.status, response.headers, response.body, response.url, error]
      self?.callHost("response", arguments)
    }
    sockets = SocketBridge(origin: origin) { [weak self] id, type, data, code in
      self?.callHost("socket", [id, type, data, code])
    }
    installNative()
    context.evaluateScript(try script ?? Engine.bundledScript(), withSourceURL: URL(string: "dump://engine.js"))
    if let failure = takeException() { throw EngineError("The notebook engine failed to load: \(failure)") }
    watchNetwork()
  }

  // MARK: Notebook

  public func open(_ profile: Profile) async throws {
    let config = String(decoding: try JSONEncoder().encode(profile), as: UTF8.self)
    try await callAsync("open", [config])
  }

  /// Saves and closes the open notebook. Throws, leaving it open, when saving fails.
  public func close() async throws {
    try await callAsync("close")
  }

  /// `full` includes every dump, for the notebook window.
  public func snapshot(full: Bool = false) -> Snapshot? {
    guard let json = try? call("snapshot", [full]).toString() else { return nil }
    return try? JSONDecoder().decode(Snapshot?.self, from: Data(json.utf8))
  }

  /// The list a leading `!list` in the draft files to, if any.
  public func list(forDraft text: String) -> String? {
    guard let value = try? call("listFor", [text]), value.isString else { return nil }
    return value.toString()
  }

  /// Saves a dump synchronously. `list` files it unless the text names a list with `!list`.
  public func capture(_ text: String, list: String?) throws -> Captured {
    let json = try call("capture", [text, list ?? NSNull()]).toString() ?? ""
    return try JSONDecoder().decode(Captured.self, from: Data(json.utf8))
  }

  // MARK: Dumps and lists. Every change is final; there is no undo.

  public func setDone(_ id: String, _ done: Bool) throws {
    try call("setDone", [id, done])
  }

  /// Files a dump by hand; nil returns it to the inbox.
  public func file(_ id: String, list: String?) throws {
    try call("file", [id, list ?? NSNull()])
  }

  public func remove(_ id: String) throws {
    try call("remove", [id])
  }

  /// Creates a list, or renames and recolors the one with `id`.
  @discardableResult
  public func saveList(label: String, color: String, id: String? = nil) throws -> Snapshot.List {
    let json = try call("saveList", [label, color, id ?? NSNull()]).toString() ?? ""
    return try JSONDecoder().decode(Snapshot.List.self, from: Data(json.utf8))
  }

  /// Deletes a list; its dumps go back to the inbox.
  public func deleteList(_ id: String) throws {
    try call("deleteList", [id])
  }

  /// Removes every done dump and returns how many there were.
  @discardableResult
  public func clearDone() throws -> Int {
    Int(try call("clearDone").toInt32())
  }

  /// Resumes sync after the owner key was entered again.
  public func reconnect() { _ = try? call("reconnect") }
  /// Retries sync now, as on wake or when the panel opens.
  public func resume() { _ = try? call("resume") }
  /// Flushes storage, as before sleep.
  public func suspend() { _ = try? call("suspend") }

  // MARK: Servers

  public func inspect(_ address: String) async throws -> ServerCheck {
    let json = try await callAsync("inspect", [address]).toString() ?? ""
    return try JSONDecoder().decode(ServerCheck.self, from: Data(json.utf8))
  }

  /// Checks an owner key against a server without saving anything.
  public func verify(_ baseUrl: String, key: String) async throws {
    try await callAsync("verify", [baseUrl, key])
  }

  // MARK: Calling JavaScript

  /// Evaluates source in the engine's context; for tests.
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

    let socketOpen: @convention(block) (Int, String) -> Void = { [weak self] id, url in
      self?.sockets.open(id: id, url: url)
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

    let isOnline: @convention(block) () -> Bool = { [weak self] in self?.isOnline ?? true }
    define("isOnline", isOnline)
    let ownerKey: @convention(block) (String) -> JSValue = { [weak self] profileId in
      guard let self, let key = self.ownerKey(profileId) else { return null() }
      return JSValue(object: key, in: self.context)
    }
    define("ownerKey", ownerKey)
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
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isOnline != online else { return }
        self.isOnline = online
        _ = try? self.call("network", [online])
      }
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
