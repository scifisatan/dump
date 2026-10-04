import AppKit
import DumpKit
import SwiftUI

/// The notebook window's content, the web app natively: the inbox, lists and Done in the sidebar,
/// dumps grouped by day, and a composer pinned below them. As on the web, the newest dumps sit at
/// the bottom, next to the composer.
struct NotebookView: View {
  @Bindable var model: AppModel
  @Bindable var state: NotebookState
  var openSettings: () -> Void
  /// Sets the window title, which `navigationTitle` does not reach from an AppKit-hosted window.
  var setTitle: (String) -> Void = { _ in }

  private var title: String {
    let snapshot = model.snapshot
    if !state.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Search" }
    switch state.place {
    case .list(let id): return snapshot.list(id)?.label ?? "Inbox"
    case .done: return "Done"
    case .inbox, nil: return "Inbox"
    }
  }

  var body: some View {
    NavigationSplitView {
      Sidebar(model: model, state: state, openSettings: openSettings)
        .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 320)
    } detail: {
      Detail(model: model, state: state, openSettings: openSettings)
    }
    .searchable(text: $state.query, placement: .sidebar, prompt: "Search")
    .onChange(of: title, initial: true) { setTitle(title) }
    .frame(minWidth: 640, minHeight: 420)
    .sheet(item: $state.editing) { editing in
      ListEditor(model: model, editing: editing) { list in
        if case .new = editing { state.place = .list(list.id) }
      }
    }
    .sheet(isPresented: $state.sortingInbox) { SortInbox(model: model) }
    .alert(
      "That didn’t work",
      isPresented: Binding(
        get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
    ) {
      Button("OK") {}
    } message: {
      Text(model.actionError ?? "")
    }
    // A list deleted here or on another device leaves its view for the inbox.
    .onChange(of: model.snapshot.lists) {
      if case .list(let id) = state.place, model.snapshot.list(id) == nil { state.place = .inbox }
    }
  }
}

// MARK: Sidebar

private struct Sidebar: View {
  let model: AppModel
  @Bindable var state: NotebookState
  var openSettings: () -> Void
  @State private var deleting: Snapshot.List?

  var body: some View {
    let snapshot = model.snapshot
    let open = snapshot.dumps.filter { !$0.done }
    List(selection: $state.place) {
      Label("Inbox", systemImage: "tray")
        .badge(open.count)
        .tag(Place.inbox)
      Section("Lists") {
        ForEach(snapshot.lists) { list in
          Label {
            Text(list.label)
          } icon: {
            ListDot(color: list.color)
          }
          .badge(open.filter { $0.list == list.id }.count)
          .tag(Place.list(list.id))
          .contextMenu {
            Button("Edit List…") { state.editing = .edit(list) }
            Button("Delete List…", role: .destructive) { deleting = list }
          }
        }
      }
      Section {
        Label("Done", systemImage: "checkmark.circle")
          .badge(snapshot.dumps.count - open.count)
          .tag(Place.done)
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(alignment: .leading, spacing: 10) {
        Button {
          state.editing = .new
        } label: {
          Label("New List", systemImage: "plus.circle")
        }
        .buttonStyle(.borderless)
        .disabled(!snapshot.ready)
        SyncStatus(model: model, openSettings: openSettings)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
    }
    // Choosing a view leaves a search.
    .onChange(of: state.place) { state.query = "" }
    .confirmationDialog(
      "Delete “\(deleting?.label ?? "")”?",
      isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      presenting: deleting
    ) { list in
      Button("Delete List", role: .destructive) {
        do { try model.engine.deleteList(list.id) } catch { model.actionError = error.localizedDescription }
      }
    } message: { _ in
      Text("Its dumps go back to the inbox to be sorted again. This can’t be undone.")
    }
  }
}

private struct SyncStatus: View {
  let model: AppModel
  var openSettings: () -> Void

  var body: some View {
    let sync = model.snapshot.sync
    HStack(spacing: 6) {
      Button(action: openSettings) {
        HStack(spacing: 6) {
          Circle().fill(Color(nsColor: sync.tint)).frame(width: 7, height: 7)
          Text(sync.label).lineLimit(1).truncationMode(.tail)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help(model.snapshot.syncError ?? model.server?.baseUrl ?? "Open Settings to connect your server")
      if sync == .error {
        Button("Retry") { model.engine.resume() }.buttonStyle(.link)
      }
    }
    .font(.caption)
    .foregroundStyle(.secondary)
  }
}

// MARK: Detail

private struct Detail: View {
  @Bindable var model: AppModel
  @Bindable var state: NotebookState
  var openSettings: () -> Void
  @State private var confirmingClear = false

  var body: some View {
    let snapshot = model.snapshot
    let place = resolved(state.place, in: snapshot)
    let list = place.list.flatMap(snapshot.list)
    let query = state.query.trimmingCharacters(in: .whitespacesAndNewlines)
    let searching = !query.isEmpty
    let items = searching ? Self.matches(query, in: snapshot) : Self.items(in: place, of: snapshot)
    let done = snapshot.dumps.filter(\.done).count
    let unfiled = snapshot.dumps.filter { !$0.done && $0.list == nil && !$0.sorting }.count

    VStack(spacing: 0) {
      if !snapshot.ready {
        ProgressView("Opening your notebook…").frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if items.isEmpty {
        EmptyNotebook(place: place, list: list, query: searching ? query : nil)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        DumpList(model: model, state: state, items: items, searching: searching, showList: list == nil)
          // A fresh list per view, so selection and scrolling start over.
          .id(searching ? "search" : "\(place)")
      }
      // Done holds only finished dumps, so it has no composer, as on the web.
      if !searching && place != .done { Composer(model: model, list: list?.id) }
    }
    .navigationSubtitle(items.count == 1 ? "1 dump" : "\(items.count) dumps")
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        if !searching {
          switch place {
          case .inbox where unfiled > 0:
            Button {
              state.sortingInbox = true
            } label: {
              Label("Sort Inbox", systemImage: "sparkles")
            }
            .labelStyle(.titleAndIcon)
            .help("Give each unfiled dump a list, one at a time")
          case .list:
            if let list {
              Button {
                state.editing = .edit(list)
              } label: {
                Label("Edit List", systemImage: "pencil")
              }
              .help("Rename, recolor or delete this list")
            }
          case .done where done > 0:
            Button {
              confirmingClear = true
            } label: {
              Label("Clear Done", systemImage: "trash")
            }
            .labelStyle(.titleAndIcon)
            .help("Remove every done dump")
          default:
            EmptyView()
          }
        }
      }
      ToolbarItem(placement: .primaryAction) {
        Button(action: openSettings) {
          Label("Settings", systemImage: "gearshape")
        }
        .help("Settings (⌘,)")
      }
    }
    .confirmationDialog(
      done == 1 ? "Clear 1 done dump?" : "Clear \(done) done dumps?", isPresented: $confirmingClear
    ) {
      Button("Clear Done", role: .destructive) { model.clearDone() }
    } message: {
      Text("They’re removed from every device. This can’t be undone.")
    }
  }

  /// The selected view, or the inbox when nothing is selected or its list is gone.
  private func resolved(_ place: Place?, in snapshot: Snapshot) -> Place {
    if case .list(let id) = place, snapshot.list(id) == nil { return .inbox }
    return place ?? .inbox
  }

  /// A view's dumps, oldest first, so the newest sit next to the composer.
  static func items(in place: Place, of snapshot: Snapshot) -> [Snapshot.Item] {
    snapshot.dumps.filter { item in
      switch place {
      case .inbox: !item.done
      case .list(let id): !item.done && item.list == id
      case .done: item.done
      }
    }
    .reversed()
  }

  /// Dumps whose text, tags or list contain every word of the query, newest first.
  static func matches(_ query: String, in snapshot: Snapshot) -> [Snapshot.Item] {
    let words = query.split(whereSeparator: \.isWhitespace).map(String.init)
    return snapshot.dumps.filter { item in
      let list = snapshot.list(item.list)?.label ?? "Inbox"
      let haystack = ([item.text, list] + item.tags.map { "#\($0)" }).joined(separator: " ")
      return words.allSatisfy { haystack.localizedStandardContains($0) }
    }
  }
}

extension Place {
  var list: String? {
    if case .list(let id) = self { id } else { nil }
  }
}

private struct EmptyNotebook: View {
  let place: Place
  let list: Snapshot.List?
  let query: String?

  var body: some View {
    if let query {
      ContentUnavailableView.search(text: query)
    } else if let list {
      // `!list` names a list by its label with hyphens for spaces (listPrefix in schema.ts).
      let prefix = list.label.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: "-")
      ContentUnavailableView(
        "Room for something good.", systemImage: "square.dashed",
        description: Text("Dump something here, or type !\(prefix) anywhere."))
    } else if place == .done {
      ContentUnavailableView(
        "Small wins will live here.", systemImage: "checkmark.circle",
        description: Text("Check off a thought when you’re finished with it."))
    } else {
      ContentUnavailableView(
        "A clear inbox. A clearer head.", systemImage: "tray",
        description: Text("Drop a thought, a link, or that thing you don’t want to forget."))
    }
  }
}

// MARK: Dumps

/// Dumps by day. Select with a click; Space marks done, 0–9 move to the inbox or a list, Delete
/// removes, Return opens a link (or, in a search, the dump's own view). Everything is also in
/// the context menu.
private struct DumpList: View {
  let model: AppModel
  @Bindable var state: NotebookState
  let items: [Snapshot.Item]
  let searching: Bool
  let showList: Bool
  @State private var selection = Set<String>()
  @State private var removing: [Snapshot.Item] = []

  var body: some View {
    let snapshot = model.snapshot
    ScrollViewReader { proxy in
      List(selection: $selection) {
        ForEach(Day.group(items)) { day in
          Section(day.label) {
            ForEach(day.items) { item in
              DumpRow(
                item: item, list: showList ? snapshot.list(item.list) : nil,
                toggle: { model.setDone([item.id], !item.done) },
                search: { state.query = "#\($0)" }
              )
              .tag(item.id)
            }
          }
        }
      }
      .contextMenu(forSelectionType: String.self) { ids in
        ItemActions(
          model: model, items: chosen(ids), searching: searching, reveal: reveal, remove: remove)
      } primaryAction: { ids in
        open(chosen(ids))
      }
      .onDeleteCommand { remove(chosen(selection)) }
      .onCopyCommand { chosen(selection).map { NSItemProvider(object: $0.text as NSString) } }
      .onKeyPress(.space) {
        let items = chosen(selection)
        guard !items.isEmpty else { return .ignored }
        model.setDone(items.map(\.id), !items.allSatisfy(\.done))
        return .handled
      }
      .onKeyPress(characters: .decimalDigits, phases: .down) { press in
        let items = chosen(selection)
        guard press.modifiers.subtracting(.numericPad).isEmpty, !items.isEmpty,
          let number = Int(press.characters)
        else { return .ignored }
        let lists = model.snapshot.lists
        guard number <= lists.count else { return .ignored }
        model.file(items.map(\.id), to: number == 0 ? nil : lists[number - 1].id)
        return .handled
      }
      .onAppear {
        // After the first layout, or the list has nothing to scroll yet.
        DispatchQueue.main.async {
          if let id = state.reveal, items.contains(where: { $0.id == id }) {
            selection = [id]
            proxy.scrollTo(id, anchor: .center)
          } else if !searching, let last = items.last {
            proxy.scrollTo(last.id, anchor: .bottom)
          }
          state.reveal = nil
        }
      }
      // Follow new dumps as they arrive at the bottom.
      .onChange(of: items.last?.id) { _, last in
        if !searching, let last { proxy.scrollTo(last, anchor: .bottom) }
      }
    }
    .confirmationDialog(
      "Remove \(removing.count) dumps?",
      isPresented: Binding(get: { !removing.isEmpty }, set: { if !$0 { removing = [] } })
    ) {
      Button("Remove \(removing.count) Dumps", role: .destructive) {
        model.remove(removing.map(\.id))
      }
    } message: {
      Text("They’re removed from every device. This can’t be undone.")
    }
  }

  /// The selected dumps still in this view; one may have moved away since it was selected.
  private func chosen(_ ids: Set<String>) -> [Snapshot.Item] {
    items.filter { ids.contains($0.id) }
  }

  /// Removing one dump is immediate, as on the web; several ask first.
  private func remove(_ items: [Snapshot.Item]) {
    if items.count > 1 { removing = items } else { model.remove(items.map(\.id)) }
  }

  private func open(_ items: [Snapshot.Item]) {
    if searching, items.count == 1 { return reveal(items[0]) }
    for case let url? in items.map({ $0.url.flatMap(URL.init(string:)) }) {
      NSWorkspace.shared.open(url)
    }
  }

  /// Leaves the search for the dump's own view, with the dump selected.
  private func reveal(_ item: Snapshot.Item) {
    state.reveal = item.id
    state.place = item.done ? .done : item.list.map(Place.list) ?? .inbox
    state.query = ""
  }
}

private struct DumpRow: View {
  let item: Snapshot.Item
  /// The dump's list, shown where dumps of several lists mix.
  let list: Snapshot.List?
  let toggle: () -> Void
  let search: (String) -> Void

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Button(action: toggle) {
        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 15))
          .foregroundStyle(item.done ? Color.accentColor : Color.secondary)
      }
      .buttonStyle(.plain)
      .help(item.done ? "Mark as not done" : "Mark as done")
      .accessibilityLabel(item.done ? "Mark as not done" : "Mark as done")
      VStack(alignment: .leading, spacing: 4) {
        Text(item.text)
          .strikethrough(item.done)
          .foregroundStyle(item.done ? .secondary : .primary)
          .fixedSize(horizontal: false, vertical: true)
        if list != nil || item.sorting || !item.tags.isEmpty || item.url != nil {
          HStack(spacing: 10) {
            if let list {
              HStack(spacing: 5) {
                ListDot(color: list.color, size: 6)
                Text(list.label)
              }
            } else if item.sorting {
              Text("Sorting…")
            }
            ForEach(item.tags, id: \.self) { tag in
              Button("#\(tag)") { search(tag) }
                .buttonStyle(.link)
                .help("Search for #\(tag)")
            }
            if let url = item.url.flatMap(URL.init(string:)) {
              Button {
                NSWorkspace.shared.open(url)
              } label: {
                HStack(spacing: 2) {
                  Text(Self.host(url))
                  Image(systemName: "arrow.up.right").imageScale(.small)
                }
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(RoundedRectangle(cornerRadius: 4).fill(Color.primary.opacity(0.06)))
              }
              .buttonStyle(.plain)
              .help(url.absoluteString)
            }
          }
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      Text(Self.time(item.created))
        .font(.caption)
        .monospacedDigit()
        .foregroundStyle(.tertiary)
        .help(item.created.formatted(date: .complete, time: .shortened))
    }
    .padding(.vertical, 3)
  }

  static func host(_ url: URL) -> String {
    let host = url.host() ?? url.absoluteString
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
  }

  /// Rows sit under a day heading, so today's show a short age and older ones their time.
  static func time(_ date: Date, now: Date = .now) -> String {
    guard Calendar.current.isDateInToday(date) else { return date.formatted(date: .omitted, time: .shortened) }
    let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
    if minutes < 1 { return "now" }
    if minutes < 60 { return "\(minutes)m" }
    return "\(minutes / 60)h"
  }
}

/// The context menu for one or more selected dumps.
private struct ItemActions: View {
  let model: AppModel
  let items: [Snapshot.Item]
  let searching: Bool
  let reveal: (Snapshot.Item) -> Void
  let remove: ([Snapshot.Item]) -> Void

  var body: some View {
    if !items.isEmpty {
      let urls = items.compactMap { $0.url.flatMap(URL.init(string:)) }
      if !urls.isEmpty {
        Button(urls.count == 1 ? "Open Link" : "Open \(urls.count) Links") {
          urls.forEach { NSWorkspace.shared.open($0) }
        }
      }
      if searching, let item = items.first, items.count == 1 {
        Button("Show in \(item.done ? "Done" : model.snapshot.list(item.list)?.label ?? "Inbox")") {
          reveal(item)
        }
      }
      if !urls.isEmpty || (searching && items.count == 1) { Divider() }
      let done = items.allSatisfy(\.done)
      Button(done ? "Mark as Not Done" : "Mark as Done") { model.setDone(items.map(\.id), !done) }
        .keyboardShortcut(.space, modifiers: [])
      Menu("Move To") {
        move("Inbox", to: nil, key: "0")
        ForEach(Array(model.snapshot.lists.enumerated()), id: \.element.id) { index, list in
          move(list.label, to: list.id, key: index < 9 ? Character(String(index + 1)) : nil)
        }
      }
      Button("Copy") {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(items.map(\.text).joined(separator: "\n\n"), forType: .string)
      }
      .keyboardShortcut("c")
      Divider()
      Button(items.count == 1 ? "Remove" : "Remove \(items.count) Dumps", role: .destructive) {
        remove(items)
      }
      .keyboardShortcut(.delete, modifiers: [])
    }
  }

  @ViewBuilder
  private func move(_ title: String, to list: String?, key: Character?) -> some View {
    let toggle = Toggle(
      title,
      isOn: Binding(
        get: { items.allSatisfy { $0.list == list } },
        set: { _ in model.file(items.map(\.id), to: list) }))
    if let key { toggle.keyboardShortcut(KeyEquivalent(key), modifiers: []) } else { toggle }
  }
}

/// One day's dumps, under a heading like the web app's.
private struct Day: Identifiable {
  let start: Date
  var items: [Snapshot.Item]

  var id: Date { start }

  var label: String {
    let calendar = Calendar.current
    if calendar.isDateInToday(start) { return "Today" }
    if calendar.isDateInYesterday(start) { return "Yesterday" }
    let style = Date.FormatStyle.dateTime.weekday(.wide).month(.wide).day()
    return calendar.isDate(start, equalTo: .now, toGranularity: .year)
      ? start.formatted(style) : start.formatted(style.year())
  }

  /// Items come sorted by time, so each day's are contiguous.
  static func group(_ items: [Snapshot.Item]) -> [Day] {
    var days: [Day] = []
    for item in items {
      let start = Calendar.current.startOfDay(for: item.created)
      if days.last?.start == start { days[days.count - 1].items.append(item) } else {
        days.append(Day(start: start, items: [item]))
      }
    }
    return days
  }
}

// MARK: Composer

/// Captures into the view's list (the inbox leaves filing to `!list` or Jev). A `!list` prefix
/// still wins, as in the panel.
private struct Composer: View {
  let model: AppModel
  let list: String?
  @State private var draft = ""
  /// Where the last dump went when that is not this view.
  @State private var savedTo: String?
  @State private var error: String?

  private static let font = NSFont.systemFont(ofSize: 14)

  var body: some View {
    let snapshot = model.snapshot
    let target = snapshot.list(model.engine.list(forDraft: draft) ?? list)
    let blank = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .bottom, spacing: 8) {
        ZStack(alignment: .topLeading) {
          if draft.isEmpty {
            Text("What’s on your mind?")
              .font(Font(Self.font))
              .foregroundStyle(.tertiary)
              .allowsHitTesting(false)
          }
          CaptureEditor(text: $draft, font: Self.font, maxLines: 6, onSubmit: submit)
        }
        .padding(.vertical, 8)
        .padding(.leading, 12)
        Button(action: submit) {
          Image(systemName: "arrow.up.circle.fill").font(.system(size: 22))
        }
        .buttonStyle(.plain)
        .foregroundStyle(blank ? Color.secondary : Color.accentColor)
        .disabled(blank || !snapshot.ready)
        .help("Save (↩)")
        .padding(.trailing, 6)
        .padding(.bottom, 5)
      }
      .background(
        RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(nsColor: .textBackgroundColor))
      )
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.primary.opacity(0.12))
      )
      HStack(spacing: 5) {
        if let error {
          Text(error).foregroundStyle(.red)
        } else if let savedTo {
          Image(systemName: "checkmark.circle.fill")
          Text("Saved to \(savedTo)")
        } else {
          ListDot(color: target?.color, size: 6)
          Text(target?.label ?? "Inbox")
          Text("·  ↩ to save  ·  ⇧↩ for a new line").foregroundStyle(.tertiary)
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      .padding(.horizontal, 4)
    }
    .padding(.horizontal, 16)
    .padding(.top, 10)
    .padding(.bottom, 12)
    .background(.bar)
    .overlay(alignment: .top) { Divider() }
    .onChange(of: draft) { _, text in
      if !text.isEmpty {
        savedTo = nil
        error = nil
      }
    }
  }

  private func submit() {
    guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    do {
      let captured = try model.engine.capture(draft, list: list)
      draft = ""
      error = nil
      // The inbox shows every open dump, so only a list view can lose sight of a new one.
      if let list, captured.list != list {
        savedTo = model.snapshot.list(captured.list)?.label ?? "Inbox"
      }
    } catch {
      self.error = error.localizedDescription
    }
  }
}

/// A list's color dot; hollow for the inbox.
struct ListDot: View {
  let color: String?
  var size: CGFloat = 8

  var body: some View {
    Circle()
      .fill(color.map(Color.init(hex:)) ?? .clear)
      .overlay(Circle().strokeBorder(color == nil ? Color.secondary : .clear, lineWidth: 1))
      .frame(width: size, height: size)
  }
}
