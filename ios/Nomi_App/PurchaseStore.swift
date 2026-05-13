import Foundation
import RevenueCat

@MainActor
final class PurchaseStore: ObservableObject {
    @Published private(set) var customerInfo: CustomerInfo?
    @Published private(set) var offerings: Offerings?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    var hasNomiPro: Bool {
        customerInfo?.entitlements[RevenueCatBootstrap.proEntitlementIdentifier]?.isActive == true
    }

    var proStatusLabel: String {
        if !RevenueCatBootstrap.isReadyForPurchases {
            return "Purchases not configured"
        }
        return hasNomiPro ? "Nomi Pro active" : "Free plan"
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
        defer { isLoading = false }

        do {
            async let customerInfo = Purchases.shared.customerInfo()
            async let offerings = Purchases.shared.offerings()
            self.customerInfo = try await customerInfo
            let loadedOfferings = try await offerings
            self.offerings = loadedOfferings

            if loadedOfferings.current == nil {
                errorMessage = "RevenueCat has no current offering. Mark an offering as Current and attach the App Store product."
            } else if loadedOfferings.current?.availablePackages.isEmpty == true {
                errorMessage = "RevenueCat current offering has no packages. Add the Monthly App Store product to the offering."
            } else {
                errorMessage = nil
            }
        } catch {
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
        defer { isLoading = false }

        do {
            customerInfo = try await Purchases.shared.restorePurchases()
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
        defer { isLoading = false }

        do {
            let result = try await Purchases.shared.purchase(package: package)
            customerInfo = result.customerInfo
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

    private static func readableErrorMessage(from error: Error) -> String {
        let message = error.localizedDescription
        let lowercased = message.lowercased()

        if lowercased.contains("configuration") || lowercased.contains("products") || lowercased.contains("offerings") {
            return "RevenueCat could not load Nomi Pro. Confirm the current offering contains the App Store product ID exactly as it appears in App Store Connect, then try again."
        }

        if lowercased.contains("cancel") {
            return "Purchase canceled."
        }

        if lowercased.contains("network") || lowercased.contains("internet") {
            return "Could not reach RevenueCat. Check your connection and try again."
        }

        return message
    }
}
