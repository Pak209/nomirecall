import Foundation
import FirebaseFirestore

enum FirebaseErrorFormatter {
    static func userFacingMessage(from error: Error, action: String) -> String {
        let nsError = error as NSError

        if nsError.domain == FirestoreErrorDomain,
           let code = FirestoreErrorCode.Code(rawValue: nsError.code) {
            switch code {
            case .permissionDenied:
                return "\(action) needs Firestore access. Update Firestore rules so signed-in users can read and write their own /users/{uid} profile and memories."
            case .unavailable:
                return "\(action) could not reach Firestore. Check your connection and try again."
            case .unauthenticated:
                return "\(action) needs you to be signed in again."
            default:
                break
            }
        }

        return error.localizedDescription
    }
}
