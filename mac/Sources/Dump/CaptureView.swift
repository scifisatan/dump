import AppKit
import DumpKit
import SwiftUI

/// The capture panel: a text box, the list it will be filed to, the latest dumps, and sync state.
struct CaptureView: View {
  @Bindable var model: AppModel
  var onSubmit: () -> Void
  var onCancel: () -> Void
  var onSettings: () -> Void
  var onSize: (CGSize) -> Void

  static let width: CGFloat = 640
  private static let radius: CGFloat = 20

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 14) {
        DumpMark().frame(width: 26, height: 26)
        ZStack(alignment: .topLeading) {
          if model.draft.isEmpty {
            Text("Dump a thought or a link…")
              .font(Font(CaptureEditor.font))
              .foregroundStyle(.tertiary)
              .allowsHitTesting(false)
          }
          CaptureEditor(
            text: $model.draft, onSubmit: onSubmit, onCancel: onCancel,
            onCycle: { model.cycleList($0) }, onPick: { model.pickList($0) })
        }
        .padding(.top, 1)
      }
      .padding(.horizontal, 20)
      .padding(.top, 18)
      .padding(.bottom, 14)

      ListChips(model: model)
        .padding(.horizontal, 20)
        .padding(.bottom, 14)

      if let problem = model.captureError ?? model.snapshot.storageError ?? model.openError {
        Label(problem, systemImage: "exclamationmark.triangle.fill")
          .font(.callout)
          .foregroundStyle(.red)
          .padding(.horizontal, 20)
          .padding(.bottom, 12)
      }

      if !model.snapshot.recent.isEmpty {
        Divider().opacity(0.6)
        Recent(items: Array(model.snapshot.recent.prefix(5)), snapshot: model.snapshot)
      }

      Divider().opacity(0.6)
      Footer(model: model, onSettings: onSettings)
    }
    .frame(width: Self.width)
    .fixedSize(horizontal: false, vertical: true)
    .background(PanelBackground(radius: Self.radius))
    .clipShape(RoundedRectangle(cornerRadius: Self.radius, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Self.radius, style: .continuous)
        .strokeBorder(Color.primary.opacity(0.08))
    )
    .onGeometryChange(for: CGSize.self, of: \.size, action: onSize)
  }
}

private struct ListChips: View {
  let model: AppModel

  var body: some View {
    let target = model.targetList
    let prefixed = model.prefixList != nil
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        Chip(label: "Inbox", color: nil, number: 0, selected: target == nil) {
          model.chosenList = nil
        }
        ForEach(Array(model.snapshot.lists.enumerated()), id: \.element.id) { index, list in
          Chip(
            label: list.label, color: Color(hex: list.color), number: index + 1,
            selected: target == list.id
          ) {
            model.chosenList = list.id
          }
        }
      }
    }
    .disabled(prefixed)
    .help(prefixed ? "The !list at the start of your text chooses the list." : "")
  }
}

private struct Chip: View {
  let label: String
  let color: Color?
  let number: Int
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let color {
          Circle().fill(color).frame(width: 7, height: 7)
        } else {
          Image(systemName: "tray").font(.system(size: 10, weight: .semibold))
        }
        Text(label)
      }
      .font(.system(size: 12, weight: selected ? .semibold : .regular))
      .foregroundStyle(selected ? .primary : .secondary)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .background(
        Capsule().fill(selected ? (color ?? .primary).opacity(0.18) : Color.primary.opacity(0.05))
      )
      .overlay(
        Capsule().strokeBorder(selected ? (color ?? .primary).opacity(0.45) : .clear)
      )
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .help(number <= 9 ? "⌘\(number)" : "")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

private struct Recent: View {
  let items: [Snapshot.Item]
  let snapshot: Snapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("Recent")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(.tertiary)
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
      ForEach(items) { item in
        let list = snapshot.list(item.list)
        HStack(spacing: 10) {
          Circle()
            .fill(list.map { Color(hex: $0.color) } ?? .clear)
            .overlay(Circle().strokeBorder(list == nil ? Color.secondary : .clear, lineWidth: 1))
            .frame(width: 7, height: 7)
          Text(item.text.replacingOccurrences(of: "\n", with: " "))
            .lineLimit(1)
            .truncationMode(.tail)
            .strikethrough(item.done)
            .foregroundStyle(item.done ? .secondary : .primary)
          Spacer(minLength: 12)
          Text(item.sorting ? "Sorting…" : list?.label ?? "Inbox")
            .foregroundStyle(.secondary)
          Text(Self.age(item.created))
            .foregroundStyle(.tertiary)
            .monospacedDigit()
            .frame(minWidth: 30, alignment: .trailing)
        }
        .font(.system(size: 13))
        .padding(.horizontal, 20)
        .padding(.vertical, 4)
      }
    }
    .padding(.vertical, 10)
  }

  static func age(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    if seconds < 60 { return "now" }
    if seconds < 3600 { return "\(Int(seconds / 60))m" }
    if seconds < 86_400 { return "\(Int(seconds / 3600))h" }
    if seconds < 7 * 86_400 { return "\(Int(seconds / 86_400))d" }
    return date.formatted(.dateTime.month(.abbreviated).day())
  }
}

private struct Footer: View {
  let model: AppModel
  let onSettings: () -> Void

  var body: some View {
    let sync = model.snapshot.sync
    HStack(spacing: 14) {
      Button(action: onSettings) {
        HStack(spacing: 6) {
          Circle().fill(Color(nsColor: sync.tint)).frame(width: 7, height: 7)
          Text(sync.label)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help(model.snapshot.syncError ?? model.server?.baseUrl ?? "Open Settings to connect your server")
      Spacer()
      KeyHint(keys: "↩", action: "Save")
      KeyHint(keys: "⇧↩", action: "New line")
      KeyHint(keys: "⇥", action: "List")
      KeyHint(keys: "esc", action: "Close")
    }
    .font(.system(size: 11.5))
    .foregroundStyle(.secondary)
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
    .background(Color.primary.opacity(0.03))
  }
}

private struct KeyHint: View {
  let keys: String
  let action: String

  var body: some View {
    HStack(spacing: 5) {
      Text(keys)
        .font(.system(size: 10.5, weight: .medium, design: .rounded))
        .padding(.horizontal, 5)
        .padding(.vertical, 1.5)
        .background(RoundedRectangle(cornerRadius: 4).fill(Color.primary.opacity(0.08)))
      Text(action)
    }
  }
}

/// Liquid Glass on macOS 26, a translucent material before it; both blur what is behind the panel.
struct PanelBackground: NSViewRepresentable {
  let radius: CGFloat

  func makeNSView(context: Context) -> NSView {
    if #available(macOS 26, *) {
      let glass = NSGlassEffectView()
      glass.cornerRadius = radius
      return glass
    }
    let material = NSVisualEffectView()
    material.material = .popover
    material.blendingMode = .behindWindow
    material.state = .active
    return material
  }

  func updateNSView(_ view: NSView, context: Context) {}
}
