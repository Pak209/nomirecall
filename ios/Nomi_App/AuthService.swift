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
            let result = try await Auth.auth().signIn(
                withEmail: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            return result.user
        } catch {
            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    func signUp(email: String, password: String) async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        do {
            let result = try await Auth.auth().createUser(
                withEmail: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
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
        let authCode = AuthErrorCode(_bridgedNSError: nsError)
        let rawCode = authCode?.code.rawValue ?? nsError.code

        switch rawCode {
        case AuthErrorCode.invalidEmail.rawValue:
            return DisplayableAuthError("Enter a valid email address.")
        case AuthErrorCode.wrongPassword.rawValue, AuthErrorCode.invalidCredential.rawValue:
            return DisplayableAuthError("That email or password does not look right.")
        case AuthErrorCode.userNotFound.rawValue:
            return DisplayableAuthError("No Nomi account exists for that email yet. Try signing up first.")
        case AuthErrorCode.emailAlreadyInUse.rawValue:
            return DisplayableAuthError("That email already has an account. Try signing in instead.")
        case AuthErrorCode.weakPassword.rawValue:
            return DisplayableAuthError("Use a password with at least 6 characters.")
        case AuthErrorCode.networkError.rawValue:
            return DisplayableAuthError("Nomi could not reach Firebase. Check your connection and try again.")
        case AuthErrorCode.operationNotAllowed.rawValue:
            return DisplayableAuthError("Email/password sign-in is not enabled in Firebase Authentication.")
        case AuthErrorCode.appNotAuthorized.rawValue:
            return DisplayableAuthError("This app is not authorized for Firebase Auth. Check the iOS bundle ID and API key restrictions in Google Cloud.")
        case AuthErrorCode.invalidAPIKey.rawValue:
            return DisplayableAuthError("Firebase rejected the API key. Re-download GoogleService-Info.plist or loosen the key restrictions for this iOS app.")
        case AuthErrorCode.internalError.rawValue:
            let details = debugDetails(from: nsError)
            return DisplayableAuthError("Firebase Auth is being blocked. Check Email/Password sign-in and API key restrictions for bundle ID com.dkimoto.nomi.recall. Code \(nsError.code).\n\(details)")
        default:
            let details = debugDetails(from: nsError)
            return DisplayableAuthError("Firebase auth failed (\(rawCode)).\n\(details)")
        }
    }

    private static func debugDetails(from error: NSError) -> String {
        let response = error.userInfo["FIRAuthErrorUserInfoDeserializedResponseKey"]
            ?? error.userInfo["NSUnderlyingError"]
            ?? error.userInfo["NSLocalizedFailureReason"]

        if let response {
            return "\(response)"
        }

        return error.localizedDescription
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
