import AppKit
import DumpKit
import SwiftUI

/// A view of the notebook, as in the web app: the inbox (every open dump), one list, or Done.
enum Place: Hashable {
  case inbox
  case list(String)
  case done
}

/// The list editor's subject: a new list, or one to rename, recolor or delete.
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

/// What the notebook window shows, apart from the notebook itself.
@MainActor @Observable
final class NotebookState {
  /// The sidebar selection; nil (nothing selected) shows the inbox.
  var place: Place? = .inbox
  var query = ""
  var editing: ListEditing?
  var sortingInbox = false
  /// A dump to select and scroll to when its view opens, after "Show in Inbox" from a search.
  var reveal: String?
}

/// The notebook window: browse, search, sort and edit everything captured, as on the web.
@MainActor
final class NotebookWindowController: NSObject, NSWindowDelegate {
  private let model: AppModel
  private let state = NotebookState()
  private var window: NSWindow?
  var openSettings: () -> Void = {}
  /// Called after the window opens or closes; the app shows in the Dock only while it is open.
  var visibilityChanged: () -> Void = {}

  init(model: AppModel) {
    self.model = model
  }

  /// Open, even if minimized to the Dock.
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
  /// the AppKit field `searchable` draws, in the sidebar or the toolbar.
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
