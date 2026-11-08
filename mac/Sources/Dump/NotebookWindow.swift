import AppKit
import DumpKit
import SwiftUI

enum Place: Hashable {
  case home
  case list(String)
  case done
}

enum ListEditing: Identifiable {
  case new
  case edit(Snapshot.List)

  var id: String {
    switch self {
    case .new: ""
    case .edit(let list): list.id
    }
  }
}

struct DayPicking: Identifiable {
  let ids: [String]
  var id: String { ids.joined(separator: " ") }
}

@MainActor @Observable
final class NotebookState {
  var place = Place.home
  var query = ""
  var draft = ""
  var editing: ListEditing?
  var sortingInbox = false
  var pickingDay: DayPicking?
  var reveal: String?
}

@MainActor
final class NotebookWindowController: NSObject, NSWindowDelegate {
  private let model: AppModel
  private let state = NotebookState()
  private var window: NSWindow?
  var openSettings: () -> Void = {}
  var visibilityChanged: () -> Void = {}

  init(model: AppModel) {
    self.model = model
  }

  var isOpen: Bool { window.map { $0.isVisible || $0.isMiniaturized } ?? false }

  func show(_ place: Place? = nil) {
    if let place {
      state.place = place
      state.query = ""
    }
    let window = window ?? makeWindow()
    model.notebookOpen = true
    window.makeKeyAndOrderFront(nil)
    visibilityChanged()
    NSApp.activate()
  }

  func newList() {
    show()
    state.editing = .new
  }

  /// Edit ▸ Find. SwiftUI offers no way to focus a search field before macOS 15, so this finds
  /// the AppKit field `searchable` draws in the toolbar.
  func focusSearch() {
    show()
    guard let window, let field = window.contentView?.superview?.firstDescendant(of: NSSearchField.self)
    else { return }
    window.makeFirstResponder(field)
  }

  private func makeWindow() -> NSWindow {
    // The window shows its content view controller's title.
    weak var titled: NSViewController?
    let root = NotebookView(
      model: model, state: state, openSettings: { [weak self] in self?.openSettings() },
      setTitle: { titled?.title = $0 })
    let hosting = NSHostingController(rootView: root)
    titled = hosting
    hosting.sizingOptions = [.minSize]
    hosting.sceneBridgingOptions = [.toolbars, .title]
    let window = NSWindow(contentViewController: hosting)
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.setContentSize(NSSize(width: 900, height: 640))
    if !window.setFrameUsingName("Notebook") { window.center() }
    window.setFrameAutosaveName("Notebook")
    self.window = window
    return window
  }

  func windowWillClose(_ notification: Notification) {
    model.notebookOpen = false
    // The window still counts as visible until it has closed.
    DispatchQueue.main.async { [weak self] in self?.visibilityChanged() }
  }
}
