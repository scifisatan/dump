import Foundation
import Testing

@testable import DumpKit

@MainActor
struct EngineTests {
  let directory = FileManager.default.temporaryDirectory
    .appendingPathComponent("dump-tests-\(UUID().uuidString)")

  @Test func capturesOfflineAndReopensFromDisk() async throws {
    let profile = Profile(server: nil)
    let first = try Engine(directory: directory)
    try await first.open(profile)
    #expect(first.snapshot()?.sync == .local)
    let filed = try first.capture("!buy warm floor lamp #reading", list: nil)
    let chosen = try first.capture("call the bank", list: "todo")
    let unfiled = try first.capture("an idea for later", list: nil)
    #expect(filed.list == "buy")
    #expect(chosen.list == "todo")
    #expect(unfiled.list == nil)
    try await first.close()

    let second = try Engine(directory: directory)
    try await second.open(profile)
    let recent = try #require(second.snapshot()).recent
    // Captures in the same millisecond tie on time and then sort by random ID, so compare contents.
    #expect(Set(recent.map(\.text)) == ["an idea for later", "call the bank", "warm floor lamp #reading"])
    #expect(second.snapshot()?.inbox == 1)
    try await second.close()
  }

  @Test func explicitPrefixWinsOverTheChosenList() async throws {
    let engine = try Engine(directory: directory)
    try await engine.open(Profile(server: nil))
    #expect(engine.list(forDraft: "!watch Dune") == "watch")
    #expect(engine.list(forDraft: "!to-do pay rent") == "todo")
    #expect(engine.list(forDraft: "!todo pay rent") == "todo")
    #expect(engine.list(forDraft: "!someday pay rent") == nil)
    #expect(engine.list(forDraft: "no prefix") == nil)
    #expect(try engine.capture("!watch Dune part two", list: "buy").list == "watch")
    #expect(throws: EngineError.self) { try engine.capture("   ", list: nil) }
    try await engine.close()
  }

  @Test func actsOnDumpsAndListsLikeTheWebApp() async throws {
    let engine = try Engine(directory: directory)
    try await engine.open(Profile(server: nil))
    let idea = try engine.capture("an idea #later", list: nil)
    let errand = try engine.capture("call the bank", list: "todo")
    #expect(engine.snapshot()?.dumps.isEmpty == true)
    #expect(try #require(engine.snapshot(full: true)).dumps.first { $0.id == idea.id }?.tags == ["later"])

    try engine.file(idea.id, list: "ideas")
    try engine.setDone(errand.id, true)
    var dumps = try #require(engine.snapshot(full: true)).dumps
    #expect(dumps.first { $0.id == idea.id }?.list == "ideas")
    #expect(dumps.first { $0.id == errand.id }?.done == true)
    #expect(throws: EngineError("That list no longer exists.")) { try engine.file(idea.id, list: "nope") }

    let books = try engine.saveList(label: "Books", color: "#6395c3")
    #expect(throws: EngineError("A list with that name already exists.")) {
      try engine.saveList(label: "books", color: "#6395c3")
    }
    try engine.saveList(label: "Reading", color: "#849c74", id: books.id)
    #expect(engine.snapshot()?.list(books.id)?.label == "Reading")
    try engine.file(idea.id, list: books.id)
    try engine.deleteList(books.id)
    #expect(engine.snapshot()?.list(books.id) == nil)
    dumps = try #require(engine.snapshot(full: true)).dumps
    #expect(dumps.first { $0.id == idea.id }?.list == nil)

    #expect(try engine.clearDone() == 1)
    try engine.remove(idea.id)
    #expect(engine.snapshot(full: true)?.dumps.isEmpty == true)
    #expect(throws: EngineError("This dump is no longer in your notebook.")) { try engine.remove(idea.id) }
    try await engine.close()
  }

  // TinyBase hashes these bytes; every device must produce the same ones as a browser.
  @Test func textEncoderMatchesUTF8() throws {
    let engine = try Engine(directory: directory)
    for sample in ["plain", "café", "€ and 😀", "क्षत्रिय", "line\nbreak"] {
      let bytes = try engine.evaluate("Array.from(new TextEncoder().encode(\(json(sample))))")
      #expect((bytes.toArray() as? [Int]) == sample.utf8.map(Int.init))
    }
    let lone = try engine.evaluate(#"Array.from(new TextEncoder().encode("a\ud800b"))"#)
    #expect((lone.toArray() as? [Int]) == [0x61, 0xEF, 0xBF, 0xBD, 0x62])
  }

  @Test func urlsNormalizeLikeBrowsers() throws {
    let engine = try Engine(directory: directory)
    let href = try engine.evaluate("new URL('HTTPS://Example.COM:443/a b?q=1#x').href")
    #expect(href.toString() == "https://example.com/a%20b?q=1#x")
    let origin = try engine.evaluate("new URL('http://localhost:6190/').origin")
    #expect(origin.toString() == "http://localhost:6190")
  }

  @Test func timersAndAbortSignalsWork() async throws {
    let engine = try Engine(directory: directory)
    _ = try engine.evaluate(
      """
      globalThis.order = [];
      setTimeout(() => order.push('late'), 30);
      setTimeout(() => order.push('soon'), 0);
      const cancelled = setTimeout(() => order.push('never'), 10);
      clearTimeout(cancelled);
      AbortSignal.timeout(10).addEventListener('abort', (event) => order.push(event.target.reason.name));
      """)
    try await Task.sleep(for: .milliseconds(150))
    #expect(try engine.evaluate("order.join(',')").toString() == "soon,TimeoutError,late")
  }

  @Test func unreachableServerReportsANetworkFailure() async throws {
    let engine = try Engine(directory: directory)
    await #expect(
      throws: EngineError(
        "Could not reach this server. Check the address, that it is online, and that its ALLOWED_CLIENT_ORIGINS lists this app."
      )
    ) {
      _ = try await engine.inspect("http://localhost:9")
    }
    await #expect(throws: EngineError("Use HTTPS, or HTTP on localhost for development.")) {
      _ = try await engine.inspect("http://example.com")
    }
  }

  @Test func clientOriginOverridesAreOrigins() {
    #expect(ClientOrigin.normalized(" https://Dump.Example.com/ ") == "https://dump.example.com")
    #expect(ClientOrigin.normalized("http://localhost:6191") == "http://localhost:6191")
    #expect(ClientOrigin.normalized("https://dump.example.com/app") == nil)
    #expect(ClientOrigin.normalized("ftp://dump.example.com") == nil)
    #expect(ClientOrigin.standard(for: URL(string: "http://localhost:6190")!) == ClientOrigin.development)
    #expect(ClientOrigin.standard(for: URL(string: "https://dump-api.example.com")!) == ClientOrigin.hosted)
  }

  private func json(_ text: String) -> String {
    String(decoding: try! JSONEncoder().encode(text), as: UTF8.self)
  }
}
