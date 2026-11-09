import Foundation

public struct ServerLocation: Codable, Equatable, Hashable, Sendable {
  public var baseUrl: String
  public var instanceId: String

  public init(baseUrl: String, instanceId: String) {
    self.baseUrl = baseUrl
    self.instanceId = instanceId
  }

  public var host: String { URL(string: baseUrl)?.host ?? baseUrl }
}

public struct Profile: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var server: ServerLocation?
}

public struct ServerCheck: Codable, Equatable, Sendable {
  public var baseUrl: String
  public var instanceId: String
  public var auth: String
  public var classify: Bool

  public var location: ServerLocation { ServerLocation(baseUrl: baseUrl, instanceId: instanceId) }
  public var hasOwnerKey: Bool { auth == "owner-key" }
}

public struct Snapshot: Codable, Equatable, Sendable {
  public enum Sync: String, Codable, Sendable {
    case connecting, syncing, synced, offline, error, local
    case signedOut = "signed-out"
  }

  public struct List: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var color: String
    public var prefix: String
    public var palette: [String]
  }

  public struct Item: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var text: String
    public var list: String?
    public var tags: [String]
    public var done: Bool
    public var url: String?
    public var due: String?
    public var dueLabel: String?
    public var site: String?
    public var overdue: Bool
    public var createdAt: Double
    public var sorting: Bool

    public var created: Date { Date(timeIntervalSince1970: createdAt / 1000) }
  }

  public struct Section: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var overdue: Bool
    public var today: Bool
    public var quiet: Bool
    public var ids: [String]
  }

  public struct Places: Codable, Equatable, Sendable {
    public var summary: String
    public var home: [Section]
    public var done: [Section]
    public var lists: [String: [Section]]
  }

  public struct Days: Codable, Equatable, Sendable {
    public var today: String
    public var tomorrow: String
  }

  public var ready: Bool
  public var sync: Sync
  public var syncError: String?
  public var saving: Bool
  public var storageError: String?
  public var attention: Bool
  public var profile: Profile?
  public var others: [Profile]
  public var firstRun: Bool
  public var openError: String?
  public var webApp: WebApp
  public var lists: [List]
  public var palette: [String]
  public var days: Days
  public var recent: [Item]
  public var unfiled: [String]
  public var doneCount: Int
  public var dumps: [Item]
  public var places: Places?

  public static let closed = Snapshot(
    ready: false, sync: .local, syncError: nil, saving: false, storageError: nil, attention: false,
    profile: nil, others: [], firstRun: false, openError: nil,
    webApp: WebApp(chosen: nil, standard: ""), lists: [], palette: [],
    days: Days(today: "", tomorrow: ""), recent: [], unfiled: [], doneCount: 0,
    dumps: [], places: nil)

  public func list(_ id: String?) -> List? { lists.first { $0.id == id } }
  public var server: ServerLocation? { profile?.server }
}

public struct Captured: Codable, Equatable, Sendable {
  public var id: String
  public var list: String?
  public var due: String?
}

public struct Day: Codable, Equatable, Sendable {
  public var due: String
  public var label: String
}

public struct WebApp: Codable, Equatable, Sendable {
  public var chosen: String?
  public var standard: String

  public var current: String { chosen ?? standard }
}
