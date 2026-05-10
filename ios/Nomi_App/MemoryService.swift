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
        type: String = "note"
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
            "type": type
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
            type: type
        )
    }
}
