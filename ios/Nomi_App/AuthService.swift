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

        do {
            let result = try await Auth.auth().signIn(withEmail: email, password: password)
            return result.user
        } catch {
            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    func signUp(email: String, password: String) async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        do {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)
            return result.user
        } catch {
            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    func signOut() throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        try Auth.auth().signOut()
    }
}

enum AuthErrorFormatter {
    static func userFacingError(from error: Error) -> Error {
        let nsError = error as NSError
        let authCode = AuthErrorCode(_bridgedNSError: nsError)?.code

        switch authCode {
        case .invalidEmail:
            return DisplayableAuthError("Enter a valid email address.")
        case .wrongPassword, .invalidCredential:
            return DisplayableAuthError("That email or password does not look right.")
        case .userNotFound:
            return DisplayableAuthError("No Nomi account exists for that email yet. Try signing up first.")
        case .emailAlreadyInUse:
            return DisplayableAuthError("That email already has an account. Try signing in instead.")
        case .weakPassword:
            return DisplayableAuthError("Use a password with at least 6 characters.")
        case .networkError:
            return DisplayableAuthError("Nomi could not reach Firebase. Check your connection and try again.")
        case .operationNotAllowed:
            return DisplayableAuthError("Email/password sign-in is not enabled in Firebase Authentication.")
        default:
            #if DEBUG
            let details = [nsError.localizedDescription, nsError.userInfo.description]
                .joined(separator: "\n")
            return DisplayableAuthError("Firebase auth failed (\(authCode?.rawValue ?? nsError.code)).\n\(details)")
            #else
            return DisplayableAuthError("Could not sign in right now. Please try again.")
            #endif
        }
    }
}

struct DisplayableAuthError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}
