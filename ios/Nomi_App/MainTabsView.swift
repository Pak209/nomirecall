import SwiftUI

struct MainTabsView: View {
    @StateObject private var memoryStore = MemoryStore()

    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            QuickCaptureView()
                .tabItem {
                    Label("Capture", systemImage: "plus.circle.fill")
                }

            RecallView()
                .tabItem {
                    Label("Recall", systemImage: "clock.arrow.circlepath")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .tint(.pink)
        .environmentObject(memoryStore)
    }
}
