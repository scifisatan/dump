// swift-tools-version: 6.0
import PackageDescription

let swift5: [SwiftSetting] = [.swiftLanguageMode(.v5)]

let package = Package(
  name: "DumpMac",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "Dump", targets: ["Dump"])],
  targets: [
    .target(name: "DumpKit", swiftSettings: swift5),
    .executableTarget(name: "Dump", dependencies: ["DumpKit"], swiftSettings: swift5),
    .executableTarget(name: "dump-check", dependencies: ["DumpKit"], swiftSettings: swift5),
    .testTarget(name: "DumpKitTests", dependencies: ["DumpKit"], swiftSettings: swift5),
  ]
)
