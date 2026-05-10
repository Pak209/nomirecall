import Foundation
import RevenueCat

enum RevenueCatBootstrap {
    #if DEBUG
    static let apiKey = "test_bttPcQWbrAMlgJEOIWVYlokorNq"
    #else
    static let apiKey = ""
    #endif

    static let proEntitlementIdentifier = "Nomi Pro"

    static var isReadyForPurchases: Bool {
        Purchases.isConfigured
    }

    static func configure() {
        guard !Purchases.isConfigured else { return }

        let trimmedKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKey.isEmpty else {
            print("[RevenueCat] Skipping configuration: production API key is not set.")
            return
        }

        #if !DEBUG
        guard !trimmedKey.hasPrefix("test_") else {
            print("[RevenueCat] Skipping configuration: test API keys cannot be used in Release/TestFlight builds.")
            return
        }
        #endif

        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: trimmedKey)
    }
}
