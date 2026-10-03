import AppKit
import Carbon.HIToolbox

/// A global keyboard shortcut. Stored as a key code plus modifiers, with the key's name for display.
struct Shortcut: Codable, Equatable {
  var keyCode: UInt32
  var modifiers: UInt
  var key: String

  static let standard = Shortcut(
    keyCode: UInt32(kVK_Space), modifiers: NSEvent.ModifierFlags([.shift, .command]).rawValue,
    key: "Space")

  var flags: NSEvent.ModifierFlags { NSEvent.ModifierFlags(rawValue: modifiers) }

  var display: String {
    var symbols = ""
    if flags.contains(.control) { symbols += "⌃" }
    if flags.contains(.option) { symbols += "⌥" }
    if flags.contains(.shift) { symbols += "⇧" }
    if flags.contains(.command) { symbols += "⌘" }
    return symbols + key
  }

  fileprivate var carbonModifiers: UInt32 {
    var result: UInt32 = 0
    if flags.contains(.command) { result |= UInt32(cmdKey) }
    if flags.contains(.option) { result |= UInt32(optionKey) }
    if flags.contains(.control) { result |= UInt32(controlKey) }
    if flags.contains(.shift) { result |= UInt32(shiftKey) }
    return result
  }

  /// A shortcut from a key press, or nil when it needs a modifier and has none (plain letters
  /// would fire while typing anywhere).
  init?(event: NSEvent) {
    let flags = event.modifierFlags.intersection([.command, .option, .control, .shift])
    let code = Int(event.keyCode)
    let functionKey = Shortcut.functionKeys[code] != nil
    guard functionKey || !flags.subtracting(.shift).isEmpty else { return nil }
    self.init(
      keyCode: UInt32(code), modifiers: flags.rawValue,
      key: Shortcut.names[code] ?? Shortcut.functionKeys[code]
        ?? event.characters(byApplyingModifiers: [])?.uppercased() ?? "?")
  }

  init(keyCode: UInt32, modifiers: UInt, key: String) {
    self.keyCode = keyCode
    self.modifiers = modifiers
    self.key = key
  }

  private static let names: [Int: String] = [
    kVK_Space: "Space", kVK_Return: "↩", kVK_Tab: "⇥", kVK_Delete: "⌫", kVK_ForwardDelete: "⌦",
    kVK_Escape: "⎋", kVK_LeftArrow: "←", kVK_RightArrow: "→", kVK_UpArrow: "↑",
    kVK_DownArrow: "↓", kVK_Home: "↖", kVK_End: "↘", kVK_PageUp: "⇞", kVK_PageDown: "⇟",
  ]
  private static let functionKeys: [Int: String] = [
    kVK_F1: "F1", kVK_F2: "F2", kVK_F3: "F3", kVK_F4: "F4", kVK_F5: "F5", kVK_F6: "F6",
    kVK_F7: "F7", kVK_F8: "F8", kVK_F9: "F9", kVK_F10: "F10", kVK_F11: "F11", kVK_F12: "F12",
    kVK_F13: "F13", kVK_F14: "F14", kVK_F15: "F15", kVK_F16: "F16", kVK_F17: "F17",
    kVK_F18: "F18", kVK_F19: "F19",
  ]
}

/// One system-wide hotkey through Carbon's RegisterEventHotKey, which needs no Accessibility
/// permission.
final class HotKey {
  private var reference: EventHotKeyRef?
  private var handler: EventHandlerRef?
  private let action: () -> Void

  init(action: @escaping () -> Void) {
    self.action = action
    var spec = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(
      GetApplicationEventTarget(),
      { _, _, userData in
        guard let userData else { return OSStatus(eventNotHandledErr) }
        let hotKey = Unmanaged<HotKey>.fromOpaque(userData).takeUnretainedValue()
        DispatchQueue.main.async { hotKey.action() }
        return noErr
      }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), &handler)
  }

  deinit {
    unregister()
    if let handler { RemoveEventHandler(handler) }
  }

  /// False when the system refused the combination.
  @discardableResult
  func register(_ shortcut: Shortcut) -> Bool {
    unregister()
    let id = EventHotKeyID(signature: OSType(0x4455_4D50), id: 1)  // 'DUMP'
    let status = RegisterEventHotKey(
      shortcut.keyCode, shortcut.carbonModifiers, id, GetApplicationEventTarget(), 0, &reference)
    return status == noErr
  }

  func unregister() {
    if let reference { UnregisterEventHotKey(reference) }
    reference = nil
  }
}
