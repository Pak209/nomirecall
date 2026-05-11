import Foundation

enum NomiShareInbox {
    static let appGroupIdentifier = "group.com.dkimoto.nomi.recall"

    private static let pendingPayloadKey = "pendingSharePayload"

    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    static func save(_ payload: NomiSharePayload) throws {
        guard let defaults = sharedDefaults else {
            throw NomiShareInboxError.appGroupUnavailable
        }

        let data = try JSONEncoder().encode(payload)
        defaults.set(data, forKey: pendingPayloadKey)
        defaults.synchronize()
    }

    static func consumePendingPayload() -> NomiSharePayload? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: pendingPayloadKey),
              let payload = try? JSONDecoder().decode(NomiSharePayload.self, from: data) else {
            return nil
        }

        defaults.removeObject(forKey: pendingPayloadKey)
        defaults.synchronize()
        return payload
    }
}

enum NomiShareInboxError: LocalizedError {
    case appGroupUnavailable

    var errorDescription: String? {
        "Nomi could not access the shared capture inbox."
    }
}
