// swift-tools-version: 6.0
import PackageDescription

// The Mac app: a menu bar capture panel for Dump. DumpKit runs the web app's notebook core
// (mac/engine, bundled to build/engine.js) in JavaScriptCore; Dump is the AppKit/SwiftUI shell.
let swift5: [SwiftSetting] = [.swiftLanguageMode(.v5)]

let package = Package(
  name: "DumpMac",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "Dump", targets: ["Dump"])],
  targets: [
    .target(name: "DumpKit", swiftSettings: swift5),
    .executableTarget(name: "Dump", dependencies: ["DumpKit"], swiftSettings: swift5),
    // Headless sync check against a running server; see README.
    .executableTarget(name: "dump-check", dependencies: ["DumpKit"], swiftSettings: swift5),
    .testTarget(name: "DumpKitTests", dependencies: ["DumpKit"], swiftSettings: swift5),
  ]
)
