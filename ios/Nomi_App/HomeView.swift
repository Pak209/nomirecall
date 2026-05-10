import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    private var recentMemories: [NomiMemory] {
        Array(memoryStore.memories.prefix(5))
    }

    private var todayMemories: [NomiMemory] {
        memoryStore.memories.filter { Calendar.current.isDateInToday($0.createdAt) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        header
                        todaySection
                        recentSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 32)
                }
                .refreshable {
                    await loadMemories()
                }
            }
            .navigationTitle("Home")
            .task {
                await loadMemories()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Welcome back")
                .font(.largeTitle.bold())

            Text(appSession.profile?.email ?? "Your Nomi memory is ready.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Today")
                    .font(.title2.bold())

                Spacer()

                Text("\(todayMemories.count) captured")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.pink)
            }

            if memoryStore.isLoading && memoryStore.memories.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else if todayMemories.isEmpty {
                EmptyStateView(
                    title: "Nothing captured today",
                    message: "Use Quick Capture to save notes, links, images, and voice memories."
                )
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(todayMemories) { memory in
                            NavigationLink(value: memory) {
                                MemoryCardView(memory: memory)
                                    .frame(width: 300)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .navigationDestination(for: NomiMemory.self) { memory in
            MemoryDetailView(memory: memory)
        }
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent captures")
                .font(.title2.bold())

            if recentMemories.isEmpty {
                EmptyStateView(
                    title: "No memories yet",
                    message: "Your real captures will show here as soon as you save them."
                )
            } else {
                VStack(spacing: 12) {
                    ForEach(recentMemories) { memory in
                        NavigationLink(value: memory) {
                            MemoryCardView(memory: memory)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func loadMemories() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }
}
