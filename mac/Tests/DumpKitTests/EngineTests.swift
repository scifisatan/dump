import Foundation
import Testing

@testable import DumpKit

@MainActor
final class EngineTests {
  let directory = FileManager.default.temporaryDirectory
    .appendingPathComponent("dump-tests-\(UUID().uuidString)")
  let suite = "dump-tests-\(UUID().uuidString)"
  lazy var settings = UserDefaults(suiteName: suite)!

  deinit {
    UserDefaults().removePersistentDomain(forName: suite)
  }

  private func engine() throws -> Engine {
    try Engine(directory: directory, settings: settings, keys: OwnerKeys(persistent: false))
  }

  private func launched() async throws -> Engine {
    let engine = try engine()
    try await engine.launch()
    return engine
  }

  @Test func capturesOfflineAndReopensFromDisk() async throws {
    let first = try await launched()
    let snapshot = try #require(try first.snapshot())
    #expect(snapshot.sync == .local)
    #expect(snapshot.firstRun)
    #expect(snapshot.profile?.server == nil)
    let filed = try first.capture("!buy warm floor lamp #reading", list: nil, due: nil)
    let chosen = try first.capture("call the bank", list: "todo", due: nil)
    let unfiled = try first.capture("an idea for later", list: nil, due: nil)
    #expect(filed.list == "buy")
    #expect(chosen.list == "todo")
    #expect(unfiled.list == nil)
    try await first.close()

    let second = try await launched()
    let reopened = try #require(try second.snapshot())
    #expect(reopened.profile == snapshot.profile)
    #expect(!reopened.firstRun)
    // Captures in the same millisecond tie on time and then sort by random ID, so compare contents.
    #expect(Set(reopened.recent.map(\.text)) == ["an idea for later", "call the bank", "warm floor lamp #reading"])
    #expect(reopened.unfiled == [unfiled.id])
    try await second.close()
  }

  /// Builds before the engine kept its own settings saved the registry as JSON data.
  @Test func opensTheNotebookAnOlderBuildSaved() async throws {
    let id = UUID().uuidString.lowercased()
    settings.set(Data(#"{"active":"\#(id)","profiles":[{"id":"\#(id)","server":null}]}"#.utf8), forKey: "connections")
    let engine = try await launched()
    let snapshot = try #require(try engine.snapshot())
    #expect(snapshot.profile?.id == id)
    #expect(!snapshot.firstRun)
  }

  @Test func explicitPrefixWinsOverTheChosenList() async throws {
    let engine = try await launched()
    #expect(try engine.list(forDraft: "!watch Dune") == "watch")
    #expect(try engine.list(forDraft: "!to-do pay rent") == "todo")
    #expect(try engine.list(forDraft: "!todo pay rent") == "todo")
    #expect(try engine.list(forDraft: "!someday pay rent") == nil)
    #expect(try engine.list(forDraft: "no prefix") == nil)
    #expect(try engine.snapshot()?.list("todo")?.prefix == "!to-do")
    #expect(try engine.capture("!watch Dune part two", list: "buy", due: nil).list == "watch")
    #expect(throws: EngineError.self) { try engine.capture("   ", list: nil, due: nil) }
    try await engine.close()
  }

  @Test func actsOnDumpsAndListsLikeTheWebApp() async throws {
    let engine = try await launched()
    let idea = try engine.capture("an idea #later", list: nil, due: nil)
    let errand = try engine.capture("call the bank", list: "todo", due: nil)
    #expect(try engine.snapshot()?.dumps.isEmpty == true)
    #expect(try #require(try engine.snapshot(full: true)).dumps.first { $0.id == idea.id }?.tags == ["later"])

    try engine.file(idea.id, list: "ideas")
    try engine.setDone(errand.id, true)
    var dumps = try #require(try engine.snapshot(full: true)).dumps
    #expect(dumps.first { $0.id == idea.id }?.list == "ideas")
    #expect(dumps.first { $0.id == errand.id }?.done == true)
    #expect(throws: EngineError("That list no longer exists.")) { try engine.file(idea.id, list: "nope") }

    let books = try engine.saveList(label: "Books", color: "#6395c3")
    #expect(throws: EngineError("A list with that name already exists.")) {
      try engine.saveList(label: "books", color: "#6395c3")
    }
    try engine.saveList(label: "Reading", color: "#849c74", id: books.id)
    #expect(try engine.snapshot()?.list(books.id)?.label == "Reading")
    try engine.file(idea.id, list: books.id)
    try engine.deleteList(books.id)
    #expect(try engine.snapshot()?.list(books.id) == nil)
    dumps = try #require(try engine.snapshot(full: true)).dumps
    #expect(dumps.first { $0.id == idea.id }?.list == nil)

    #expect(try engine.clearDone() == 1)
    try engine.remove(idea.id)
    #expect(try engine.snapshot(full: true)?.dumps.isEmpty == true)
    #expect(throws: EngineError("This dump is no longer in your notebook.")) { try engine.remove(idea.id) }
    try await engine.close()
  }

  @Test func readsDaysAndGroupsHomeLikeTheWebApp() async throws {
    let engine = try await launched()
    let friday = try #require(try engine.due(forDraft: "submit my application by friday")).due
    #expect(friday.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil)
    #expect(try engine.due(forDraft: "sat down to write") == nil)
    #expect(try engine.day(at: .now).label == "Today")
    let dated = try engine.capture("submit my application by friday", list: nil, due: friday)
    let plain = try engine.capture("lunch tomorrow", list: nil, due: nil)
    #expect(dated.due == friday)
    #expect(plain.due == nil)

    try engine.setDue(plain.id, "2020-01-05")
    var home = try #require(try engine.snapshot(full: true)?.places).home
    #expect(home.first { $0.id == "overdue" }?.ids == [plain.id])
    #expect(home.first { $0.id == "overdue" }?.title == "Overdue")
    #expect(home.first { $0.id == "dumped" } == nil)
    #expect(try engine.snapshot(full: true)?.dumps.first { $0.id == plain.id }?.overdue == true)
    try engine.setDue(plain.id, nil)
    home = try #require(try engine.snapshot(full: true)?.places).home
    #expect(home.first { $0.id == "overdue" } == nil)
    #expect(home.first { $0.id == "dumped" }?.ids == [plain.id])
    #expect(try #require(try engine.snapshot(full: true)).dumps.first { $0.id == dated.id }?.due == friday)
    #expect(try engine.snapshot()?.places == nil)
    #expect(throws: EngineError.self) { try engine.setDue(plain.id, "friday") }
    try await engine.close()
  }

  // TinyBase hashes these bytes; every device must produce the same ones as a browser.
  @Test func textEncoderMatchesUTF8() throws {
    let engine = try engine()
    for sample in ["plain", "café", "€ and 😀", "क्षत्रिय", "line\nbreak"] {
      let bytes = try engine.evaluate("Array.from(new TextEncoder().encode(\(json(sample))))")
      #expect((bytes.toArray() as? [Int]) == sample.utf8.map(Int.init))
    }
    let lone = try engine.evaluate(#"Array.from(new TextEncoder().encode("a\ud800b"))"#)
    #expect((lone.toArray() as? [Int]) == [0x61, 0xEF, 0xBF, 0xBD, 0x62])
  }

  @Test func urlsNormalizeLikeBrowsers() throws {
    let engine = try engine()
    let href = try engine.evaluate("new URL('HTTPS://Example.COM:443/a b?q=1#x').href")
    #expect(href.toString() == "https://example.com/a%20b?q=1#x")
    let origin = try engine.evaluate("new URL('http://localhost:6190/').origin")
    #expect(origin.toString() == "http://localhost:6190")
  }

  @Test func timersAndAbortSignalsWork() async throws {
    let engine = try engine()
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
    let engine = try engine()
    await #expect(
      throws: EngineError(
        "Could not reach this server. Check the address, that it is online, and that its ALLOWED_CLIENT_ORIGINS lists this app."
      )
    ) {
      _ = try await engine.check("http://localhost:9")
    }
    await #expect(throws: EngineError("Use HTTPS, or HTTP on localhost for development.")) {
      _ = try await engine.check("http://example.com")
    }
  }

  @Test func keepsTheChosenWebAppAddressInSettings() async throws {
    let engine = try await launched()
    #expect(try engine.snapshot()?.webApp == WebApp(chosen: nil, standard: "https://dump.abishrestha.com.np"))
    #expect(try engine.chooseWebApp(" https://Dump.Example.com/ ") == "https://dump.example.com")
    #expect(throws: EngineError.self) { try engine.chooseWebApp("https://dump.example.com/app") }
    #expect(settings.string(forKey: "webAppOrigin") == "https://dump.example.com")
    #expect(try engine.snapshot()?.webApp.current == "https://dump.example.com")
    #expect(try engine.chooseWebApp("") == nil)
    #expect(settings.string(forKey: "webAppOrigin") == nil)
  }

  private func json(_ text: String) -> String {
    String(decoding: try! JSONEncoder().encode(text), as: UTF8.self)
  }
}
