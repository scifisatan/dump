import AppKit
import DumpKit
import SwiftUI

/// Sort inbox, as on the web (TriageDialog.tsx): one unfiled dump at a time. 1–9 file it in a
/// list, → skips it, Delete removes it.
struct SortInbox: View {
  let model: AppModel
  @Environment(\.dismiss) private var dismiss
  @State private var index = 0

  var body: some View {
    let snapshot = model.snapshot
    // Dumps Jev is still sorting are left to it.
    let unfiled = snapshot.dumps.filter { !$0.done && $0.list == nil && !$0.sorting }
    let current = unfiled.isEmpty ? nil : unfiled[index % unfiled.count]
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 4) {
        Text("A little sorting session.").font(.title2.weight(.semibold))
        Text(
          unfiled.isEmpty
            ? "Every thought has a home. A little lighter."
            : "\(unfiled.count) \(unfiled.count == 1 ? "thought" : "thoughts") to give a home. There’s no hurry."
        )
        .foregroundStyle(.secondary)
      }
      if let current {
        Text(current.text)
          .font(.system(size: 19))
          .lineLimit(10)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: 130), spacing: 8, alignment: .leading)],
          alignment: .leading, spacing: 8
        ) {
          ForEach(Array(snapshot.lists.enumerated()), id: \.element.id) { index, list in
            file(current, in: list, number: index + 1)
          }
        }
        Divider()
        HStack {
          Button(role: .destructive) {
            model.remove([current.id])
          } label: {
            Label("Remove", systemImage: "trash")
          }
          .keyboardShortcut(.delete, modifiers: [])
          .help("Remove this dump (Delete)")
          Spacer()
          Button("Done") { dismiss() }
            .keyboardShortcut(.cancelAction)
          Button("Skip") { index += 1 }
            .keyboardShortcut(.rightArrow, modifiers: [])
            .help("Skip for now (→)")
        }
      } else {
        HStack {
          Spacer()
          Button("Back to My Notebook") { dismiss() }
            .keyboardShortcut(.defaultAction)
        }
      }
    }
    .padding(24)
    .frame(width: 500)
  }

  @ViewBuilder
  private func file(_ item: Snapshot.Item, in list: Snapshot.List, number: Int) -> some View {
    let button = Button {
      model.file([item.id], to: list.id)
    } label: {
      HStack(spacing: 6) {
        ListDot(color: list.color)
        Text(list.label).lineLimit(1)
        Spacer(minLength: 4)
        if number <= 9 { Text("\(number)").foregroundStyle(.tertiary).monospacedDigit() }
      }
      .frame(maxWidth: .infinity)
    }
    if number <= 9 {
      button.keyboardShortcut(KeyEquivalent(Character(String(number))), modifiers: [])
    } else {
      button
    }
  }
}

/// Creates a list, or renames, recolors or deletes one (ListEditor.tsx).
struct ListEditor: View {
  let model: AppModel
  let editing: ListEditing
  var saved: (Snapshot.List) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var label = ""
  @State private var color = ListEditor.colors[0]
  @State private var error: String?
  @State private var confirmingDelete = false

  /// The web app's palette.
  static let colors = ["#9b84d6", "#c49651", "#6395c3", "#849c74", "#cd7f86", "#849299"]

  private var existing: Snapshot.List? {
    if case .edit(let list) = editing { list } else { nil }
  }

  var body: some View {
    let name = label.trimmingCharacters(in: .whitespacesAndNewlines)
    // A list colored elsewhere keeps its color as a choice.
    let palette = Self.colors.contains(color.lowercased()) ? Self.colors : Self.colors + [color]
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text(existing == nil ? "A home for something." : "Make it yours.").font(.title2.weight(.semibold))
        Text(
          existing == nil
            ? "Start with a name. You can change it whenever you like."
            : "Update your list’s name and color."
        )
        .foregroundStyle(.secondary)
      }
      TextField("List name", text: $label, prompt: Text("Books, weekend plans, someday…"))
        .textFieldStyle(.roundedBorder)
        .onSubmit(save)
      HStack(spacing: 14) {
        Text("Color").foregroundStyle(.secondary)
        ForEach(palette, id: \.self) { value in
          Button {
            color = value
          } label: {
            Circle()
              .fill(Color(hex: value))
              .frame(width: 20, height: 20)
              .padding(3)
              .overlay(Circle().strokeBorder(Color.primary.opacity(color == value ? 0.7 : 0), lineWidth: 2))
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Color \(value)")
          .accessibilityAddTraits(color == value ? .isSelected : [])
        }
      }
      if let error {
        Text(error).font(.callout).foregroundStyle(.red)
      }
      HStack {
        if existing != nil {
          Button("Delete List…", role: .destructive) { confirmingDelete = true }
        }
        Spacer()
        Button("Cancel") { dismiss() }
          .keyboardShortcut(.cancelAction)
        Button(existing == nil ? "Create List" : "Save", action: save)
          .keyboardShortcut(.defaultAction)
          .disabled(name.isEmpty)
      }
    }
    .padding(24)
    .frame(width: 440)
    .onAppear {
      if let existing {
        label = existing.label
        color = existing.color.lowercased()
      }
    }
    .onChange(of: label) {
      if label.count > 40 { label = String(label.prefix(40)) }
      error = nil
    }
    .confirmationDialog("Delete “\(existing?.label ?? "")”?", isPresented: $confirmingDelete) {
      Button("Delete List", role: .destructive, action: delete)
    } message: {
      Text("Its dumps go back to the inbox to be sorted again. This can’t be undone.")
    }
  }

  private func save() {
    let name = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }
    do {
      saved(try model.engine.saveList(label: name, color: color, id: existing?.id))
      dismiss()
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func delete() {
    guard let existing else { return }
    do {
      try model.engine.deleteList(existing.id)
      dismiss()
    } catch {
      self.error = error.localizedDescription
    }
  }
}
