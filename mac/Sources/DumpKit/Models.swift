import Foundation

public struct ServerLocation: Codable, Equatable, Hashable, Sendable {
  public var baseUrl: String
  /// The server's notebook identity from /api/ping. A different one at the same address is a
  /// different notebook.
  public var instanceId: String

  public init(baseUrl: String, instanceId: String) {
    self.baseUrl = baseUrl
    self.instanceId = instanceId
  }

  public var host: String { URL(string: baseUrl)?.host ?? baseUrl }
}

/// One notebook: synced with a server, or (server nil) kept only on this Mac. The same shape as
/// the web app's profiles (src/core/connection.ts).
public struct Profile: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var server: ServerLocation?

  public init(id: String = UUID().uuidString.lowercased(), server: ServerLocation?) {
    self.id = id
    self.server = server
  }

  // The engine's schema requires `server`, as null for a device-only notebook; synthesized
  // encoding would leave the key out.
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(server, forKey: .server)
  }
}

/// What /api/ping says about a server, checked before anything is saved.
public struct ServerCheck: Codable, Equatable, Sendable {
  public var baseUrl: String
  public var instanceId: String
  public var auth: String
  public var classify: Bool

  public var location: ServerLocation { ServerLocation(baseUrl: baseUrl, instanceId: instanceId) }
  /// An unconfigured server has no owner key yet and refuses everything but the check.
  public var hasOwnerKey: Bool { auth == "owner-key" }
}

/// The engine's compact view of the open notebook (mac/engine/index.ts `view`).
public struct Snapshot: Codable, Equatable, Sendable {
  public enum Sync: String, Codable, Sendable {
    case connecting, syncing, synced, offline, error, local
    case signedOut = "signed-out"
  }

  public struct List: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var color: String
  }

  public struct Item: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var text: String
    public var list: String?
    public var tags: [String]
    public var done: Bool
    public var url: String?
    public var createdAt: Double
    public var sorting: Bool

    public var created: Date { Date(timeIntervalSince1970: createdAt / 1000) }
  }

  public var ready: Bool
  public var sync: Sync
  public var syncError: String?
  public var saving: Bool
  public var storageError: String?
  public var lists: [List]
  public var recent: [Item]
  /// Every dump, newest first; only in a full snapshot (`Engine.snapshot(full:)`).
  public var dumps: [Item]
  /// Open dumps not filed in a list.
  public var inbox: Int

  public static let closed = Snapshot(
    ready: false, sync: .local, syncError: nil, saving: false, storageError: nil, lists: [],
    recent: [], dumps: [], inbox: 0)

  public func list(_ id: String?) -> List? { lists.first { $0.id == id } }
}

public struct Captured: Codable, Equatable, Sendable {
  public var id: String
  public var list: String?
}

/// The Origin header the app sends. Servers answer only the web app origins they list in
/// ALLOWED_CLIENT_ORIGINS (src/server/origins.ts); the owner key is the authentication.
public enum ClientOrigin {
  /// The hosted web app, which every server allows by default.
  public static let hosted = "https://dump.abishrestha.com.np"
  /// The web client of `npm run dev`, which the development API allows.
  public static let development = "http://localhost:6191"

  public static func standard(for server: URL) -> String {
    isLocal(server) ? development : hosted
  }

  public static func isLocal(_ url: URL) -> Bool {
    ["localhost", "127.0.0.1", "::1", "[::1]"].contains(url.host ?? "")
  }

  /// A valid override is an http(s) origin with nothing after the host and port.
  public static func normalized(_ input: String) -> String? {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http", let host = url.host, !host.isEmpty,
      url.path.isEmpty || url.path == "/", url.query == nil, url.fragment == nil, url.user == nil
    else { return nil }
    let port = url.port.map { ":\($0)" } ?? ""
    let bracketed = host.contains(":") && !host.hasPrefix("[") ? "[\(host)]" : host
    return "\(scheme)://\(bracketed.lowercased())\(port)"
  }
}
