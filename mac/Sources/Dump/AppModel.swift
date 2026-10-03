import AppKit
import DumpKit
import Observation
import ServiceManagement

/// The app's state: the open notebook, the capture draft, and settings. Notebook work goes through
/// the engine; connections follow the web app's rules (src/client/components/ServerSettings.tsx).
@MainActor @Observable
final class AppModel {
  private(set) var snapshot = Snapshot.closed
  private(set) var profile: Profile?
  private(set) var openError: String?
  /// True until the first notebook was set up, to greet a new user.
  private(set) var firstRun = false

  var draft = ""
  /// The list chosen in the panel; nil leaves filing to the `!list` prefix or Jev.
  var chosenList: String?
  var captureError: String?

  var shortcut: Shortcut {
    didSet {
      save(shortcut, as: Keys.shortcut)
      shortcutRefused = !(registerShortcut?(shortcut) ?? true)
    }
  }
  /// The system refused the shortcut, usually because another app holds it.
  private(set) var shortcutRefused = false
  /// Set by the app delegate: registers a shortcut (false when refused), and pauses it while a
  /// new one is recorded.
  var registerShortcut: ((Shortcut) -> Bool)?
  var pauseShortcut: ((Bool) -> Void)?
  var showPanel: (() -> Void)?
  /// Overrides the Origin header sent to servers; nil uses ClientOrigin.standard.
  var webAppOrigin: String? {
    didSet { defaults.set(webAppOrigin, forKey: Keys.origin) }
  }

  let engine: Engine
  let profiles = ProfileStore()
  private let keys = OwnerKeys()
  private let defaults = UserDefaults.standard

  private enum Keys {
    static let shortcut = "shortcut"
    static let origin = "webAppOrigin"
  }

  static let dataDirectory = FileManager.default
    .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("Dump/Notebooks", isDirectory: true)

  init() throws {
    engine = try Engine(directory: AppModel.dataDirectory)
    shortcut =
      defaults.data(forKey: Keys.shortcut).flatMap { try? JSONDecoder().decode(Shortcut.self, from: $0) }
      ?? .standard
    webAppOrigin = defaults.string(forKey: Keys.origin)
    engine.ownerKey = { [keys] in keys.read($0) }
    engine.origin = { [weak self] url in self?.origin(for: url) ?? ClientOrigin.standard(for: url) }
    engine.onChange = { [weak self] in self?.refresh() }
  }

  /// Opens the saved notebook, or starts one on this Mac so capture works right away.
  func start() async {
    let saved = profiles.active
    if saved == nil { firstRun = true }
    let profile = saved ?? Profile(server: nil)
    if saved == nil { profiles.activate(profile) }
    await open(profile)
  }

  private func open(_ profile: Profile) async {
    self.profile = profile
    do {
      try await engine.open(profile)
      openError = nil
    } catch {
      openError = error.localizedDescription
    }
    refresh()
  }

  private func refresh() {
    snapshot = engine.snapshot() ?? .closed
    if let chosen = chosenList, snapshot.list(chosen) == nil { chosenList = nil }
  }

  // MARK: Capture

  /// The list the draft's own `!list` prefix names, which wins over the chosen one.
  var prefixList: String? { engine.list(forDraft: draft) }
  var targetList: String? { prefixList ?? chosenList }

  /// Saves the draft. Returns what was saved, or nil (with `captureError` set) when nothing was.
  func capture() -> Captured? {
    guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    do {
      let captured = try engine.capture(draft, list: chosenList)
      draft = ""
      chosenList = nil
      captureError = nil
      return captured
    } catch {
      captureError = error.localizedDescription
      return nil
    }
  }

  /// Moves the chosen list by `step` through Inbox and the lists, wrapping around.
  func cycleList(_ step: Int) {
    let choices: [String?] = [nil] + snapshot.lists.map(\.id)
    let index = choices.firstIndex(of: chosenList) ?? 0
    chosenList = choices[(index + step + choices.count) % choices.count]
  }

  /// ⌘0 is Inbox; ⌘1–⌘9 are the lists in order.
  func pickList(_ number: Int) {
    if number == 0 { chosenList = nil } else if number <= snapshot.lists.count {
      chosenList = snapshot.lists[number - 1].id
    }
  }

  // MARK: Servers

  var server: ServerLocation? { profile?.server }

  func inspect(_ address: String) async throws -> ServerCheck {
    try await engine.inspect(address)
  }

  /// A notebook on this Mac joins the server's (its notes are added there). A synced one switches
  /// to that server's own notebook, reusing a saved one for it.
  func connect(_ check: ServerCheck, key: String) async throws {
    try await engine.verify(check.baseUrl, key: key)
    let next: Profile
    if let profile, profile.server == nil {
      next = Profile(id: profile.id, server: check.location)
    } else {
      next = profiles.profile(for: check.location)
    }
    try keys.save(key, for: next.id, server: check.baseUrl)
    try await switchTo(next)
  }

  /// After the owner key changed on the server: check the new one, then sync again.
  func signIn(key: String) async throws {
    guard let profile, let server = profile.server else { return }
    try await engine.verify(server.baseUrl, key: key)
    try keys.save(key, for: profile.id, server: server.baseUrl)
    engine.reconnect()
  }

  /// Closes the open notebook (saving it; a failure keeps it open) and opens another.
  func switchTo(_ next: Profile) async throws {
    try await engine.close()
    draft = ""
    chosenList = nil
    profiles.activate(next)
    await open(next)
  }

  func origin(for server: URL) -> String {
    webAppOrigin ?? ClientOrigin.standard(for: server)
  }

  /// The web app this Mac presents itself as, to open the full notebook in a browser.
  var webAppURL: URL? {
    let fallback = server.flatMap { URL(string: $0.baseUrl) }.map(ClientOrigin.standard(for:))
    return URL(string: webAppOrigin ?? fallback ?? ClientOrigin.hosted)
  }

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
  /// One line for the panel footer and the menu.
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
