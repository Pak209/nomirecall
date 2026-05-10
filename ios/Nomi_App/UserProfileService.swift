import Foundation
import FirebaseAuth
import FirebaseFirestore

struct UserProfile: Identifiable, Codable, Equatable {
    let id: String
    var email: String?
    var displayName: String?
    var onboardingCompleted: Bool
    var createdAt: Date?
    var updatedAt: Date?
}

final class UserProfileService {
    private let database = Firestore.firestore()

    func profile(for user: User) async throws -> UserProfile {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let reference = userReference(userId: user.uid)
        let snapshot = try await reference.getDocument()

        if snapshot.exists {
            return UserProfile(
                id: user.uid,
                email: snapshot.get("email") as? String ?? user.email,
                displayName: snapshot.get("displayName") as? String ?? user.displayName,
                onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? false,
                createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
                updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
            )
        }

        let profile = UserProfile(
            id: user.uid,
            email: user.email,
            displayName: user.displayName,
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
            "onboardingCompleted": true,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)

        let snapshot = try await reference.getDocument()
        return UserProfile(
            id: userId,
            email: snapshot.get("email") as? String,
            displayName: snapshot.get("displayName") as? String,
            onboardingCompleted: snapshot.get("onboardingCompleted") as? Bool ?? true,
            createdAt: (snapshot.get("createdAt") as? Timestamp)?.dateValue(),
            updatedAt: (snapshot.get("updatedAt") as? Timestamp)?.dateValue()
        )
    }

    private func userReference(userId: String) -> DocumentReference {
        database.collection("users").document(userId)
    }
}
