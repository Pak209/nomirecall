import Foundation
import FirebaseCore

enum FirebaseBootstrap {
    static func configure() {
        guard FirebaseApp.app() == nil else { return }

        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        } else {
            assertionFailure("Add GoogleService-Info.plist to the Nomi_App target before using Firebase.")
            print("Firebase skipped: GoogleService-Info.plist is missing from the Nomi_App target.")
        }
    }
}
