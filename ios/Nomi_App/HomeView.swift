import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    var onQuickCapture: () -> Void = {}

    private var recentMemories: [NomiMemory] {
        Array(memoryStore.memories.prefix(5))
    }

    private var todayMemories: [NomiMemory] {
        memoryStore.memories.filter { Calendar.current.isDateInToday($0.createdAt) }
    }

    private var displayName: String {
        let raw = appSession.profile?.displayName ?? appSession.profile?.email?.split(separator: "@").first.map(String.init)
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value! : "there"
    }

    private var topCategories: String {
        let categories = Array(Set(memoryStore.memories.map(\.category)))
            .filter { !$0.isEmpty }
            .prefix(3)
            .map { $0.lowercased() }
        return categories.isEmpty ? "ideas, links, and inspiration" : categories.joined(separator: ", ")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 24) {
                        header
                        quickCapturePanel
                        todaySection
                        recentSection
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 24)
                    .padding(.bottom, 122)
                }
                .refreshable {
                    await loadMemories()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await loadMemories()
            }
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("\(greeting), \(displayName) ☀")
                        .font(.system(size: 39, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(2)
                        .minimumScaleFactor(0.72)

                    HStack(spacing: 10) {
                        Label("Streak 7 days", systemImage: "flame.fill")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(Color(red: 0.88, green: 0.29, blue: 0.18))
                            .padding(.vertical, 9)
                            .padding(.horizontal, 14)
                            .background(Color(red: 1.0, green: 0.90, blue: 0.85), in: Capsule())
                            .overlay(
                                Capsule()
                                    .stroke(Color.nomiCoral.opacity(0.28), lineWidth: 1)
                            )

                        Text("Keep it going!")
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(Color.nomiMuted)
                    }
                }

                Spacer(minLength: 14)

                ZStack(alignment: .bottomTrailing) {
                    Image("NomiMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 58, height: 58)
                        .padding(8)
                        .background(Color(red: 1.0, green: 0.78, blue: 0.74), in: Circle())

                    Circle()
                        .fill(Color(red: 0.16, green: 0.84, blue: 0.45))
                        .frame(width: 15, height: 15)
                        .overlay(Circle().stroke(.white, lineWidth: 3))
                }
            }
        }
    }

    private var quickCapturePanel: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                Text("Quick capture anything...")
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)

                Spacer()

                Image(systemName: "sparkle")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white.opacity(0.88))
                    .frame(width: 52, height: 52)
                    .background(.white.opacity(0.18), in: Circle())
            }

            HStack(spacing: 14) {
                captureButton("Note", "note.text")
                captureButton("Link", "link")
                captureButton("Image", "photo")
                captureButton("Voice", "mic")
            }
        }
        .padding(24)
        .background(
            LinearGradient(
                colors: [Color.nomiOrange, Color.nomiCoral, Color.nomiPink],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: Color.nomiPink.opacity(0.22), radius: 24, y: 12)
    }

    private func captureButton(_ title: String, _ icon: String) -> some View {
        Button {
            onQuickCapture()
        } label: {
            VStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 25, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                Text(title)
                    .font(.headline.weight(.black))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 112)
            .background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.26), lineWidth: 1.4)
            )
        }
        .buttonStyle(.plain)
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader("Today", trailing: todayMemories.isEmpty ? nil : "See all")

            if memoryStore.isLoading && memoryStore.memories.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 132)
                    .background(.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            } else {
                aiSummaryCard

                if let resurfaced = memoryStore.memories.dropFirst(min(1, memoryStore.memories.count)).first ?? memoryStore.memories.first {
                    NavigationLink(value: resurfaced) {
                        resurfacedCard(resurfaced)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var aiSummaryCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                Image(systemName: "sparkle")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color.nomiPurple)
                    .frame(width: 56, height: 56)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: Color.nomiPurple.opacity(0.12), radius: 10, y: 6)

                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 8) {
                        Text("AI summary")
                            .font(.title3.weight(.black))
                            .foregroundStyle(Color.nomiInk)

                        Text("NEW")
                            .font(.caption.weight(.black))
                            .foregroundStyle(Color.nomiPurple)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 9)
                            .background(.white.opacity(0.85), in: Capsule())
                            .overlay(Capsule().stroke(Color.nomiPurple.opacity(0.24), lineWidth: 1))
                    }

                    Text(memoryStore.memories.isEmpty ? "Generated once you start capturing" : "Generated just now")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                }
            }

            Text(summaryText)
                .font(.system(size: 18, weight: .regular, design: .rounded))
                .foregroundStyle(Color.nomiInk)
                .lineSpacing(4)

            Button {
            } label: {
                HStack(spacing: 10) {
                    Text("View summary")
                    Image(systemName: "chevron.right")
                }
                .font(.headline.weight(.black))
                .foregroundStyle(Color.nomiInk)
                .padding(.vertical, 12)
                .padding(.horizontal, 22)
                .background(.white.opacity(0.88), in: Capsule())
                .overlay(Capsule().stroke(Color.nomiPurple.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .background(
            LinearGradient(
                colors: [Color(red: 0.96, green: 0.89, blue: 1.0), Color(red: 1.0, green: 0.91, blue: 0.96)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.nomiPurple.opacity(0.17), lineWidth: 1.2)
        )
    }

    private func resurfacedCard(_ memory: NomiMemory) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Resurfaced memory ✦")
                        .font(.title3.weight(.black))
                        .foregroundStyle(Color.nomiInk)

                    Spacer()

                    Text(memory.displayDate)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiMuted)
                }

                Text(memory.previewText.isEmpty ? memory.title : "\"\(memory.previewText)\"")
                    .font(.system(size: 20, weight: .medium, design: .rounded))
                    .italic()
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(3)

                Text(memory.sourceUsername ?? memory.category)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)

                Text("Open note  ›")
                    .font(.headline.weight(.black))
                    .foregroundStyle(.white)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 20)
                    .background(Color.nomiInk, in: Capsule())
            }

            Image("NomiMascot")
                .resizable()
                .scaledToFit()
                .frame(width: 64, height: 64)
                .opacity(0.84)
        }
        .padding(24)
        .background(Color(red: 1.0, green: 0.94, blue: 0.93).opacity(0.90), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.nomiCoral.opacity(0.18), lineWidth: 1.2)
        )
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader("Recent captures", trailing: recentMemories.isEmpty ? nil : "See all")

            if recentMemories.isEmpty {
                EmptyStateView(
                    title: "No memories yet",
                    message: "Your real captures will show here as soon as you save them."
                )
                .background(.white.opacity(0.76), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(recentMemories) { memory in
                        NavigationLink(value: memory) {
                            RecentCaptureRow(memory: memory)
                        }
                        .buttonStyle(.plain)

                        if memory.id != recentMemories.last?.id {
                            Divider()
                                .padding(.leading, 80)
                        }
                    }
                }
                .padding(.vertical, 10)
                .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.black.opacity(0.05), lineWidth: 1)
                )
            }
        }
    }

    private func sectionHeader(_ title: String, trailing: String?) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 27, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)

            Spacer()

            if let trailing {
                Text(trailing)
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.nomiCoral)
            }
        }
    }

    private var summaryText: String {
        if memoryStore.memories.isEmpty {
            return "Save a note, link, image, or voice thought and Nomi will start building your daily summary."
        }

        let linkCount = memoryStore.memories.filter { ["link", "tweet", "url"].contains($0.type.lowercased()) }.count
        let ideaCount = max(memoryStore.memories.count - linkCount, 0)
        return "You captured \(ideaCount) ideas and \(linkCount) links. Top themes: \(topCategories)."
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    private func loadMemories() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }
}

private struct RecentCaptureRow: View {
    let memory: NomiMemory

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 21, weight: .bold))
                .foregroundStyle(Color.nomiCoral)
                .frame(width: 52, height: 52)
                .background(Color(red: 1.0, green: 0.91, blue: 0.86), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 5) {
                Text(memory.title)
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Text("\(memory.displayType) · \(memory.displayDate)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
            }

            Spacer(minLength: 10)

            Text("#\(memory.category.lowercased().replacingOccurrences(of: " ", with: ""))")
                .font(.subheadline.weight(.black))
                .foregroundStyle(Color.nomiCoral)
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color(red: 1.0, green: 0.91, blue: 0.87), in: Capsule())
                .lineLimit(1)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var icon: String {
        switch memory.type.lowercased() {
        case "link", "url", "tweet": "link"
        case "image": "photo"
        case "voice": "mic"
        default: "note.text"
        }
    }
}
