import Foundation
import RevenueCat

enum RevenueCatBootstrap {
    static let apiKey = "test_bttPcQWbrAMlgJEOIWVYlokorNq"
    static let proEntitlementIdentifier = "Nomi Pro"

    static func configure() {
        guard !Purchases.isConfigured else { return }
        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: apiKey)
    }
}
