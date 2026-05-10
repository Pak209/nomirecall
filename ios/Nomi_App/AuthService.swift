import Foundation
import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import UIKit

enum AuthServiceError: LocalizedError {
    case firebaseNotConfigured
    case googleClientIDMissing
    case googlePresentationContextMissing
    case googleIDTokenMissing

    var errorDescription: String? {
        switch self {
        case .firebaseNotConfigured:
            return "Firebase is not configured yet. Add GoogleService-Info.plist to the Nomi_App target."
        case .googleClientIDMissing:
            return "Google Sign-In is missing CLIENT_ID in GoogleService-Info.plist. Download a fresh plist from Firebase after enabling Google sign-in."
        case .googlePresentationContextMissing:
            return "Nomi could not open the Google sign-in window. Please try again."
        case .googleIDTokenMissing:
            return "Google did not return a valid sign-in token. Please try again."
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

    @MainActor
    func signInWithGoogle() async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw AuthServiceError.googleClientIDMissing
        }
        guard let presenter = UIApplication.shared.nomiRootViewController else {
            throw AuthServiceError.googlePresentationContextMissing
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)

            guard let idToken = result.user.idToken?.tokenString else {
                throw AuthServiceError.googleIDTokenMissing
            }

            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString
            )
            let authResult = try await Auth.auth().signIn(with: credential)
            return authResult.user
        } catch let error as AuthServiceError {
            throw error
        } catch {
            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    func signOut() throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        try Auth.auth().signOut()
    }
}

private extension UIApplication {
    var nomiRootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController?
            .topMostPresentedViewController
    }
}

private extension UIViewController {
    var topMostPresentedViewController: UIViewController {
        if let presentedViewController {
            return presentedViewController.topMostPresentedViewController
        }

        if let navigationController = self as? UINavigationController,
           let visibleViewController = navigationController.visibleViewController {
            return visibleViewController.topMostPresentedViewController
        }

        if let tabBarController = self as? UITabBarController,
           let selectedViewController = tabBarController.selectedViewController {
            return selectedViewController.topMostPresentedViewController
        }

        return self
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
