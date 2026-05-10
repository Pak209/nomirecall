import SwiftUI
import FirebaseCore
import GoogleSignIn

@main
struct Nomi_AppApp: App {
    @StateObject private var appSession: AppSession
    @StateObject private var purchaseStore: PurchaseStore

    init() {
        FirebaseBootstrap.configure()
        RevenueCatBootstrap.configure()
        _appSession = StateObject(wrappedValue: AppSession())
        _purchaseStore = StateObject(wrappedValue: PurchaseStore())
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appSession)
                .environmentObject(purchaseStore)
                .task(id: appSession.user?.uid) {
                    await purchaseStore.syncUser(userId: appSession.user?.uid)
                }
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
