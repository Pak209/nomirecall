import Foundation
import RevenueCat

enum RevenueCatBootstrap {
    // RevenueCat public SDK keys are intentionally shipped in the client.
    // This must be the iOS public key from RevenueCat, not a secret API key.
    static let apiKey = "appl_HUPnABuXmDYjCuQKeiuJGmQbKHg"

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

        guard !trimmedKey.hasPrefix("test_") else {
            print("[RevenueCat] Skipping configuration: test API keys cannot be used in app builds.")
            return
        }

        // TEMP DEBUG: Keep RevenueCat verbose while diagnosing TestFlight subscription loading.
        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: trimmedKey)
    }
}
