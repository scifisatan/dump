import Foundation
import Security

/// The saved notebooks and which one is open, like the web app's `dump-connections` registry.
/// Owner keys are kept apart, in the Keychain.
public final class ProfileStore {
  public struct Registry: Codable, Equatable {
    public var active: String?
    public var profiles: [Profile]
  }

  private let defaults: UserDefaults
  private let key = "connections"

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public var registry: Registry {
    guard let data = defaults.data(forKey: key),
      let registry = try? JSONDecoder().decode(Registry.self, from: data)
    else { return Registry(active: nil, profiles: []) }
    return registry
  }

  public var active: Profile? {
    let registry = registry
    return registry.profiles.first { $0.id == registry.active }
  }

  public var others: [Profile] {
    let registry = registry
    return registry.profiles.filter { $0.id != registry.active }
  }

  /// Reuses the notebook already saved for this server and identity, if any.
  public func profile(for server: ServerLocation) -> Profile {
    let existing = registry.profiles.first { $0.server == server }
    return Profile(id: existing?.id ?? UUID().uuidString.lowercased(), server: server)
  }

  /// Saves the profile (replacing one with its ID) and makes it the open one.
  public func activate(_ profile: Profile) {
    var registry = registry
    registry.profiles.removeAll { $0.id == profile.id }
    registry.profiles.append(profile)
    registry.active = profile.id
    if let data = try? JSONEncoder().encode(registry) { defaults.set(data, forKey: key) }
  }
}

/// Owner keys in the login Keychain, one per profile, cached after the first read.
public final class OwnerKeys {
  private let service: String
  private var cache: [String: String] = [:]
  private let persistent: Bool

  /// `persistent: false` keeps keys in memory only (for checks and tests).
  public init(service: String = "np.com.abishrestha.dump.owner-key", persistent: Bool = true) {
    self.service = service
    self.persistent = persistent
  }

  public func read(_ profileId: String) -> String? {
    if let key = cache[profileId] { return key }
    guard persistent else { return nil }
    var result: CFTypeRef?
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: profileId,
      kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne,
    ]
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data, let key = String(data: data, encoding: .utf8)
    else { return nil }
    cache[profileId] = key
    return key
  }

  public func save(_ key: String, for profileId: String, server: String) throws {
    cache[profileId] = key
    guard persistent else { return }
    let item: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: profileId,
    ]
    SecItemDelete(item as CFDictionary)
    var added = item
    added[kSecValueData] = Data(key.utf8)
    added[kSecAttrLabel] = "Dump owner key (\(server))"
    added[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(added as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw EngineError("The Keychain refused to save the owner key (\(status)).")
    }
  }
}
