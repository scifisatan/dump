import AppKit
import DumpKit
import SwiftUI

/// A borderless floating panel that takes keystrokes without activating the app, so the app you
/// were in stays frontmost, as with Spotlight. Escape or clicking elsewhere dismisses it.
final class CapturePanel: NSPanel {
  var onDismiss: (() -> Void)?

  init() {
    super.init(
      contentRect: NSRect(x: 0, y: 0, width: CaptureView.width, height: 160),
      styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView], backing: .buffered,
      defer: true)
    isFloatingPanel = true
    level = .floating
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
    backgroundColor = .clear
    isOpaque = false
    hasShadow = true
    hidesOnDeactivate = false
    animationBehavior = .utilityWindow
    isReleasedWhenClosed = false
  }

  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }

  override func cancelOperation(_ sender: Any?) {
    onDismiss?()
  }

  override func resignKey() {
    super.resignKey()
    onDismiss?()
  }
}

@MainActor
final class CapturePanelController {
  private let panel = CapturePanel()
  private let model: AppModel
  private let hud = HUD()
  private var size = CGSize(width: CaptureView.width, height: 160)
  private var top: NSPoint?
  private var hiding = false
  var openSettings: () -> Void = {}

  init(model: AppModel) {
    self.model = model
    let root = CaptureView(
      model: model,
      onSubmit: { [weak self] in self?.submit() },
      onCancel: { [weak self] in self?.hide() },
      onSettings: { [weak self] in
        self?.hide()
        self?.openSettings()
      },
      onSize: { [weak self] in self?.resize($0) })
    let hosting = NSHostingView(rootView: root)
    hosting.sizingOptions = []
    panel.contentView = hosting
    panel.onDismiss = { [weak self] in self?.hide() }
  }

  var isVisible: Bool { panel.isVisible }

  func toggle() {
    if panel.isVisible { hide() } else { show() }
  }

  /// Opens on the screen with the pointer, a little above center, like Spotlight.
  func show() {
    let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
    guard let frame = screen?.visibleFrame else { return }
    top = NSPoint(x: frame.midX - size.width / 2, y: frame.maxY - frame.height * 0.2)
    place()
    model.captureError = nil
    panel.makeKeyAndOrderFront(nil)
    focusEditor()
    // Layout may not have created the editor yet on the first open.
    DispatchQueue.main.async { [weak self] in self?.focusEditor() }
    model.engine.resume()
  }

  func hide() {
    guard panel.isVisible, !hiding else { return }
    hiding = true
    panel.orderOut(nil)
    hiding = false
  }

  private func submit() {
    guard let captured = model.capture() else {
      if model.captureError == nil { NSSound.beep() }
      return
    }
    hide()
    let snapshot = model.snapshot
    let list = snapshot.list(captured.list)
    let later: Bool = switch snapshot.sync {
    case .offline, .error, .signedOut: true
    default: false
    }
    hud.show(
      "Saved to \(list?.label ?? "Inbox")\(later ? " · syncs later" : "")",
      color: list.map { Color(hex: $0.color) })
  }

  private func resize(_ newSize: CGSize) {
    guard newSize.height > 0 else { return }
    size = newSize
    if panel.isVisible { place() }
  }

  /// Keeps the top edge fixed while the panel grows or shrinks with its content.
  private func place() {
    guard let top else { return }
    panel.setFrame(
      NSRect(x: top.x, y: top.y - size.height, width: size.width, height: size.height), display: true)
  }

  private func focusEditor() {
    guard let editor = panel.contentView?.firstDescendant(of: EditorTextView.self) else { return }
    panel.makeFirstResponder(editor)
    editor.setSelectedRange(NSRange(location: (editor.string as NSString).length, length: 0))
  }
}

/// A short confirmation near the bottom of the screen after a capture.
@MainActor
final class HUD {
  private let panel: NSPanel
  private var dismissal: DispatchWorkItem?

  init() {
    panel = NSPanel(
      contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.level = .statusBar
    panel.ignoresMouseEvents = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
    panel.isReleasedWhenClosed = false
  }

  func show(_ message: String, color: Color?) {
    let view = NSHostingView(rootView: HUDLabel(message: message, color: color))
    panel.contentView = view
    let size = view.fittingSize
    let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
    guard let frame = screen?.visibleFrame else { return }
    panel.setFrame(
      NSRect(x: frame.midX - size.width / 2, y: frame.minY + frame.height * 0.12, width: size.width, height: size.height),
      display: true)
    let animate = !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    panel.alphaValue = animate ? 0 : 1
    panel.orderFrontRegardless()
    if animate { fade(to: 1) }
    dismissal?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      if animate {
        self.fade(to: 0) { self.panel.orderOut(nil) }
      } else {
        self.panel.orderOut(nil)
      }
    }
    dismissal = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.3, execute: work)
  }

  private func fade(to alpha: CGFloat, then done: (() -> Void)? = nil) {
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.16
      panel.animator().alphaValue = alpha
    } completionHandler: {
      done?()
    }
  }
}

private struct HUDLabel: View {
  let message: String
  let color: Color?

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "checkmark.circle.fill")
        .foregroundStyle(color ?? .secondary)
      Text(message)
        .font(.system(size: 13, weight: .medium))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .background(PanelBackground(radius: 18))
    .clipShape(Capsule())
    .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08)))
    .fixedSize()
  }
}

extension NSView {
  func firstDescendant<T: NSView>(of type: T.Type) -> T? {
    for child in subviews {
      if let match = child as? T ?? child.firstDescendant(of: type) { return match }
    }
    return nil
  }
}
