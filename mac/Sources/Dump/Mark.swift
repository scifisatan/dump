import AppKit
import SwiftUI

/// The Dump logo (public/favicon.svg): a lime tile with a six-point asterisk, drawn on a 64-unit
/// grid.
struct DumpMark: View {
  var body: some View {
    Canvas { context, size in
      let unit = size.width / 64
      context.fill(
        Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 18 * unit, style: .continuous),
        with: .color(Color(hex: "#d8ee79")))
      context.stroke(
        Mark.asterisk(center: CGPoint(x: 32 * unit, y: 32 * unit), radius: 17 * unit),
        with: .color(Color(hex: "#252629")),
        style: StrokeStyle(lineWidth: 7 * unit, lineCap: .round))
    }
    .accessibilityHidden(true)
  }
}

enum Mark {
  /// Three strokes through the center: vertical, and ±30° from horizontal.
  static func asterisk(center: CGPoint, radius: CGFloat) -> Path {
    var path = Path()
    for degrees in [90.0, 30.0, -30.0] {
      let angle = degrees * .pi / 180
      let dx = cos(angle) * radius
      let dy = sin(angle) * radius
      path.move(to: CGPoint(x: center.x - dx, y: center.y - dy))
      path.addLine(to: CGPoint(x: center.x + dx, y: center.y + dy))
    }
    return path
  }

  /// The menu bar icon: the asterisk alone, as a template image that follows the menu bar's color.
  static let menuBarImage: NSImage = {
    let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { rect in
      let path = NSBezierPath()
      path.append(NSBezierPath(cgPath: asterisk(center: CGPoint(x: rect.midX, y: rect.midY), radius: 7).cgPath))
      path.lineWidth = 2.2
      path.lineCapStyle = .round
      NSColor.black.setStroke()
      path.stroke()
      return true
    }
    image.isTemplate = true
    image.accessibilityDescription = "Dump"
    return image
  }()
}

extension Color {
  /// `#rrggbb`, as the shared schema stores list colors.
  init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(
      .sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255)
  }
}
