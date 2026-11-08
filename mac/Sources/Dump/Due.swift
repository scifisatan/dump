import SwiftUI

enum Due {
  static func date(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}

struct DueBadge: View {
  let label: String
  var overdue = false

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: "calendar").imageScale(.small)
      Text(label)
    }
    .foregroundStyle(overdue ? Color.red : Color.secondary)
    .padding(.horizontal, 5)
    .padding(.vertical, 1)
    .background(
      RoundedRectangle(cornerRadius: 4).fill(overdue ? Color.red.opacity(0.1) : Color.primary.opacity(0.06)))
  }
}
