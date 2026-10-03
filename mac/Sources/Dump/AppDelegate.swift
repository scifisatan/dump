import AppKit
import DumpKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private var model: AppModel!
  private var panel: CapturePanelController!
  private var hotKey: HotKey!
  private var statusItem: NSStatusItem!
  private var settings: NSWindow?
  private var terminationSignal: DispatchSourceSignal?
  private let statusLine = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  private let inboxLine = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  private let captureItem = NSMenuItem(title: "Dump Something…", action: #selector(capture), keyEquivalent: "")
  private let syncItem = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "")

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    do {
      model = try AppModel()
    } catch {
      NSApp.activate()
      NSAlert(error: error).runModal()
      NSApp.terminate(nil)
      return
    }
    start()
  }

  /// Wires up the panel, hotkey and menu bar item around the model.
  private func start() {
    panel = CapturePanelController(model: model)
    panel.openSettings = { [weak self] in self?.showSettings() }
    hotKey = HotKey { [weak self] in self?.panel.toggle() }
    model.registerShortcut = { [weak self] in self?.hotKey.register($0) ?? false }
    model.pauseShortcut = { [weak self] paused in
      guard let self else { return }
      if paused { self.hotKey.unregister() } else { self.hotKey.register(self.model.shortcut) }
    }
    model.showPanel = { [weak self] in self?.panel.show() }
    let registered = hotKey.register(model.shortcut)
    setUpStatusItem()
    watchSystem()
    Task {
      await model.start()
      if model.firstRun || !registered { showSettings() }
    }
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard let model else { return .terminateNow }
    // Flush the notebook first, but never hang quitting on it.
    Task {
      try? await model.engine.close()
      finishTerminating()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.finishTerminating() }
    return .terminateLater
  }

  private var terminating = false
  private func finishTerminating() {
    guard !terminating else { return }
    terminating = true
    NSApp.reply(toApplicationShouldTerminate: true)
  }

  // Opening the app again (from Finder or Spotlight) shows the panel.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    panel?.show()
    return false
  }

  // MARK: Menu bar

  private func setUpStatusItem() {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    statusItem.button?.image = Mark.menuBarImage
    statusItem.button?.toolTip = "Dump"
    let menu = NSMenu()
    menu.delegate = self
    menu.autoenablesItems = false
    captureItem.target = self
    syncItem.target = self
    statusLine.isEnabled = false
    inboxLine.isEnabled = false
    menu.addItem(captureItem)
    menu.addItem(.separator())
    menu.addItem(statusLine)
    menu.addItem(inboxLine)
    menu.addItem(syncItem)
    menu.addItem(item("Open Dump on the Web", #selector(openWeb)))
    menu.addItem(.separator())
    menu.addItem(item("Settings…", #selector(showSettings), key: ","))
    menu.addItem(item("Quit Dump", #selector(NSApplication.terminate(_:)), key: "q", target: NSApp))
    statusItem.menu = menu
  }

  private func item(_ title: String, _ action: Selector, key: String = "", target: AnyObject? = nil)
    -> NSMenuItem
  {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = target ?? self
    return item
  }

  func menuNeedsUpdate(_ menu: NSMenu) {
    let snapshot = model.snapshot
    captureItem.title = "Dump Something…  \(model.shortcut.display)"
    let place = model.server.map { " · \($0.host)" } ?? ""
    statusLine.title = snapshot.sync.label + (snapshot.sync == .synced ? place : "")
    statusLine.image = dot(snapshot.sync.tint)
    inboxLine.title = snapshot.inbox == 1 ? "1 dump in the inbox" : "\(snapshot.inbox) dumps in the inbox"
    inboxLine.isHidden = snapshot.inbox == 0
    syncItem.isHidden = model.server == nil
    syncItem.isEnabled = snapshot.sync != .synced && snapshot.sync != .syncing
  }

  private func dot(_ color: NSColor) -> NSImage {
    NSImage(size: NSSize(width: 8, height: 8), flipped: false) { rect in
      color.setFill()
      NSBezierPath(ovalIn: rect).fill()
      return true
    }
  }

  @objc private func capture() { panel.show() }

  @objc private func syncNow() {
    if model.snapshot.sync == .signedOut { showSettings() } else { model.engine.resume() }
  }

  @objc private func openWeb() {
    if let url = model.webAppURL { NSWorkspace.shared.open(url) }
  }

  @objc func showSettings() {
    if settings == nil {
      let window = NSWindow(contentViewController: NSHostingController(rootView: SettingsView(model: model)))
      window.title = "Dump Settings"
      window.styleMask = [.titled, .closable, .miniaturizable]
      window.isReleasedWhenClosed = false
      window.center()
      settings = window
    }
    NSApp.activate()
    settings?.makeKeyAndOrderFront(nil)
  }

  // MARK: System events

  private func watchSystem() {
    let center = NSWorkspace.shared.notificationCenter
    center.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.model.engine.suspend() }
    }
    center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.model.engine.resume() }
    }
    // `kill` and the install script quit with SIGTERM: save the notebook first, as Quit does.
    // Terminating waits on main-queue work (the save), so it must start from the run loop, not
    // from inside this main-queue handler.
    signal(SIGTERM, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    source.setEventHandler { RunLoop.main.perform { NSApp.terminate(nil) } }
    source.resume()
    terminationSignal = source
  }
}
