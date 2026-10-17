import DumpKit
import SwiftUI

/// Due days as the web app shows them (src/client/components/DueDate.tsx). A day is YYYY-MM-DD in
/// this Mac's time zone; the engine reads it from a dump's words (src/shared/due.ts).
enum Due {
  static func key(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 1, parts.day ?? 1)
  }

  static func date(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  static var today: String { key(.now) }
  static var tomorrow: String {
    key(Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now)
  }

  /// Today, Tomorrow, a weekday within the week, else a date.
  static func label(_ key: String, now: Date = .now) -> String {
    guard let date = date(key) else { return key }
    let calendar = Calendar.current
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: date).day ?? 0
    switch days {
    case 0: return "Today"
    case 1: return "Tomorrow"
    case -1: return "Yesterday"
    case 2...6: return date.formatted(.dateTime.weekday(.wide))
    default:
      return calendar.isDate(date, equalTo: now, toGranularity: .year)
        ? date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        : date.formatted(.dateTime.month(.abbreviated).day().year())
    }
  }

  /// An open dump whose day has passed.
  static func overdue(_ item: Snapshot.Item) -> Bool {
    guard let due = item.due, !item.done else { return false }
    return due < today
  }
}

/// A day as a small calendar badge, red when it has passed.
struct DueBadge: View {
  let due: String
  var overdue = false

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: "calendar").imageScale(.small)
      Text(Due.label(due))
    }
    .foregroundStyle(overdue ? Color.red : Color.secondary)
    .padding(.horizontal, 5)
    .padding(.vertical, 1)
    .background(
      RoundedRectangle(cornerRadius: 4).fill(overdue ? Color.red.opacity(0.1) : Color.primary.opacity(0.06)))
  }
}
