import DumpKit
import Foundation

// Headless check of the Mac engine against a running server: connect, wait for sync, capture,
// and wait for expected dumps to arrive. Exits non-zero on any failure.
//
//   dump-check --server http://localhost:6195 --key KEY --origin http://localhost:6194 \
//     --data /tmp/dump-check [--list LIST] [--capture TEXT]... [--expect TEXT]...
//
// Each run is a new device: its notebook starts on this Mac only and joins the server's.

struct Options {
  var server = ""
  var key = ""
  var origin: String?
  var data = FileManager.default.temporaryDirectory.appendingPathComponent("dump-check")
  var captures: [String] = []
  var expected: [String] = []
  var list: String?

  init(_ arguments: [String]) throws {
    var rest = arguments[...]
    while let flag = rest.popFirst() {
      guard let value = rest.popFirst() else { throw EngineError("Missing value for \(flag)") }
      switch flag {
      case "--server": server = value
      case "--key": key = value
      case "--origin": origin = value
      case "--data": data = URL(fileURLWithPath: value)
      case "--capture": captures.append(value)
      case "--expect": expected.append(value)
      case "--list": list = value
      default: throw EngineError("Unknown option \(flag)")
      }
    }
    if server.isEmpty || key.isEmpty { throw EngineError("--server and --key are required.") }
  }
}

@MainActor
func waitFor(_ what: String, seconds: Double = 20, _ condition: () -> Bool) async throws {
  let deadline = Date().addingTimeInterval(seconds)
  while !condition() {
    if Date() > deadline { throw EngineError("Timed out waiting for \(what).") }
    try await Task.sleep(for: .milliseconds(50))
  }
}

@MainActor
func run() async throws {
  let options = try Options(Array(CommandLine.arguments.dropFirst()))
  let suite = "np.com.abishrestha.dump.check.\(UUID().uuidString)"
  guard let settings = UserDefaults(suiteName: suite) else { throw EngineError("No settings.") }
  defer { settings.removePersistentDomain(forName: suite) }
  let engine = try Engine(
    directory: options.data, settings: settings, keys: OwnerKeys(persistent: false))
  if let origin = options.origin { try engine.chooseWebApp(origin) }
  try await engine.launch()

  let check = try await engine.check(options.server)
  print("server: \(check.baseUrl) notebook \(check.instanceId.prefix(12))… filing \(check.classify)")
  try await engine.connect(check, key: options.key)
  try await waitFor("sync") { (try? engine.snapshot())??.sync == .synced }
  print("synced")
  for text in options.captures {
    let captured = try engine.capture(text, list: options.list, due: engine.due(forDraft: text)?.due)
    print("captured \(captured.id) list=\(captured.list ?? "inbox")")
  }
  for text in options.expected {
    try await waitFor("\"\(text)\"") {
      (try? engine.snapshot())??.recent.contains { $0.text == text } == true
    }
    print("found \"\(text)\"")
  }
  // Give the socket time to deliver the captures before closing.
  if !options.captures.isEmpty { try await Task.sleep(for: .seconds(1.5)) }
  let snapshot = try engine.snapshot()
  try await engine.close()
  let output = try JSONEncoder().encode(snapshot)
  print(String(decoding: output, as: UTF8.self))
}

Task { @MainActor in
  do {
    try await run()
    exit(0)
  } catch {
    FileHandle.standardError.write(Data("dump-check: \(error.localizedDescription)\n".utf8))
    exit(1)
  }
}
dispatchMain()
