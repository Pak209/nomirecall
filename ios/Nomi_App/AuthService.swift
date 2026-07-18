import AuthenticationServices
import Foundation
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
import GoogleSignIn
import LocalAuthentication
import Security
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

    @MainActor
    func signInWithApple(authorization: ASAuthorization, rawNonce: String) async throws -> User {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityTokenData = appleIDCredential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8) else {
            throw AppleSignInError.missingIdentityToken
        }

        // fullName is only delivered on the first authorization for this Apple
        // ID; Firebase persists it as the user's displayName when present.
        let credential = OAuthProvider.appleCredential(
            withIDToken: identityToken,
            rawNonce: rawNonce,
            fullName: appleIDCredential.fullName
        )

        do {
            let authResult = try await Auth.auth().signIn(with: credential)
            return authResult.user
        } catch {
            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    func signOut() throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }
}

enum BiometricCredentialError: LocalizedError {
    case credentialsUnavailable
    case biometricsUnavailable
    case passwordEncodingFailed

    var errorDescription: String? {
        switch self {
        case .credentialsUnavailable:
            return "No remembered Nomi login is available yet."
        case .biometricsUnavailable:
            return "Turn on Face ID or Touch ID for this iPhone before saving a remembered login."
        case .passwordEncodingFailed:
            return "Nomi could not save this password for Face ID."
        }
    }
}

struct RememberedCredentials {
    let email: String
    let password: String
}

final class BiometricCredentialStore {
    private let service = "com.dkimoto.nomi.recall.auth"
    private let account = "firebase-email-password"
    private let rememberEmailKey = "auth.rememberedEmail"
    private let rememberEnabledKey = "auth.rememberMeEnabled"

    var isRememberMeEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: rememberEnabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: rememberEnabledKey) }
    }

    var rememberedEmail: String {
        UserDefaults.standard.string(forKey: rememberEmailKey) ?? ""
    }

    var canUseBiometrics: Bool {
        let context = LAContext()
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    var biometricDisplayName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)

        switch context.biometryType {
        case .faceID:
            return "Face ID"
        case .touchID:
            return "Touch ID"
        default:
            return "biometrics"
        }
    }

    var hasRememberedCredentials: Bool {
        !rememberedEmail.isEmpty
    }

    func save(email: String, password: String) throws {
        guard let passwordData = password.data(using: .utf8) else {
            throw BiometricCredentialError.passwordEncodingFailed
        }
        guard canUseBiometrics else {
            throw BiometricCredentialError.biometricsUnavailable
        }

        var accessControlError: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,
            &accessControlError
        ) else {
            throw accessControlError?.takeRetainedValue() as Error? ?? BiometricCredentialError.biometricsUnavailable
        }

        try deleteCredentials()

        var attributes = baseQuery()
        attributes[kSecValueData as String] = passwordData
        attributes[kSecAttrAccessControl as String] = accessControl

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }

        UserDefaults.standard.set(email.trimmingCharacters(in: .whitespacesAndNewlines), forKey: rememberEmailKey)
        isRememberMeEnabled = true
    }

    func loadWithBiometrics(reason: String) throws -> RememberedCredentials {
        let email = rememberedEmail
        guard !email.isEmpty else { throw BiometricCredentialError.credentialsUnavailable }

        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        context.localizedReason = reason

        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecUseAuthenticationContext as String] = context

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let passwordData = item as? Data, let password = String(data: passwordData, encoding: .utf8) else {
            throw BiometricCredentialError.credentialsUnavailable
        }

        return RememberedCredentials(email: email, password: password)
    }

    func forgetCredentials() throws {
        try deleteCredentials()
        UserDefaults.standard.removeObject(forKey: rememberEmailKey)
        isRememberMeEnabled = false
    }

    private func deleteCredentials() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum AccountDeletionError: LocalizedError {
    case userNotSignedIn
    case requiresRecentLogin

    var errorDescription: String? {
        switch self {
        case .userNotSignedIn:
            return "You need to be signed in before Nomi can delete your account."
        case .requiresRecentLogin:
            return "For your security, Firebase needs a fresh sign-in before deleting this account. Please sign out, sign back in, then delete your account again."
        }
    }
}

final class AccountDeletionService {
    private let database = Firestore.firestore()
    private let storage = Storage.storage()
    private let userSubcollections = [
        "dailyBriefs",
        "memoryEdges",
        "projects",
        "sync",
        "topicPages",
        "usage"
    ]
    private let memorySubcollections = [
        "chunks"
    ]

    func deleteCurrentUserAccount() async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }
        guard let user = Auth.auth().currentUser else { throw AccountDeletionError.userNotSignedIn }

        let userId = user.uid

        if isAppleUser(user) {
            // Apple requires revoking Sign in with Apple tokens when the
            // account is deleted (guideline 5.1.1(v)); the fresh authorization
            // also satisfies Firebase's recent-login requirement.
            try await reauthenticateAppleUserAndRevokeToken(user)
        } else {
            guard !needsFreshSignIn(user) else {
                throw AccountDeletionError.requiresRecentLogin
            }
        }

        try await deleteStorageFiles(userId: userId)
        try await deleteFirestoreData(userId: userId)

        do {
            try await user.delete()
        } catch {
            if isRecentLoginRequired(error) {
                throw AccountDeletionError.requiresRecentLogin
            }

            throw AuthErrorFormatter.userFacingError(from: error)
        }
    }

    private func deleteFirestoreData(userId: String) async throws {
        let userDocument = database.collection("users").document(userId)
        try await deleteMemories(userDocument.collection("memories"))
        for collectionName in userSubcollections {
            try await deleteCollection(userDocument.collection(collectionName))
        }
        try await userDocument.delete()
    }

    private func deleteMemories(_ collection: CollectionReference, batchSize: Int = 100) async throws {
        while true {
            let snapshot = try await collection.limit(to: batchSize).getDocuments()
            guard !snapshot.documents.isEmpty else { return }

            for document in snapshot.documents {
                for subcollectionName in memorySubcollections {
                    try await deleteCollection(document.reference.collection(subcollectionName))
                }
            }

            let batch = database.batch()
            snapshot.documents.forEach { batch.deleteDocument($0.reference) }
            try await batch.commit()

            if snapshot.documents.count < batchSize {
                return
            }
        }
    }

    private func deleteCollection(_ collection: CollectionReference, batchSize: Int = 200) async throws {
        while true {
            let snapshot = try await collection.limit(to: batchSize).getDocuments()
            guard !snapshot.documents.isEmpty else { return }

            let batch = database.batch()
            snapshot.documents.forEach { batch.deleteDocument($0.reference) }
            try await batch.commit()

            if snapshot.documents.count < batchSize {
                return
            }
        }
    }

    private func deleteStorageFiles(userId: String) async throws {
        let userStorageRoot = storage.reference()
            .child("users")
            .child(userId)

        try await deleteStorageTree(userStorageRoot)
    }

    private func deleteStorageTree(_ reference: StorageReference) async throws {
        let result: StorageListResult

        do {
            result = try await reference.listAll()
        } catch {
            if isStorageObjectNotFound(error) {
                return
            }

            throw error
        }

        for item in result.items {
            do {
                try await item.delete()
            } catch {
                if !isStorageObjectNotFound(error) {
                    throw error
                }
            }
        }

        for prefix in result.prefixes {
            try await deleteStorageTree(prefix)
        }
    }

    private func isAppleUser(_ user: User) -> Bool {
        user.providerData.contains { $0.providerID == "apple.com" }
    }

    @MainActor
    private func reauthenticateAppleUserAndRevokeToken(_ user: User) async throws {
        let rawNonce = AppleNonce.randomNonceString()
        let flow = AppleAuthorizationFlow()
        let appleCredential = try await flow.requestCredential(hashedNonce: AppleNonce.sha256(rawNonce))

        guard let identityTokenData = appleCredential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8) else {
            throw AppleSignInError.missingIdentityToken
        }

        let credential = OAuthProvider.appleCredential(
            withIDToken: identityToken,
            rawNonce: rawNonce,
            fullName: nil
        )
        try await user.reauthenticate(with: credential)

        if let codeData = appleCredential.authorizationCode,
           let authorizationCode = String(data: codeData, encoding: .utf8) {
            // Best-effort: a transient revocation failure must not strand the
            // user's data deletion, which is the part they can see.
            try? await Auth.auth().revokeToken(withAuthorizationCode: authorizationCode)
        }
    }

    private func isRecentLoginRequired(_ error: Error) -> Bool {
        let nsError = error as NSError
        return AuthErrorCode(_bridgedNSError: nsError)?.code == .requiresRecentLogin
            || nsError.code == AuthErrorCode.requiresRecentLogin.rawValue
    }

    private func isStorageObjectNotFound(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == StorageErrorDomain
            && nsError.code == StorageErrorCode.objectNotFound.rawValue
    }

    private func needsFreshSignIn(_ user: User) -> Bool {
        guard let lastSignInDate = user.metadata.lastSignInDate else { return false }
        return Date().timeIntervalSince(lastSignInDate) > 240
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
            return DisplayableAuthError("This sign-in method is not enabled in Firebase Authentication yet.")
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
