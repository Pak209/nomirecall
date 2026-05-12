import Foundation
import FirebaseFirestore
import FirebaseStorage

struct NomiMemory: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let userId: String
    var title: String
    var content: String
    var category: String
    var tags: [String]
    var createdAt: Date
    var mediaURL: URL?
    var sourceURL: URL?
    var sourceUsername: String?
    var sourceDate: Date?
    var type: String
    var links: [NomiMemoryLink] = []
    var media: [NomiMemoryMedia] = []
    var referencedPosts: [NomiReferencedPost] = []
}

struct NomiMemoryLink: Identifiable, Codable, Equatable, Hashable {
    var id: String { url?.absoluteString ?? displayUrl ?? title ?? "link" }
    var url: URL?
    var displayUrl: String?
    var title: String?
}

struct NomiMemoryMedia: Identifiable, Codable, Equatable, Hashable {
    var id: String { url?.absoluteString ?? previewImageUrl?.absoluteString ?? altText ?? type }
    var type: String
    var url: URL?
    var previewImageUrl: URL?
    var altText: String?
    var width: Int?
    var height: Int?
    var variants: [NomiMemoryMediaVariant] = []

    var bestDisplayURL: URL? {
        if type == "photo" { return url ?? previewImageUrl }
        return previewImageUrl ?? url ?? variants.first?.url
    }

    var bestVideoURL: URL? {
        variants
            .filter { ($0.contentType ?? "").contains("mp4") }
            .sorted { ($0.bitRate ?? 0) > ($1.bitRate ?? 0) }
            .first?.url
    }
}

struct NomiMemoryMediaVariant: Codable, Equatable, Hashable {
    var url: URL
    var contentType: String?
    var bitRate: Int?
}

struct NomiReferencedPost: Identifiable, Codable, Equatable, Hashable {
    var id: String
    var referenceType: String?
    var username: String?
    var url: URL?
    var text: String?
    var postDate: Date?
    var links: [NomiMemoryLink] = []
    var media: [NomiMemoryMedia] = []
}

final class MemoryService {
    private let database = Firestore.firestore()
    private let storage = Storage.storage()

    func createMemory(
        userId: String,
        title: String,
        content: String,
        category: String,
        tags: [String] = [],
        sourceURL: URL? = nil,
        sourceUsername: String? = nil,
        sourceDate: Date? = nil,
        type: String = "note",
        links: [NomiMemoryLink] = [],
        media: [NomiMemoryMedia] = [],
        referencedPosts: [NomiReferencedPost] = []
    ) async throws -> String {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let document = database
            .collection("users")
            .document(userId)
            .collection("memories")
            .document()

        var data: [String: Any] = [
            "id": document.documentID,
            "userId": userId,
            "title": title,
            "content": content,
            "category": category,
            "tags": tags,
            "createdAt": FieldValue.serverTimestamp(),
            "type": type,
            "links": Self.linkDictionaries(links),
            "media": Self.mediaDictionaries(media),
            "referencedPosts": Self.referencedPostDictionaries(referencedPosts)
        ]

        if let sourceURL {
            data["sourceURL"] = sourceURL.absoluteString
        }

        if let sourceUsername {
            data["sourceUsername"] = sourceUsername
        }

        if let sourceDate {
            data["sourceDate"] = Timestamp(date: sourceDate)
        }

        try await document.setData(data)

        return document.documentID
    }

    func memories(userId: String, limit: Int = 50) async throws -> [NomiMemory] {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let snapshot = try await memoriesReference(userId: userId)
            .order(by: "createdAt", descending: true)
            .limit(to: limit)
            .getDocuments()

        return snapshot.documents.compactMap(Self.memory(from:))
    }

    func updateMemory(_ memory: NomiMemory) async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        var data: [String: Any] = [
            "title": memory.title,
            "content": memory.content,
            "category": memory.category,
            "tags": memory.tags,
            "type": memory.type,
            "links": Self.linkDictionaries(memory.links),
            "media": Self.mediaDictionaries(memory.media),
            "referencedPosts": Self.referencedPostDictionaries(memory.referencedPosts),
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if let mediaURL = memory.mediaURL {
            data["mediaURL"] = mediaURL.absoluteString
        }

        if let sourceURL = memory.sourceURL {
            data["sourceURL"] = sourceURL.absoluteString
        }

        if let sourceUsername = memory.sourceUsername {
            data["sourceUsername"] = sourceUsername
        }

        if let sourceDate = memory.sourceDate {
            data["sourceDate"] = Timestamp(date: sourceDate)
        }

        try await memoriesReference(userId: memory.userId)
            .document(memory.id)
            .setData(data, merge: true)
    }

    func deleteMemory(_ memory: NomiMemory) async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        try await memoriesReference(userId: memory.userId)
            .document(memory.id)
            .delete()
    }

    func uploadMedia(userId: String, memoryId: String, data: Data, fileExtension: String) async throws -> URL {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let reference = storage.reference()
            .child("users")
            .child(userId)
            .child("memories")
            .child(memoryId)
            .child("media.\(fileExtension)")

        _ = try await reference.putDataAsync(data)
        return try await reference.downloadURL()
    }

    private func memoriesReference(userId: String) -> CollectionReference {
        database
            .collection("users")
            .document(userId)
            .collection("memories")
    }

    private static func memory(from document: QueryDocumentSnapshot) -> NomiMemory? {
        let data = document.data()
        let userId = data["userId"] as? String ?? ""
        let title = data["title"] as? String ?? "Untitled memory"
        let content = data["content"] as? String ?? ""
        let category = data["category"] as? String ?? "General"
        let tags = data["tags"] as? [String] ?? []
        let createdAt = (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
        let mediaURL = (data["mediaURL"] as? String).flatMap(URL.init(string:))
        let sourceURL = (data["sourceURL"] as? String).flatMap(URL.init(string:))
        let sourceUsername = data["sourceUsername"] as? String
        let sourceDate = (data["sourceDate"] as? Timestamp)?.dateValue()
        let type = data["type"] as? String ?? "note"
        let links = links(from: data["links"])
        let media = media(from: data["media"])
        let referencedPosts = referencedPosts(from: data["referencedPosts"])

        return NomiMemory(
            id: document.documentID,
            userId: userId,
            title: title,
            content: content,
            category: category,
            tags: tags,
            createdAt: createdAt,
            mediaURL: mediaURL,
            sourceURL: sourceURL,
            sourceUsername: sourceUsername,
            sourceDate: sourceDate,
            type: type,
            links: links,
            media: media,
            referencedPosts: referencedPosts
        )
    }

    private static func linkDictionaries(_ links: [NomiMemoryLink]) -> [[String: Any]] {
        links.map {
            clean([
                "url": $0.url?.absoluteString,
                "displayUrl": $0.displayUrl,
                "title": $0.title
            ])
        }
    }

    private static func mediaDictionaries(_ media: [NomiMemoryMedia]) -> [[String: Any]] {
        media.map {
            clean([
                "type": $0.type,
                "url": $0.url?.absoluteString,
                "previewImageUrl": $0.previewImageUrl?.absoluteString,
                "altText": $0.altText,
                "width": $0.width,
                "height": $0.height,
                "variants": $0.variants.map { variant in
                    clean([
                        "url": variant.url.absoluteString,
                        "contentType": variant.contentType,
                        "bitRate": variant.bitRate
                    ])
                }
            ])
        }
    }

    private static func referencedPostDictionaries(_ posts: [NomiReferencedPost]) -> [[String: Any]] {
        posts.map {
            clean([
                "id": $0.id,
                "referenceType": $0.referenceType,
                "username": $0.username,
                "url": $0.url?.absoluteString,
                "text": $0.text,
                "postDate": $0.postDate.map(Timestamp.init(date:)),
                "links": linkDictionaries($0.links),
                "media": mediaDictionaries($0.media)
            ])
        }
    }

    private static func links(from value: Any?) -> [NomiMemoryLink] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.map {
            NomiMemoryLink(
                url: stringURL($0["url"]),
                displayUrl: $0["displayUrl"] as? String ?? $0["display_url"] as? String,
                title: $0["title"] as? String
            )
        }
    }

    private static func media(from value: Any?) -> [NomiMemoryMedia] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.map {
            NomiMemoryMedia(
                type: $0["type"] as? String ?? "media",
                url: stringURL($0["url"]),
                previewImageUrl: stringURL($0["previewImageUrl"] ?? $0["preview_image_url"]),
                altText: $0["altText"] as? String ?? $0["alt_text"] as? String,
                width: $0["width"] as? Int,
                height: $0["height"] as? Int,
                variants: mediaVariants(from: $0["variants"])
            )
        }
    }

    private static func mediaVariants(from value: Any?) -> [NomiMemoryMediaVariant] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.compactMap {
            guard let url = stringURL($0["url"]) else { return nil }
            return NomiMemoryMediaVariant(
                url: url,
                contentType: $0["contentType"] as? String ?? $0["content_type"] as? String,
                bitRate: $0["bitRate"] as? Int ?? $0["bit_rate"] as? Int
            )
        }
    }

    private static func referencedPosts(from value: Any?) -> [NomiReferencedPost] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.compactMap {
            guard let id = $0["id"] as? String else { return nil }
            return NomiReferencedPost(
                id: id,
                referenceType: $0["referenceType"] as? String ?? $0["reference_type"] as? String,
                username: $0["username"] as? String,
                url: stringURL($0["url"]),
                text: $0["text"] as? String,
                postDate: ($0["postDate"] as? Timestamp)?.dateValue() ?? date(from: $0["postDate"]),
                links: links(from: $0["links"]),
                media: media(from: $0["media"])
            )
        }
    }

    private static func clean(_ dictionary: [String: Any?]) -> [String: Any] {
        dictionary.compactMapValues { $0 }
    }

    private static func stringURL(_ value: Any?) -> URL? {
        guard let string = value as? String else { return nil }
        return URL(string: string)
    }

    private static func date(from value: Any?) -> Date? {
        guard let string = value as? String else { return nil }
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let standardFormatter = ISO8601DateFormatter()
        standardFormatter.formatOptions = [.withInternetDateTime]
        return fractionalFormatter.date(from: string) ?? standardFormatter.date(from: string)
    }
}
