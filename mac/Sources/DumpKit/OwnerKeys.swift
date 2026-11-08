import Foundation
import Security

public final class OwnerKeys {
  private let service: String
  private var cache: [String: String] = [:]
  private let persistent: Bool

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
