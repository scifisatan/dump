// Renders the app icon iconset from the Dump mark (public/favicon.svg) on the macOS icon grid:
// an 824 px tile centered on a 1024 px canvas.
//   swift scripts/render-icon.swift build/AppIcon.iconset
import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func color(_ hex: UInt32) -> NSColor {
  NSColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

func render(pixels: Int) -> Data {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let scale = CGFloat(pixels) / 1024
  let tile = NSRect(x: 100 * scale, y: 100 * scale, width: 824 * scale, height: 824 * scale)
  color(0xD8EE79).setFill()
  NSBezierPath(roundedRect: tile, xRadius: 185 * scale, yRadius: 185 * scale).fill()
  // The mark's asterisk: three strokes through the center, on the favicon's 64-unit grid.
  let unit = tile.width / 64
  let strokes = NSBezierPath()
  for degrees in [90.0, 30.0, -30.0] {
    let angle = degrees * .pi / 180
    let dx = cos(angle) * 17 * unit
    let dy = sin(angle) * 17 * unit
    strokes.move(to: NSPoint(x: tile.midX - dx, y: tile.midY - dy))
    strokes.line(to: NSPoint(x: tile.midX + dx, y: tile.midY + dy))
  }
  strokes.lineWidth = 7 * unit
  strokes.lineCapStyle = .round
  color(0x252629).setStroke()
  strokes.stroke()
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
  try render(pixels: size).write(to: output.appendingPathComponent("icon_\(size)x\(size).png"))
  try render(pixels: size * 2).write(to: output.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
