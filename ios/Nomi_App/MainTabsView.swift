import SwiftUI

struct MainTabsView: View {
    @StateObject private var memoryStore = MemoryStore()
    @State private var selectedTab: NomiTab = .home

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selectedTab {
                case .home:
                    HomeView {
                        selectedTab = .capture
                    }
                case .search:
                    RecallView()
                case .capture:
                    QuickCaptureView()
                case .recall:
                    RecallView()
                case .profile:
                    SettingsView()
                }
            }
            .environmentObject(memoryStore)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            NomiTabBar(selectedTab: $selectedTab)
                .padding(.horizontal, 18)
                .padding(.bottom, 8)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

private enum NomiTab: CaseIterable {
    case home
    case search
    case capture
    case recall
    case profile

    var title: String {
        switch self {
        case .home: "Home"
        case .search: "Search"
        case .capture: "Capture"
        case .recall: "Recall"
        case .profile: "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .home: "house.fill"
        case .search: "magnifyingglass"
        case .capture: "plus"
        case .recall: "clock.arrow.circlepath"
        case .profile: "person"
        }
    }
}

private struct NomiTabBar: View {
    @Binding var selectedTab: NomiTab

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            tabButton(.home)
            tabButton(.search)
            captureButton
            tabButton(.recall)
            tabButton(.profile)
        }
        .padding(.horizontal, 12)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
        .shadow(color: Color(red: 1, green: 0.22, blue: 0.42).opacity(0.14), radius: 22, y: 8)
    }

    private func tabButton(_ tab: NomiTab) -> some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 5) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 20, weight: .semibold))

                Text(tab.title)
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(selectedTab == tab ? Color.nomiCoral : Color.nomiMuted)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var captureButton: some View {
        Button {
            selectedTab = .capture
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(.white)
                .frame(width: 76, height: 76)
                .background(
                    LinearGradient(
                        colors: [Color.nomiOrange, Color.nomiPink],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: Circle()
                )
                .shadow(color: Color.nomiPink.opacity(0.28), radius: 18, y: 10)
                .offset(y: -22)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
