import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

enum AppleSignInError: LocalizedError {
    case cancelled
    case missingIdentityToken

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Sign in with Apple was cancelled."
        case .missingIdentityToken:
            return "Apple did not return a valid sign-in token. Please try again."
        }
    }

    static func isCancellation(_ error: Error) -> Bool {
        if let appleError = error as? AppleSignInError, case .cancelled = appleError {
            return true
        }

        return (error as? ASAuthorizationError)?.code == .canceled
    }
}

enum AppleNonce {
    /// Firebase's documented Sign in with Apple nonce scheme: a random string
    /// whose SHA-256 digest goes to Apple while the raw value goes to Firebase,
    /// binding the Apple authorization to this specific Firebase sign-in.
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length

        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess, "Unable to generate a secure nonce: \(status)")

            for random in randoms where remaining > 0 {
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remaining -= 1
                }
            }
        }

        return result
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

/// One-shot async wrapper around ASAuthorizationController, used where the
/// SwiftUI SignInWithAppleButton is not available (account deletion re-auth).
@MainActor
final class AppleAuthorizationFlow: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?

    func requestCredential(hashedNonce: String) async throws -> ASAuthorizationAppleIDCredential {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.nonce = hashedNonce

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            continuation?.resume(throwing: AppleSignInError.missingIdentityToken)
            continuation = nil
            return
        }

        continuation?.resume(returning: credential)
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if AppleSignInError.isCancellation(error) {
            continuation?.resume(throwing: AppleSignInError.cancelled)
        } else {
            continuation?.resume(throwing: error)
        }

        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
