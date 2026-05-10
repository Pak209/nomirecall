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
            self.offerings = try await offerings
        } catch {
            errorMessage = error.localizedDescription
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
            errorMessage = error.localizedDescription
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
            errorMessage = error.localizedDescription
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
            errorMessage = error.localizedDescription
        }
    }

    private func observeCustomerInfo() {
        Task {
            for await newCustomerInfo in Purchases.shared.customerInfoStream {
                customerInfo = newCustomerInfo
            }
        }
    }
}
