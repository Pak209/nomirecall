import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appSession: AppSession

    var body: some View {
        Group {
            switch appSession.route {
            case .splash:
                SplashView()
            case .loading:
                LoadingView()
            case .auth:
                AuthStackView()
            case .onboarding:
                MeetNomiView()
            case .mainTabs:
                MainTabsView()
            }
        }
        .alert("Nomi needs a second", isPresented: errorBinding) {
            Button("OK", role: .cancel) {
                appSession.errorMessage = nil
            }
        } message: {
            Text(appSession.errorMessage ?? "")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { appSession.errorMessage != nil },
            set: { if !$0 { appSession.errorMessage = nil } }
        )
    }
}

#Preview {
    ContentView()
        .environmentObject(AppSession())
}
