import AppKit
import DumpKit
import SwiftUI

/// The notebook window's content, the web app natively: home (older dumps by day, then Today just
/// above the composer), one list, or Done, with no sidebar. Lists and Done open from the toolbar's
/// Lists menu or a dump's list name; search is in the toolbar. As on the web, the newest dumps sit
/// at the bottom, next to the composer.
struct NotebookView: View {
  @Bindable var model: AppModel
  @Bindable var state: NotebookState
  var openSettings: () -> Void
  /// Sets the window title, which `navigationTitle` does not reach from an AppKit-hosted window.
  var setTitle: (String) -> Void = { _ in }

  private var title: String {
    if !state.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Search" }
    switch state.place {
    case .list(let id): return model.snapshot.list(id)?.label ?? "Dump"
    case .done: return "Done"
    case .home: return "Dump"
    }
  }

  var body: some View {
    Detail(model: model, state: state, openSettings: openSettings)
      .searchable(text: $state.query, placement: .toolbar, prompt: "Search")
      .onChange(of: title, initial: true) { setTitle(title) }
      .frame(minWidth: 520, minHeight: 420)
      .sheet(item: $state.editing) { editing in
        ListEditor(model: model, editing: editing) { list in
          if case .new = editing { state.place = .list(list.id) }
        }
      }
      .sheet(isPresented: $state.sortingInbox) { SortInbox(model: model) }
      .sheet(item: $state.pickingDay) { picking in PickDay(model: model, ids: picking.ids) }
      .alert(
        "That didn’t work",
        isPresented: Binding(
          get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
      ) {
        Button("OK") {}
      } message: {
        Text(model.actionError ?? "")
      }
      // A list deleted here or on another device leaves its view for home.
      .onChange(of: model.snapshot.lists) {
        if case .list(let id) = state.place, model.snapshot.list(id) == nil { state.place = .home }
      }
      // Choosing a view leaves a search.
      .onChange(of: state.place) { state.query = "" }
  }
}

// MARK: Toolbar

/// The sync state beside Settings, shown only while it needs attention: offline, paused, signed out
/// or unable to save. It opens Settings, or retries a paused sync.
private struct SyncNotice: View {
  let model: AppModel
  var openSettings: () -> Void

  static func needed(_ snapshot: Snapshot) -> Bool {
    snapshot.storageError != nil || [.offline, .error, .signedOut].contains(snapshot.sync)
  }

  var body: some View {
    let snapshot = model.snapshot
    let sync = snapshot.sync
    Button {
      if sync == .error { model.engine.resume() } else { openSettings() }
    } label: {
      HStack(spacing: 5) {
        Circle()
          .fill(snapshot.storageError == nil ? Color(nsColor: sync.tint) : .red)
          .frame(width: 7, height: 7)
        Text(snapshot.storageError ?? sync.label).lineLimit(1)
      }
    }
    .help(sync == .error ? "\(snapshot.syncError ?? sync.label). Click to retry." : snapshot.syncError ?? "Open Settings")
  }
}

/// The way to the lists and Done, as the web app's search does it.
private struct ListsMenu: View {
  let model: AppModel
  @Bindable var state: NotebookState
  @State private var deleting: Snapshot.List?

  var body: some View {
    let snapshot = model.snapshot
    Menu {
      Button("Home") { state.place = .home }
      Divider()
      ForEach(snapshot.lists) { list in
        Button {
          state.place = .list(list.id)
        } label: {
          Label {
            Text(list.label)
          } icon: {
            Image(systemName: "circle.fill").foregroundStyle(Color(hex: list.color))
          }
        }
      }
      Divider()
      Button("Done") { state.place = .done }
      Divider()
      Button("New List…") { state.editing = .new }
        .disabled(!snapshot.ready)
    } label: {
      Label("Lists", systemImage: "list.bullet")
    }
    .help("Open a list, Done, or make a new list")
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
    let place = state.place
    let list = place.list.flatMap(snapshot.list)
    let query = state.query.trimmingCharacters(in: .whitespacesAndNewlines)
    let searching = !query.isEmpty
    let sections =
      searching
      ? Day.group(Self.matches(query, in: snapshot))
      : place == .home ? Self.home(snapshot) : Day.group(Self.items(in: place, of: snapshot))
    let count = sections.reduce(0) { $0 + $1.items.count }
    let done = snapshot.dumps.filter(\.done).count
    let unfiled = snapshot.dumps.filter { !$0.done && $0.list == nil && !$0.sorting }.count

    VStack(spacing: 0) {
      if !snapshot.ready {
        ProgressView("Opening your notebook…").frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if count == 0 && (searching || place != .home) {
        EmptyNotebook(list: list, query: searching ? query : nil)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        DumpList(
          model: model, state: state, sections: sections, searching: searching,
          showList: list == nil, doneCount: place == .home && !searching ? done : 0
        )
        // A fresh list per view, so selection and scrolling start over.
        .id(searching ? "search" : "\(place)")
      }
      // Done holds only finished dumps, so it has no composer, as on the web.
      if !searching && place != .done { Composer(model: model, state: state, list: list?.id) }
    }
    .navigationSubtitle(
      place == .home && !searching ? Self.summary(snapshot) : count == 1 ? "1 dump" : "\(count) dumps"
    )
    .toolbar {
      ToolbarItem(placement: .navigation) {
        if place == .home {
          DumpMark().frame(width: 22, height: 22).rotationEffect(.degrees(-5))
        } else {
          Button {
            state.place = .home
          } label: {
            Label("Home", systemImage: "chevron.left")
          }
          .help("Back to home")
        }
      }
      ToolbarItemGroup(placement: .primaryAction) {
        if !searching {
          switch place {
          case .home where unfiled > 0:
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
        ListsMenu(model: model, state: state)
        if SyncNotice.needed(snapshot) { SyncNotice(model: model, openSettings: openSettings) }
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

  /// Home, as the engine groups it: older undated dumps by day, Today's heading, then Today's
  /// sections.
  static func home(_ snapshot: Snapshot) -> [DumpSection] {
    let byId = Dictionary(snapshot.dumps.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let items = { (ids: [String]) in ids.compactMap { byId[$0] } }
    let home = snapshot.home
    var sections = Day.group(items(home.earlier))
    let quiet = [home.overdue, home.due, home.upcoming, home.dumped].allSatisfy(\.isEmpty)
    sections.append(DumpSection(id: DumpList.todayID, title: summary(snapshot), today: true, quiet: quiet))
    for (id, title, ids) in [
      ("overdue", "Overdue", home.overdue), ("due", "Due Today", home.due),
      ("upcoming", "Coming Up", home.upcoming), ("dumped", "Dumped Today", home.dumped),
    ] where !ids.isEmpty {
      sections.append(DumpSection(id: id, title: title, overdue: id == "overdue", items: items(ids)))
    }
    return sections
  }

  /// "Saturday, October 17 · 1 overdue · 1 due today", or only the date when Today is empty.
  static func summary(_ snapshot: Snapshot) -> String {
    let date = Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day())
    let home = snapshot.home
    if [home.overdue, home.due, home.upcoming, home.dumped].allSatisfy(\.isEmpty) { return date }
    let overdue = snapshot.home.overdue.isEmpty ? "" : " · \(snapshot.home.overdue.count) overdue"
    let due = snapshot.home.due.isEmpty ? "Nothing" : "\(snapshot.home.due.count)"
    return "\(date)\(overdue) · \(due) due today"
  }

  /// A view's dumps, oldest first, so the newest sit next to the composer.
  static func items(in place: Place, of snapshot: Snapshot) -> [Snapshot.Item] {
    snapshot.dumps.filter { item in
      switch place {
      case .home: !item.done
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

/// A search with no results, an empty list, or an empty Done. Home always ends in Today instead.
private struct EmptyNotebook: View {
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
    } else {
      ContentUnavailableView(
        "Small wins will live here.", systemImage: "checkmark.circle",
        description: Text("Check off a thought when you’re finished with it."))
    }
  }
}

// MARK: Dumps

/// A titled run of dumps: a day, or one of Today's sections. `today` marks Today's heading, which
/// has no dumps of its own and shows `title` as its summary.
struct DumpSection: Identifiable {
  let id: String
  let title: String
  var overdue = false
  var today = false
  /// Today has nothing in it yet.
  var quiet = false
  var items: [Snapshot.Item] = []
}

/// Dumps in sections. Select with a click; Space marks done, 0–9 move to the inbox or a list,
/// Delete removes, Return opens a link (or, in a search, the dump's own view). Everything is also
/// in the context menu.
private struct DumpList: View {
  static let todayID = "today"

  let model: AppModel
  @Bindable var state: NotebookState
  let sections: [DumpSection]
  let searching: Bool
  let showList: Bool
  /// Home links to Done at its very top.
  let doneCount: Int
  @State private var selection = Set<String>()
  @State private var removing: [Snapshot.Item] = []

  private var items: [Snapshot.Item] { sections.flatMap(\.items) }

  var body: some View {
    let snapshot = model.snapshot
    let items = items
    ScrollViewReader { proxy in
      List(selection: $selection) {
        if doneCount > 0 {
          Section {
            Button("\(doneCount) done") { state.place = .done }
              .buttonStyle(.link)
              .frame(maxWidth: .infinity)
              .selectionDisabled()
          }
        }
        ForEach(sections) { section in
          Section {
            if section.today {
              TodayHeading(summary: section.title, quiet: section.quiet) { state.draft = $0 }
                .id(Self.todayID)
            }
            ForEach(section.items) { item in
              DumpRow(
                item: item, list: showList ? snapshot.list(item.list) : nil,
                toggle: { model.setDone([item.id], !item.done) },
                search: { state.query = "#\($0)" },
                openList: { state.place = .list($0) },
                setDue: { model.setDue([item.id], $0) },
                pickDay: { state.pickingDay = DayPicking(ids: [item.id]) }
              )
              .tag(item.id)
            }
          } header: {
            if !section.today {
              Text(section.title).foregroundStyle(section.overdue ? Color.red : Color.secondary)
            }
          }
        }
      }
      .contextMenu(forSelectionType: String.self) { ids in
        ItemActions(
          model: model, state: state, items: chosen(ids), searching: searching, reveal: reveal,
          remove: remove)
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
          } else if sections.contains(where: \.today) {
            // Home opens with Today's heading at the top; when Today is shorter than the window,
            // the scroll stops at the bottom, next to the composer.
            proxy.scrollTo(Self.todayID, anchor: .top)
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
    state.place = item.done ? .done : item.list.map(Place.list) ?? .home
    state.query = ""
  }
}

/// Where Today starts on home: a rule, "Today", and what is due. An empty Today offers example
/// dumps with days; each fills the composer.
private struct TodayHeading: View {
  let summary: String
  let quiet: Bool
  let fill: (String) -> Void

  static let examples = ["Call the bank tomorrow", "Pay rent by friday", "Book the dentist in 3 days"]

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Divider().padding(.bottom, 12)
      Text("Today").font(.title2.weight(.semibold))
      Text(summary).font(.callout).foregroundStyle(.secondary)
      if quiet {
        VStack(spacing: 6) {
          Text("A clear day.").font(.headline)
          Text("Nothing due and nothing dumped yet. Give a dump a day, and it waits for you here when the day comes.")
            .font(.callout)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
          HStack(spacing: 8) {
            ForEach(Self.examples, id: \.self) { example in
              Button {
                fill(example)
              } label: {
                Label(example, systemImage: "calendar")
              }
              .controlSize(.small)
              .help("Put this in the composer")
            }
          }
          .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 16)
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        )
        .padding(.top, 12)
      }
    }
    .padding(.top, 8)
    .padding(.bottom, 4)
    .selectionDisabled()
  }
}

private struct DumpRow: View {
  let item: Snapshot.Item
  /// The dump's list, shown where dumps of several lists mix.
  let list: Snapshot.List?
  let toggle: () -> Void
  let search: (String) -> Void
  let openList: (String) -> Void
  let setDue: (String?) -> Void
  let pickDay: () -> Void

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
        if list != nil || item.sorting || item.due != nil || !item.tags.isEmpty || item.url != nil {
          HStack(spacing: 10) {
            if let due = item.due {
              Menu {
                DayChoices(due: due, set: setDue, pick: pickDay)
              } label: {
                DueBadge(due: due, overdue: Due.overdue(item))
              }
              .menuStyle(.button)
              .buttonStyle(.plain)
              .menuIndicator(.hidden)
              .fixedSize()
              .help("Change the day")
            }
            if let list {
              Button {
                openList(list.id)
              } label: {
                HStack(spacing: 5) {
                  ListDot(color: list.color, size: 6)
                  Text(list.label)
                }
              }
              .buttonStyle(.plain)
              .help("Open \(list.label)")
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

  /// Today's rows show a short age and older ones their time.
  static func time(_ date: Date, now: Date = .now) -> String {
    guard Calendar.current.isDateInToday(date) else { return date.formatted(date: .omitted, time: .shortened) }
    let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
    if minutes < 1 { return "now" }
    if minutes < 60 { return "\(minutes)m" }
    return "\(minutes / 60)h"
  }
}

/// Today, Tomorrow, Pick a Day… and Clear Date, for a dump's day badge and its context menu.
private struct DayChoices: View {
  /// The day the dumps share, if any; it is checked.
  let due: String?
  let set: (String?) -> Void
  let pick: () -> Void
  /// Some of the dumps have a day to clear.
  var dated = true

  var body: some View {
    choice("Today", Due.today)
    choice("Tomorrow", Due.tomorrow)
    Button("Pick a Day…", action: pick)
    if dated {
      Divider()
      Button("Clear Date") { set(nil) }
    }
  }

  private func choice(_ title: String, _ day: String) -> some View {
    Toggle(title, isOn: Binding(get: { due == day }, set: { _ in set(day) }))
  }
}

/// The context menu for one or more selected dumps.
private struct ItemActions: View {
  let model: AppModel
  let state: NotebookState
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
        Button("Show in \(item.done ? "Done" : model.snapshot.list(item.list)?.label ?? "Home")") {
          reveal(item)
        }
      }
      if !urls.isEmpty || (searching && items.count == 1) { Divider() }
      let done = items.allSatisfy(\.done)
      Button(done ? "Mark as Not Done" : "Mark as Done") { model.setDone(items.map(\.id), !done) }
        .keyboardShortcut(.space, modifiers: [])
      let days = Set(items.map(\.due))
      Menu(days == [nil] ? "Set a Date" : "Change Date") {
        DayChoices(
          due: days.count == 1 ? days.first ?? nil : nil,
          set: { model.setDue(items.map(\.id), $0) },
          pick: { state.pickingDay = DayPicking(ids: items.map(\.id)) },
          dated: days != [nil])
      }
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

/// Days of dumps, under headings like the web app's.
private enum Day {
  static func label(_ start: Date) -> String {
    let calendar = Calendar.current
    if calendar.isDateInToday(start) { return "Today" }
    if calendar.isDateInYesterday(start) { return "Yesterday" }
    let style = Date.FormatStyle.dateTime.weekday(.wide).month(.wide).day()
    return calendar.isDate(start, equalTo: .now, toGranularity: .year)
      ? start.formatted(style) : start.formatted(style.year())
  }

  /// Items come sorted by time, so each day's are contiguous.
  static func group(_ items: [Snapshot.Item]) -> [DumpSection] {
    var days: [(start: Date, items: [Snapshot.Item])] = []
    for item in items {
      let start = Calendar.current.startOfDay(for: item.created)
      if days.last?.start == start { days[days.count - 1].items.append(item) } else {
        days.append((start, [item]))
      }
    }
    return days.map {
      DumpSection(id: "day-\($0.start.timeIntervalSince1970)", title: label($0.start), items: $0.items)
    }
  }
}

// MARK: Composer

/// Captures into the view's list (home leaves filing to `!list` or Jev). A `!list` prefix still
/// wins, as in the panel. The day read from the draft shows below it, and its × saves the dump
/// without one.
private struct Composer: View {
  let model: AppModel
  @Bindable var state: NotebookState
  let list: String?
  /// The day read from the draft that the owner chose not to use.
  @State private var skipped: String?
  /// Where the last dump went when that is not this view.
  @State private var savedTo: String?
  @State private var error: String?

  private static let font = NSFont.systemFont(ofSize: 14)

  var body: some View {
    let snapshot = model.snapshot
    let draft = state.draft
    let target = snapshot.list(model.engine.list(forDraft: draft) ?? list)
    let read = model.engine.due(forDraft: draft)
    let due = read == skipped ? nil : read
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
          CaptureEditor(text: $state.draft, font: Self.font, maxLines: 6, onSubmit: { submit(due) })
        }
        .padding(.vertical, 8)
        .padding(.leading, 12)
        Button {
          submit(due)
        } label: {
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
          if let due {
            HStack(spacing: 2) {
              DueBadge(due: due)
              Button {
                skipped = due
              } label: {
                Image(systemName: "xmark").imageScale(.small)
              }
              .buttonStyle(.plain)
              .help("Save without a date")
              .accessibilityLabel("Save without a date")
            }
            .padding(.leading, 4)
          }
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
    .onChange(of: state.draft) { _, text in
      if !text.isEmpty {
        savedTo = nil
        error = nil
      }
    }
  }

  /// Saves the draft with the day the composer showed.
  private func submit(_ due: String?) {
    let draft = state.draft
    guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    do {
      let captured = try model.engine.capture(draft, list: list, due: due)
      state.draft = ""
      skipped = nil
      error = nil
      // Home shows every open dump, so only a list view can lose sight of a new one.
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
