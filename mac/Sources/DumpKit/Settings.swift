import Foundation

/// Where the engine keeps its settings: the app's user defaults, or memory for checks and tests.
public protocol Settings: AnyObject {
  func string(forKey key: String) -> String?
  func data(forKey key: String) -> Data?
  func set(_ value: Any?, forKey key: String)
  func removeObject(forKey key: String)
}

extension UserDefaults: Settings {}

public final class MemorySettings: Settings {
  private var values: [String: Any] = [:]

  public init() {}

  public func string(forKey key: String) -> String? { values[key] as? String }
  public func data(forKey key: String) -> Data? { values[key] as? Data }
  public func set(_ value: Any?, forKey key: String) { values[key] = value }
  public func removeObject(forKey key: String) { values[key] = nil }
}
