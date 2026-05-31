import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import UIKit

struct UserProfile: Identifiable, Codable, Equatable {
    let id: String
    var email: String?
    var username: String?
    var displayName: String?
    var photoURL: URL?
    var onboardingCompleted: Bool
    var createdAt: Date?
    var updatedAt: Date?
}

final class UserProfileService {
    private let database = Firestore.firestore()
    private let storage = Storage.storage()

    func profile(for user: User) async throws -> UserProfile {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let reference = userReference(userId: user.uid)
        let snapshot = try await reference.getDocument()

        if snapshot.exists {
            return UserProfile(
                id: user.uid,
                email: snapshot.get("email") as? String ?? user.email,
                username: snapshot.get("username") as? String,
                displayName: snapshot.get("displayName") as? String ?? user.displayName,
                photoURL: Self.profileImageURL(from: snapshot),
                onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? false,
                createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
                updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
            )
        }

        let profile = UserProfile(
            id: user.uid,
            email: user.email,
            username: nil,
            displayName: user.displayName,
            photoURL: user.photoURL,
            onboardingCompleted: false,
            createdAt: Date(),
            updatedAt: Date()
        )

        var data: [String: Any] = [
            "id": profile.id,
            "onboardingCompleted": false,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if let email = profile.email {
            data["email"] = email
        }

        if let displayName = profile.displayName {
            data["displayName"] = displayName
        }

        try await reference.setData(data, merge: true)

        return profile
    }

    func markOnboardingComplete(userId: String) async throws -> UserProfile {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let reference = userReference(userId: userId)
        try await reference.setData([
            "id": userId,
            "onboardingCompleted": true,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)

        let snapshot = try await reference.getDocument()
        return UserProfile(
                id: userId,
                email: snapshot.get("email") as? String,
                username: snapshot.get("username") as? String,
                displayName: snapshot.get("displayName") as? String,
                photoURL: Self.profileImageURL(from: snapshot),
                onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? true,
                createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
                updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
        )
    }

    func uploadProfileImage(userId: String, imageData: Data) async throws -> UserProfile {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let uploadData = Self.compressedJPEGData(from: imageData) ?? imageData
        let filename = "avatar-\(Int(Date().timeIntervalSince1970)).jpg"
        let reference = storage.reference()
            .child("users")
            .child(userId)
            .child("profile")
            .child(filename)

        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        _ = try await reference.putDataAsync(uploadData, metadata: metadata)

        let url = try await Self.downloadURLWithRetry(for: reference)
        let userReference = userReference(userId: userId)
        try await userReference.setData([
            "photoURL": url.absoluteString,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)

        let snapshot = try await userReference.getDocument()
        return UserProfile(
            id: userId,
            email: snapshot.get("email") as? String,
            username: snapshot.get("username") as? String,
            displayName: snapshot.get("displayName") as? String,
            photoURL: Self.profileImageURL(from: snapshot),
            onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? true,
            createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
            updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
        )
    }

    func updateUsername(userId: String, username: String) async throws -> UserProfile {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let cleaned = Self.normalizedUsername(username)
        let reference = userReference(userId: userId)
        try await reference.setData([
            "username": cleaned,
            "displayName": cleaned,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)

        let snapshot = try await reference.getDocument()
        return UserProfile(
            id: userId,
            email: snapshot.get("email") as? String,
            username: snapshot.get("username") as? String,
            displayName: snapshot.get("displayName") as? String,
            photoURL: Self.profileImageURL(from: snapshot),
            onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? true,
            createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
            updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
        )
    }

    private func userReference(userId: String) -> DocumentReference {
        database.collection("users").document(userId)
    }

    private static func profileImageURL(from snapshot: DocumentSnapshot) -> URL? {
        let raw = snapshot.get("photoURL") as? String
            ?? snapshot.get("profileImageUrl") as? String
            ?? snapshot.get("avatarUrl") as? String
        guard let raw, !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    static func normalizedUsername(_ username: String) -> String {
        let trimmed = username
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "@", with: "")
            .lowercased()
        return String(trimmed.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "." })
    }

    private static func downloadURLWithRetry(for reference: StorageReference, attempts: Int = 4) async throws -> URL {
        var lastError: Error?

        for attempt in 0..<attempts {
            do {
                return try await reference.downloadURL()
            } catch {
                lastError = error
                guard attempt < attempts - 1 else { break }
                try await Task.sleep(nanoseconds: UInt64(250_000_000 * (attempt + 1)))
            }
        }

        throw lastError ?? AuthServiceError.firebaseNotConfigured
    }

    private static func compressedJPEGData(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let maxDimension: CGFloat = 768
        let largestSide = max(image.size.width, image.size.height)
        let scale = largestSide > maxDimension ? maxDimension / largestSide : 1
        let targetSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: targetSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: 0.82)
    }
}
