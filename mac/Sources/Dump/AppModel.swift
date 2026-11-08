import AppKit
import DumpKit
import Observation
import ServiceManagement

@MainActor @Observable
final class AppModel {
  private(set) var snapshot = Snapshot.closed

  var draft = ""
  var chosenList: String?
  var captureError: String?
  var actionError: String?
  var engineError: String? { launchError ?? snapshotError }
  private var launchError: String?
  private var snapshotError: String?

  var notebookOpen = false {
    didSet { if notebookOpen != oldValue { refresh() } }
  }

  var shortcut: Shortcut {
    didSet {
      save(shortcut, as: Keys.shortcut)
      shortcutRefused = !(registerShortcut?(shortcut) ?? true)
    }
  }
  /// The system refused the shortcut, usually because another app holds it.
  private(set) var shortcutRefused = false
  var registerShortcut: ((Shortcut) -> Bool)?
  var pauseShortcut: ((Bool) -> Void)?
  var showPanel: (() -> Void)?
  var showNotebook: (() -> Void)?

  let engine: Engine
  private let defaults = UserDefaults.standard
  @ObservationIgnored private var dayChange: NSObjectProtocol?

  private enum Keys {
    static let shortcut = "shortcut"
  }

  static let dataDirectory = FileManager.default
    .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("Dump/Notebooks", isDirectory: true)

  init() throws {
    engine = try Engine(directory: AppModel.dataDirectory)
    shortcut =
      defaults.data(forKey: Keys.shortcut).flatMap { try? JSONDecoder().decode(Shortcut.self, from: $0) }
      ?? .standard
    engine.onChange = { [weak self] in self?.refresh() }
    // Home's Today moves on at midnight, though nothing in the notebook changed.
    dayChange = NotificationCenter.default.addObserver(
      forName: .NSCalendarDayChanged, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.refresh() }
    }
  }

  func start() async {
    do { try await engine.launch() } catch { launchError = error.localizedDescription }
    refresh()
  }

  private func refresh() {
    do {
      snapshot = try engine.snapshot(full: notebookOpen) ?? .closed
      snapshotError = nil
    } catch {
      snapshot = .closed
      snapshotError = error.localizedDescription
    }
    if let chosen = chosenList, snapshot.list(chosen) == nil { chosenList = nil }
  }

  // MARK: Capture

  var prefixList: String? { (try? engine.list(forDraft: draft)) ?? nil }
  var draftDue: Day? { (try? engine.due(forDraft: draft)) ?? nil }
  var targetList: String? { prefixList ?? chosenList }

  func capture() -> Captured? {
    guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    do {
      let captured = try engine.capture(draft, list: chosenList, due: draftDue?.due)
      draft = ""
      chosenList = nil
      captureError = nil
      return captured
    } catch {
      captureError = error.localizedDescription
      return nil
    }
  }

  func cycleList(_ step: Int) {
    let choices: [String?] = [nil] + snapshot.lists.map(\.id)
    let index = choices.firstIndex(of: chosenList) ?? 0
    chosenList = choices[(index + step + choices.count) % choices.count]
  }

  func pickList(_ number: Int) {
    if number == 0 { chosenList = nil } else if number <= snapshot.lists.count {
      chosenList = snapshot.lists[number - 1].id
    }
  }

  // MARK: Dumps and lists

  func setDone(_ ids: some Sequence<String>, _ done: Bool) {
    perform { for id in ids { try engine.setDone(id, done) } }
  }

  func file(_ ids: some Sequence<String>, to list: String?) {
    perform { for id in ids { try engine.file(id, list: list) } }
  }

  func setDue(_ ids: some Sequence<String>, _ due: String?) {
    perform { for id in ids { try engine.setDue(id, due) } }
  }

  func remove(_ ids: some Sequence<String>) {
    perform { for id in ids { try engine.remove(id) } }
  }

  func clearDone() {
    perform { try engine.clearDone() }
  }

  private func perform(_ work: () throws -> Void) {
    do { try work() } catch { actionError = error.localizedDescription }
  }

  // MARK: Servers

  func connect(_ check: ServerCheck, key: String) async throws {
    try await engine.connect(check, key: key)
    startOver()
  }

  func switchTo(_ profile: Profile) async throws {
    try await engine.switchTo(profile)
    startOver()
  }

  private func startOver() {
    draft = ""
    chosenList = nil
  }

  var webAppURL: URL? { URL(string: snapshot.webApp.current) }

  // MARK: Login item

  private(set) var opensAtLogin = SMAppService.mainApp.status == .enabled

  func setOpensAtLogin(_ enabled: Bool) {
    do {
      if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    } catch {
      NSSound.beep()
    }
    opensAtLogin = SMAppService.mainApp.status == .enabled
  }

  /// Login items need the app bundle; `swift run` has none.
  var canOpenAtLogin: Bool { Bundle.main.bundleIdentifier != nil }

  private func save<T: Encodable>(_ value: T, as key: String) {
    if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
  }
}

extension Snapshot.Sync {
  var label: String {
    switch self {
    case .synced: "Synced"
    case .syncing, .connecting: "Syncing…"
    case .offline: "Offline · saved on this Mac"
    case .error: "Sync paused · retrying"
    case .local: "On this Mac only"
    case .signedOut: "Signed out · enter the owner key in Settings"
    }
  }

  var tint: NSColor {
    switch self {
    case .synced: .systemGreen
    case .syncing, .connecting, .error: .systemOrange
    case .offline, .local: .tertiaryLabelColor
    case .signedOut: .systemRed
    }
  }
}
