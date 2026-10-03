import AppKit
import Carbon.HIToolbox
import SwiftUI

/// The panel's text box: grows with its text up to a few lines, then scrolls. Return saves,
/// Shift- or Option-Return adds a line, Tab moves through lists, ⌘0–⌘9 pick one, Escape closes.
struct CaptureEditor: NSViewRepresentable {
  @Binding var text: String
  var onSubmit: () -> Void
  var onCancel: () -> Void
  var onCycle: (Int) -> Void
  var onPick: (Int) -> Void

  static let font = NSFont.systemFont(ofSize: 20, weight: .regular)
  static let maxLines: CGFloat = 8

  func makeNSView(context: Context) -> NSScrollView {
    let textView = EditorTextView(usingTextLayoutManager: false)
    textView.delegate = context.coordinator
    textView.font = Self.font
    textView.textColor = .labelColor
    textView.insertionPointColor = .controlAccentColor
    textView.drawsBackground = false
    textView.isRichText = false
    textView.allowsUndo = true
    textView.isAutomaticQuoteSubstitutionEnabled = false
    textView.isAutomaticDashSubstitutionEnabled = false
    textView.isAutomaticTextReplacementEnabled = false
    textView.textContainerInset = .zero
    textView.textContainer?.lineFragmentPadding = 0
    textView.textContainer?.widthTracksTextView = true
    textView.isVerticallyResizable = true
    textView.autoresizingMask = [.width]
    textView.setAccessibilityLabel("Dump")

    let scrollView = NSScrollView()
    scrollView.drawsBackground = false
    scrollView.hasVerticalScroller = true
    scrollView.autohidesScrollers = true
    scrollView.scrollerStyle = .overlay
    scrollView.documentView = textView
    return scrollView
  }

  func updateNSView(_ scrollView: NSScrollView, context: Context) {
    context.coordinator.parent = self
    guard let textView = scrollView.documentView as? EditorTextView else { return }
    textView.handlers = (onSubmit, onCancel, onCycle, onPick)
    if textView.string != text { textView.string = text }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
    guard let textView = nsView.documentView as? NSTextView, let container = textView.textContainer,
      let layout = textView.layoutManager
    else { return nil }
    let width = proposal.width ?? 560
    container.containerSize = NSSize(width: width, height: .greatestFiniteMagnitude)
    layout.ensureLayout(for: container)
    let line = layout.defaultLineHeight(for: Self.font)
    let height = min(max(layout.usedRect(for: container).height, line), line * Self.maxLines)
    return CGSize(width: width, height: ceil(height))
  }

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

  final class Coordinator: NSObject, NSTextViewDelegate {
    var parent: CaptureEditor
    init(parent: CaptureEditor) { self.parent = parent }

    func textDidChange(_ notification: Notification) {
      guard let textView = notification.object as? NSTextView else { return }
      parent.text = textView.string
    }
  }
}

final class EditorTextView: NSTextView {
  var handlers: (submit: () -> Void, cancel: () -> Void, cycle: (Int) -> Void, pick: (Int) -> Void)?

  override func keyDown(with event: NSEvent) {
    // Input methods compose with Return and Tab; let them finish first.
    guard !hasMarkedText(), let handlers else { return super.keyDown(with: event) }
    let flags = event.modifierFlags.intersection([.shift, .option, .command, .control])
    switch Int(event.keyCode) {
    case kVK_Return, kVK_ANSI_KeypadEnter:
      if flags.contains(.shift) || flags.contains(.option) { insertNewline(nil) } else { handlers.submit() }
    case kVK_Tab where flags.subtracting(.shift).isEmpty:
      handlers.cycle(flags.contains(.shift) ? -1 : 1)
    default:
      super.keyDown(with: event)
    }
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    let flags = event.modifierFlags.intersection([.shift, .option, .command, .control])
    if flags == .command, let digit = event.charactersIgnoringModifiers.flatMap(Int.init),
      (0...9).contains(digit)
    {
      handlers?.pick(digit)
      return true
    }
    return super.performKeyEquivalent(with: event)
  }

  override func cancelOperation(_ sender: Any?) {
    handlers?.cancel()
  }
}
