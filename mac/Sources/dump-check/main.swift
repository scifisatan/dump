import DumpKit
import Foundation

// Headless check of the Mac engine against a running server: connect, wait for sync, capture,
// and wait for expected dumps to arrive. Exits non-zero on any failure.
//
//   dump-check --server http://localhost:6195 --key KEY --origin http://localhost:6194 \
//     --data /tmp/dump-check [--profile UUID] [--capture TEXT]... [--expect TEXT]...

struct Options {
  var server = ""
  var key = ""
  var origin: String?
  var data = FileManager.default.temporaryDirectory.appendingPathComponent("dump-check")
  var profile: String?
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
      case "--profile": profile = value
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
  let keys = OwnerKeys(persistent: false)
  let engine = try Engine(directory: options.data)
  if let origin = options.origin { engine.origin = { _ in origin } }
  engine.ownerKey = { keys.read($0) }

  let check = try await engine.inspect(options.server)
  print("server: \(check.baseUrl) notebook \(check.instanceId.prefix(12))… filing \(check.classify)")
  try await engine.verify(check.baseUrl, key: options.key)
  let profile = Profile(id: options.profile ?? UUID().uuidString.lowercased(), server: check.location)
  try keys.save(options.key, for: profile.id, server: check.baseUrl)

  try await engine.open(profile)
  try await waitFor("sync") { engine.snapshot()?.sync == .synced }
  print("synced profile \(profile.id)")
  for text in options.captures {
    let captured = try engine.capture(text, list: options.list)
    print("captured \(captured.id) list=\(captured.list ?? "inbox")")
  }
  for text in options.expected {
    try await waitFor("\"\(text)\"") { engine.snapshot()?.recent.contains { $0.text == text } == true }
    print("found \"\(text)\"")
  }
  // Give the socket time to deliver the captures before closing.
  if !options.captures.isEmpty { try await Task.sleep(for: .seconds(1.5)) }
  let snapshot = engine.snapshot()
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
