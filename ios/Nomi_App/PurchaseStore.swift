import Foundation
import RevenueCat

@MainActor
final class PurchaseStore: ObservableObject {
    @Published private(set) var customerInfo: CustomerInfo?
    @Published private(set) var offerings: Offerings?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    var hasNomiPro: Bool {
        proEntitlement?.isActive == true
    }

    var hasExpiredNomiPro: Bool {
        guard let proEntitlement else { return false }
        return !proEntitlement.isActive
    }

    var proStatusLabel: String {
        if !RevenueCatBootstrap.isReadyForPurchases {
            return "Purchases not configured"
        }
        if hasNomiPro {
            return "Nomi Pro active"
        }
        if hasExpiredNomiPro {
            return "Nomi Pro expired"
        }
        return "Free plan"
    }

    private var proEntitlement: EntitlementInfo? {
        customerInfo?.entitlements[RevenueCatBootstrap.proEntitlementIdentifier]
    }

    init() {
        if RevenueCatBootstrap.isReadyForPurchases {
            observeCustomerInfo()
        }
    }

    func refresh() async {
        guard RevenueCatBootstrap.isReadyForPurchases else {
            errorMessage = "Purchases are not configured yet."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            // TEMP DEBUG: Log RevenueCat state while diagnosing TestFlight subscription loading.
            print("RC DEBUG: Fetching customer info...")
            async let customerInfo = Purchases.shared.customerInfo()
            print("RC DEBUG: Fetching offerings...")
            async let offerings = Purchases.shared.offerings()
            self.customerInfo = try await customerInfo
            if let selfCustomerInfo = self.customerInfo {
                print("RC DEBUG: Active entitlement identifiers:", Array(selfCustomerInfo.entitlements.active.keys))
                print("RC DEBUG: All entitlement identifiers:", Array(selfCustomerInfo.entitlements.all.keys))
            }

            let loadedOfferings = try await offerings
            self.offerings = loadedOfferings
            Self.logOfferingsDebugInfo(loadedOfferings)

            if loadedOfferings.current == nil {
                errorMessage = "RevenueCat has no current offering. Mark an offering as Current and attach the App Store product."
            } else if loadedOfferings.current?.availablePackages.isEmpty == true {
                errorMessage = "RevenueCat current offering has no packages. Add the Monthly App Store product to the offering."
            }
        } catch {
            Self.logRevenueCatError(error)
            errorMessage = Self.readableErrorMessage(from: error)
        }
    }

    func syncUser(userId: String?) async {
        guard RevenueCatBootstrap.isReadyForPurchases else {
            return
        }

        do {
            if let userId, !userId.isEmpty {
                let result = try await Purchases.shared.logIn(userId)
                customerInfo = result.customerInfo
            } else if !Purchases.shared.isAnonymous {
                customerInfo = try await Purchases.shared.logOut()
            }
        } catch {
            errorMessage = Self.readableErrorMessage(from: error)
        }

        await refresh()
    }

    func restorePurchases() async {
        guard RevenueCatBootstrap.isReadyForPurchases else {
            errorMessage = "Purchases are not configured yet."
            return
        }

        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }

        do {
            customerInfo = try await Purchases.shared.restorePurchases()
            successMessage = hasNomiPro
                ? "Nomi Pro has been restored."
                : "Restore finished, but no active Nomi Pro subscription was found for this Apple ID."
        } catch {
            errorMessage = Self.readableErrorMessage(from: error)
        }
    }

    func purchase(_ package: Package) async {
        guard RevenueCatBootstrap.isReadyForPurchases else {
            errorMessage = "Purchases are not configured yet."
            return
        }

        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }

        do {
            let result = try await Purchases.shared.purchase(package: package)
            customerInfo = result.customerInfo
            successMessage = hasNomiPro ? "Nomi Pro is now active." : nil
        } catch {
            errorMessage = Self.readableErrorMessage(from: error)
        }
    }

    private func observeCustomerInfo() {
        Task {
            for await newCustomerInfo in Purchases.shared.customerInfoStream {
                customerInfo = newCustomerInfo
            }
        }
    }

    // TEMP DEBUG: Remove after the TestFlight RevenueCat/StoreKit issue is identified.
    private static func logOfferingsDebugInfo(_ offerings: Offerings) {
        let currentPackages = offerings.current?.availablePackages ?? []
        print("RC DEBUG: Current offering:", offerings.current?.identifier ?? "nil")
        print("RC DEBUG: All offerings:", Array(offerings.all.keys))
        print("RC DEBUG: Packages:", currentPackages.map { $0.identifier })
        print("RC DEBUG: Store products:", currentPackages.map { $0.storeProduct.productIdentifier })
        print("RC DEBUG: Store product titles:", currentPackages.map { $0.storeProduct.localizedTitle })
        print("RC DEBUG: Store product prices:", currentPackages.map { $0.storeProduct.localizedPriceString })
    }

    // TEMP DEBUG: Remove after the TestFlight RevenueCat/StoreKit issue is identified.
    private static func logRevenueCatError(_ error: Error) {
        let nsError = error as NSError
        print("RC ERROR: Failed to fetch offerings:", error)
        print("RC ERROR localized:", error.localizedDescription)
        print("RC ERROR domain:", nsError.domain)
        print("RC ERROR code:", nsError.code)
        print("RC ERROR userInfo:", nsError.userInfo)

        if let underlyingError = nsError.userInfo[NSUnderlyingErrorKey] as? NSError {
            print("RC ERROR underlying:", underlyingError)
            print("RC ERROR underlying localized:", underlyingError.localizedDescription)
            print("RC ERROR underlying domain:", underlyingError.domain)
            print("RC ERROR underlying code:", underlyingError.code)
            print("RC ERROR underlying userInfo:", underlyingError.userInfo)
        }
    }

    private static func readableErrorMessage(from error: Error) -> String {
        let message = error.localizedDescription
        let lowercased = message.lowercased()

        if lowercased.contains("invalid api key") || lowercased.contains("wrong api key") || lowercased.contains("api key") {
            return "Nomi Pro is not configured correctly yet. Confirm the app is using the RevenueCat iOS public SDK key that starts with appl_."
        }

        if lowercased.contains("configuration") || lowercased.contains("products") || lowercased.contains("offerings") {
            return "RevenueCat could not load Nomi Pro. Confirm the current offering contains the App Store product ID exactly as it appears in App Store Connect, then try again."
        }

        if lowercased.contains("cancel") {
            return "Purchase canceled."
        }

        if lowercased.contains("network") || lowercased.contains("internet") {
            return "Could not reach RevenueCat. Check your connection and try again."
        }

        return "Nomi Pro could not be updated right now. Please try again."
    }
}
