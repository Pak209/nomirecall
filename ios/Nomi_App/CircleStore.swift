import Foundation

// MARK: - Codable models

/// A person in your Circle context. Every field except `id` is optional and is
/// decoded defensively so a partial or evolving backend payload never breaks the UI.
struct CircleProfile: Identifiable, Decodable, Hashable {
    let id: String
    let username: String?
    let displayName: String?
    let photoURL: URL?
    let bio: String?

    enum CodingKeys: String, CodingKey {
        case id
        case username
        case displayName
        case photoURL
        case bio
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try? container.decode(String.self, forKey: .username)
        displayName = try? container.decode(String.self, forKey: .displayName)
        photoURL = try? container.decode(URL.self, forKey: .photoURL)
        bio = try? container.decode(String.self, forKey: .bio)
    }

    /// A best-effort human label, preferring display name then username.
    var displayNameOrUsername: String {
        if let displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines),
           !displayName.isEmpty {
            return displayName
        }
        if let username = username?.trimmingCharacters(in: .whitespacesAndNewlines),
           !username.isEmpty {
            return username
        }
        return "Nomi friend"
    }

    /// A `@`-prefixed handle when a username exists.
    var handle: String? {
        guard let username = username?.trimmingCharacters(in: .whitespacesAndNewlines),
              !username.isEmpty else { return nil }
        return username.hasPrefix("@") ? username : "@\(username)"
    }
}

/// A confirmed friend plus whether you have pinned them to the top of your Circle.
struct CircleFriend: Identifiable, Decodable, Hashable {
    let profile: CircleProfile
    let pinned: Bool

    var id: String { profile.id }

    enum CodingKeys: String, CodingKey {
        case profile
        case pinned
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        profile = try container.decode(CircleProfile.self, forKey: .profile)
        pinned = (try? container.decode(Bool.self, forKey: .pinned)) ?? false
    }
}

/// The frozen content of a memory that a friend shared with you.
struct CircleSnapshot: Decodable, Hashable {
    let title: String?
    let body: String?
    let category: String?
    let tags: [String]?
    let sourceUrl: URL?

    enum CodingKeys: String, CodingKey {
        case title
        case body
        case category
        case tags
        case sourceUrl
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try? container.decode(String.self, forKey: .title)
        body = try? container.decode(String.self, forKey: .body)
        category = try? container.decode(String.self, forKey: .category)
        tags = try? container.decode([String].self, forKey: .tags)
        sourceUrl = try? container.decode(URL.self, forKey: .sourceUrl)
    }
}

/// Who shared an inbox item and where it came from.
struct CircleAttribution: Decodable, Hashable {
    let fromUserId: String?
    let fromUsername: String?
    let fromDisplayName: String?
    let originalMemoryId: String?
    let sharedAt: Date?

    enum CodingKeys: String, CodingKey {
        case fromUserId
        case fromUsername
        case fromDisplayName
        case originalMemoryId
        case sharedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fromUserId = try? container.decode(String.self, forKey: .fromUserId)
        fromUsername = try? container.decode(String.self, forKey: .fromUsername)
        fromDisplayName = try? container.decode(String.self, forKey: .fromDisplayName)
        originalMemoryId = try? container.decode(String.self, forKey: .originalMemoryId)
        sharedAt = try? container.decode(Date.self, forKey: .sharedAt)
    }

    /// The friendliest label available for who shared this.
    var displayLabel: String {
        if let name = fromDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        if let username = fromUsername?.trimmingCharacters(in: .whitespacesAndNewlines), !username.isEmpty {
            return username
        }
        return "a friend"
    }
}

/// A single "shared with you" item in the Circle inbox.
struct CircleInboxItem: Identifiable, Decodable, Hashable {
    let id: String
    let kind: String?
    let snapshot: CircleSnapshot
    let attribution: CircleAttribution
    let status: String

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case snapshot
        case attribution
        case status
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        kind = try? container.decode(String.self, forKey: .kind)
        snapshot = try container.decode(CircleSnapshot.self, forKey: .snapshot)
        attribution = try container.decode(CircleAttribution.self, forKey: .attribution)
        status = (try? container.decode(String.self, forKey: .status)) ?? "new"
    }

    var isNew: Bool {
        status.lowercased() == "new"
    }
}

// MARK: - Response wrappers

struct CircleSearchResponse: Decodable {
    let user: CircleProfile?
}

struct CircleRequestsResponse: Decodable {
    let incoming: [CircleProfile]
    let outgoing: [CircleProfile]

    enum CodingKeys: String, CodingKey {
        case incoming
        case outgoing
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        incoming = (try? container.decode([CircleProfile].self, forKey: .incoming)) ?? []
        outgoing = (try? container.decode([CircleProfile].self, forKey: .outgoing)) ?? []
    }
}

struct CircleFriendsResponse: Decodable {
    let friends: [CircleFriend]

    enum CodingKeys: String, CodingKey {
        case friends
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        friends = (try? container.decode([CircleFriend].self, forKey: .friends)) ?? []
    }
}

struct CircleInboxResponse: Decodable {
    let items: [CircleInboxItem]

    enum CodingKeys: String, CodingKey {
        case items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = (try? container.decode([CircleInboxItem].self, forKey: .items)) ?? []
    }
}

struct CircleRequestActionResponse: Decodable {
    let ok: Bool?
    let pending: Bool?
}

struct CircleActionResponse: Decodable {
    let ok: Bool?
}

struct CircleShareResponse: Decodable {
    let ok: Bool?
    let shareId: String?
}

struct CircleSaveResponse: Decodable {
    let ok: Bool?
    let memoryId: String?
}

// MARK: - Store

@MainActor
final class CircleStore: ObservableObject {
    @Published private(set) var friends: [CircleFriend] = []
    @Published private(set) var incoming: [CircleProfile] = []
    @Published private(set) var outgoing: [CircleProfile] = []
    @Published private(set) var inbox: [CircleInboxItem] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let backendService = XBackendService()

    /// Inbox items that are still awaiting a decision.
    var newInboxItems: [CircleInboxItem] {
        inbox.filter { $0.isNew }
    }

    // MARK: Loading

    func loadAll() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        await reloadRequests()
        await reloadFriends()
        await reloadInbox()
    }

    private func reloadRequests() async {
        do {
            let response = try await backendService.circleRequests()
            incoming = response.incoming
            outgoing = response.outgoing
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadFriends() async {
        do {
            friends = try await backendService.circleFriends().sortedForCircle()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadInbox() async {
        do {
            inbox = try await backendService.circleInbox()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Requests

    /// Exact-match lookup by username or email. Returns the profile, or nil when no one matches.
    func search(_ q: String) async -> CircleProfile? {
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        do {
            return try await backendService.circleSearch(query: trimmed)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func sendRequest(to userId: String) async -> Bool {
        do {
            _ = try await backendService.sendCircleRequest(toUserId: userId)
            await reloadRequests()
            await reloadFriends()
            successMessage = "Request sent."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func accept(_ fromUserId: String) async {
        do {
            try await backendService.acceptCircleRequest(fromUserId: fromUserId)
            await reloadRequests()
            await reloadFriends()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func decline(_ fromUserId: String) async {
        do {
            try await backendService.declineCircleRequest(fromUserId: fromUserId)
            await reloadRequests()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Friends

    func setPinned(_ friendId: String, _ pinned: Bool) async {
        do {
            try await backendService.setCircleFriendPinned(friendId: friendId, pinned: pinned)
            await reloadFriends()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeFriend(_ friendId: String) async {
        do {
            try await backendService.removeCircleFriend(friendId: friendId)
            await reloadFriends()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func block(_ userId: String) async {
        do {
            try await backendService.blockCircleUser(userId: userId)
            await reloadFriends()
            await reloadRequests()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Sharing

    func share(memoryId: String, to userId: String) async -> Bool {
        do {
            _ = try await backendService.shareToCircle(toUserId: userId, memoryId: memoryId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveShare(_ shareId: String) async -> Bool {
        do {
            _ = try await backendService.saveCircleShare(shareId: shareId)
            await reloadInbox()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func ignoreShare(_ shareId: String) async {
        do {
            try await backendService.ignoreCircleShare(shareId: shareId)
            await reloadInbox()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private extension Array where Element == CircleFriend {
    /// Pinned friends first, then alphabetically by their best label.
    func sortedForCircle() -> [CircleFriend] {
        sorted { lhs, rhs in
            if lhs.pinned != rhs.pinned {
                return lhs.pinned && !rhs.pinned
            }
            return lhs.profile.displayNameOrUsername
                .localizedCaseInsensitiveCompare(rhs.profile.displayNameOrUsername) == .orderedAscending
        }
    }
}
