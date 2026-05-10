import Foundation
import FirebaseAuth

enum AuthServiceError: LocalizedError {
    case firebaseNotConfigured

    var errorDescription: String? {
        switch self {
        case .firebaseNotConfigured:
            return "Firebase is not configured yet. Add GoogleService-Info.plist to the Nomi_App target."
        }
    }
}

final class AuthService {
    func signIn(email: String, password: String) async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return result.user
    }

    func signUp(email: String, password: String) async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return result.user
    }

    func signOut() throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        try Auth.auth().signOut()
    }
}
