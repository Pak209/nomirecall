import SwiftUI
import AVKit

struct HomeView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.colorScheme) private var colorScheme
    @State private var isShowingSummary = false
    @State private var isShowingDailyBrief = false
    @State private var isShowingAskNomi = false
    @State private var isShowingDrawer = false
    @State private var isShowingCaptureOptions = false
    @State private var activeTab: HomeFeedTab = .forYou
    @AppStorage("nomi.theme") private var theme = "light"

    var onQuickCapture: () -> Void = {}
    var onDrawerDestination: (HomeDrawerDestination) -> Void = { _ in }

    private var recentMemories: [NomiMemory] {
        Array(memoryStore.memories.filter { !$0.isArchived }.prefix(24))
    }

    private var todayMemories: [NomiMemory] {
        memoryStore.memories.filter { Calendar.current.isDateInToday($0.createdAt) }
    }

    private var visibleFeedMemories: [NomiMemory] {
        switch activeTab {
        case .forYou, .recent:
            return recentMemories
        case .projects:
            return recentMemories.filter { !$0.projectIds.isEmpty || $0.category.localizedCaseInsensitiveContains("project") }
        case .inbox:
            return recentMemories.filter {
                $0.sync?.importStatus == "pending" || $0.ai?.processingStatus == "pending" || $0.ai?.processingStatus == "processing"
            }
        }
    }

    private var displayName: String {
        let raw = appSession.profile?.displayName ?? appSession.profile?.email?.split(separator: "@").first.map(String.init)
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value! : "Nomi user"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 0) {
                    header
                    HomeFeedTabRow(activeTab: $activeTab)

                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 13) {
                            CompactNativeComposer(onQuickCapture: showCaptureOptions)

                            if memoryStore.isLoading && visibleFeedMemories.isEmpty {
                                ProgressView()
                                    .tint(Color.nomiCoral)
                                    .frame(maxWidth: .infinity, minHeight: 120)
                                    .background(cardFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }

                            if activeTab == .forYou && !memoryStore.memories.isEmpty {
                                NomiSummaryFeedCard(
                                    summaryText: summaryText,
                                    onAsk: { isShowingAskNomi = true },
                                    onOpen: { isShowingSummary = true }
                                )
                            }

                            if visibleFeedMemories.isEmpty && !memoryStore.isLoading {
                                HomeEmptyFeedState(tab: activeTab)
                            } else {
                                LazyVStack(spacing: 12) {
                                    ForEach(visibleFeedMemories) { memory in
                                        NavigationLink(value: memory) {
                                            NativeMemoryFeedCard(
                                                memory: memory,
                                                onAsk: { isShowingAskNomi = true },
                                                onConnect: { isShowingAskNomi = true }
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 220)
                    }
                }
                .refreshable {
                    await loadMemories()
                }

                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button {
                            showCaptureOptions()
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 32, weight: .light))
                                .foregroundStyle(.white)
                                .frame(width: 64, height: 64)
                                .background(
                                    LinearGradient(
                                        colors: [Color.nomiOrange, Color.nomiCoral, Color.nomiPink],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ),
                                    in: Circle()
                                )
                                .shadow(color: Color.nomiPink.opacity(0.34), radius: 14, y: 8)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 22)
                        .padding(.bottom, 98)
                    }
                }

                NomiHomeSideDrawer(
                    isPresented: $isShowingDrawer,
                    displayName: displayName,
                    imageURL: appSession.profile?.photoURL,
                    handle: drawerHandle,
                    memoryCount: memoryStore.memories.count,
                    projectCount: memoryStore.memories.filter { !$0.projectIds.isEmpty }.count,
                    onMenuTap: handleDrawerTap
                )
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await loadMemories()
            }
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
            .sheet(isPresented: $isShowingSummary) {
                DailySummaryView(
                    memories: memoryStore.memories,
                    todayMemories: todayMemories,
                    summaryText: summaryText,
                    topCategories: topCategories
                )
            }
            .sheet(isPresented: $isShowingDailyBrief) {
                DailyBriefView()
                    .environmentObject(memoryStore)
                    .environmentObject(intelligenceStore)
            }
            .sheet(isPresented: $isShowingAskNomi) {
                AskNomiSheet()
                    .environmentObject(memoryStore)
            }
            .confirmationDialog("Capture to Nomi", isPresented: $isShowingCaptureOptions, titleVisibility: .visible) {
                Button("Note") { onQuickCapture() }
                Button("Link") { onQuickCapture() }
                Button("Image") { onQuickCapture() }
                Button("Voice") { onQuickCapture() }
                Button("Import from X") { onQuickCapture() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private var header: some View {
        ZStack {
            Text("Home")
                .font(.system(size: 29, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)
                .frame(maxWidth: .infinity)

            HStack(spacing: 14) {
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                        isShowingDrawer = true
                    }
                } label: {
                    NomiAvatarView(
                        name: appSession.profile?.displayName ?? appSession.profile?.email,
                        imageURL: appSession.profile?.photoURL,
                        size: 42,
                        fontSize: 15
                    )
                    .padding(3)
                    .background(headerIconSurface, in: Circle())
                    .overlay(Circle().stroke(headerIconStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open profile menu")

                Spacer()

                HStack(spacing: 12) {
                    Button {
                        toggleTheme()
                    } label: {
                        Image(systemName: theme == "dark" ? "sun.max.fill" : "moon.fill")
                            .font(.system(size: 21, weight: .semibold))
                            .foregroundStyle(Color.nomiInk)
                            .frame(width: 34, height: 40)
                            .background(headerIconSurface, in: Circle())
                            .overlay(Circle().stroke(headerIconStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(theme == "dark" ? "Switch to light mode" : "Switch to dark mode")

                    Button {
                        isShowingAskNomi = true
                    } label: {
                        ZStack(alignment: .bottomTrailing) {
                            Image("NomiMascot")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 34, height: 34)
                                .padding(5)
                                .background(avatarBackground, in: Circle())

                            Circle()
                                .fill(Color(red: 0.16, green: 0.84, blue: 0.45))
                                .frame(width: 11, height: 11)
                                .overlay(Circle().stroke(Color.nomiCardStrong, lineWidth: 2.2))
                        }
                        .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Ask Nomi")
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 6)
    }

    private var summaryText: String {
        if memoryStore.memories.isEmpty {
            return "Save a note, link, image, or voice thought and Nomi will start building your daily summary."
        }

        let linkCount = memoryStore.memories.filter { ["link", "tweet", "url"].contains($0.type.lowercased()) }.count
        let ideaCount = max(memoryStore.memories.count - linkCount, 0)
        return "You captured \(ideaCount) ideas and \(linkCount) links. Top themes: \(topCategories)."
    }

    private var topCategories: String {
        let categories = Array(Set(memoryStore.memories.map(\.category)))
            .filter { !$0.isEmpty }
            .prefix(3)
            .map { $0.lowercased() }
        return categories.isEmpty ? "ideas, links, and inspiration" : categories.joined(separator: ", ")
    }

    private var drawerHandle: String {
        if let email = appSession.profile?.email, let prefix = email.split(separator: "@").first {
            return "@\(prefix)"
        }
        return "@nomi"
    }

    private func showCaptureOptions() {
        isShowingCaptureOptions = true
    }

    private func handleDrawerTap(_ item: NomiDrawerItem) {
        switch item {
        case .dailyBrief:
            isShowingDailyBrief = true
        default:
            onDrawerDestination(item.destination)
        }
    }

    private func toggleTheme() {
        withAnimation(.easeInOut(duration: 0.18)) {
            theme = theme == "dark" ? "light" : "dark"
        }
    }

    private var cardFill: Color {
        colorScheme == .dark ? .white.opacity(0.075) : .white.opacity(0.94)
    }

    private var cardStroke: Color {
        colorScheme == .dark ? .white.opacity(0.10) : .black.opacity(0.05)
    }

    private var avatarBackground: Color {
        colorScheme == .dark
            ? Color(red: 0.18, green: 0.16, blue: 0.23)
            : Color(red: 1.0, green: 0.80, blue: 0.76)
    }

    private var headerIconSurface: Color {
        colorScheme == .dark
            ? Color(red: 0.11, green: 0.10, blue: 0.15)
            : Color.white
    }

    private var headerIconStroke: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.14)
            : Color.black.opacity(0.07)
    }

    private func loadMemories() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }
}

private enum HomeFeedTab: String, CaseIterable, Identifiable {
    case forYou = "For You"
    case recent = "Recent"
    case projects = "Projects"
    case inbox = "Inbox"

    var id: String { rawValue }
}

private struct HomeFeedTabRow: View {
    @Binding var activeTab: HomeFeedTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(HomeFeedTab.allCases) { tab in
                Button {
                    withAnimation(.spring(response: 0.22, dampingFraction: 0.9)) {
                        activeTab = tab
                    }
                } label: {
                    VStack(spacing: 10) {
                        Text(tab.rawValue)
                            .font(.system(size: 16, weight: .black, design: .rounded))
                            .foregroundStyle(activeTab == tab ? Color.nomiCoral : Color.nomiInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)

                        Capsule()
                            .fill(activeTab == tab ? Color.nomiCoral : .clear)
                            .frame(width: 72, height: 3)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.nomiStroke)
                .frame(height: 1)
        }
    }
}

private struct CompactNativeComposer: View {
    let onQuickCapture: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 11) {
                Image("NomiMascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 34, height: 34)
                    .padding(5)
                    .background(Color.nomiPink.opacity(0.12), in: Circle())

                Text("What do you want to remember?")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.nomiMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 8) {
                composerButton("Note", "note.text")
                composerButton("Link", "link")
                composerButton("Image", "photo")
                composerButton("Voice", "mic")
            }
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiCoral.opacity(0.18), lineWidth: 1.2)
        )
    }

    private func composerButton(_ label: String, _ icon: String) -> some View {
        Button {
            onQuickCapture()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.nomiCoral)

                Text(label)
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.nomiCoral.opacity(0.14), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct NomiSummaryFeedCard: View {
    let summaryText: String
    let onAsk: () -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image("NomiMascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 38, height: 38)
                    .padding(4)
                    .background(Color.nomiPink.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 5) {
                    Text("Nomi · For You")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)

                    Text("Daily memory recap")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.nomiInk)
                }

                Spacer()

                Image(systemName: "ellipsis")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
            }

            VStack(alignment: .leading, spacing: 5) {
                Label("Nomi Summary", systemImage: "sparkles")
                    .font(.caption.weight(.black))
                    .foregroundStyle(Color.nomiInk)

                Text(summaryText)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(3)
            }
            .padding(12)
            .background(Color.nomiCoral.opacity(0.075), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            feedActionRow(onAsk: onAsk, onConnect: onAsk, onOpen: onOpen, isFavorite: false)
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }
}

private struct NativeMemoryFeedCard: View {
    let memory: NomiMemory
    let onAsk: () -> Void
    let onConnect: () -> Void
    @AppStorage("nomi.postTextSize") private var postTextSizeRaw = NomiPostTextSize.standard.rawValue

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: sourceIcon)
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(Color.nomiCoral)
                    .frame(width: 40, height: 40)
                    .background(Color.nomiCoral.opacity(0.10), in: Circle())

                VStack(alignment: .leading, spacing: 5) {
                    Text(sourceLine)
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Text(previewText)
                        .font(.system(size: postTextSize.feedPreviewSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(postTextSize.feedPreviewLineLimit)
                }

                Spacer(minLength: 4)

                postOptionsMenu
            }

            if !memory.media.isEmpty {
                FeedMediaStrip(media: memory.media)
                    .padding(.leading, 50)
            }

            if !memory.referencedPosts.isEmpty {
                VStack(spacing: 8) {
                    ForEach(Array(memory.referencedPosts.prefix(2))) { post in
                        FeedReferencedPostCard(post: post)
                    }
                }
                .padding(.leading, 50)
            }

            if !tags.isEmpty {
                HStack(spacing: 7) {
                    ForEach(tags, id: \.self) { tag in
                        Text("#\(tag.replacingOccurrences(of: "#", with: ""))")
                            .font(.caption.weight(.black))
                            .foregroundStyle(Color.nomiCoral)
                            .lineLimit(1)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 9)
                            .background(Color.nomiCoral.opacity(0.09), in: Capsule())
                    }
                }
                .padding(.leading, 50)
            }

            feedActionRow(onAsk: onAsk, onConnect: onConnect, onOpen: {}, isFavorite: memory.isFavorite)
                .padding(.leading, 50)
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var sourceLine: String {
        let time = memory.displayDate
        if let username = memory.sourceUsername?.trimmingCharacters(in: .whitespacesAndNewlines), !username.isEmpty {
            return "@\(username.replacingOccurrences(of: "@", with: "")) on X · \(time)"
        }
        if let author = memory.author?.username, !author.isEmpty {
            return "@\(author.replacingOccurrences(of: "@", with: "")) on X · \(time)"
        }
        if let host = memory.sourceURL?.host ?? memory.sourceUrl?.host {
            return "Link · \(host.replacingOccurrences(of: "www.", with: "")) · \(time)"
        }
        return "\(memory.displayType) · \(time)"
    }

    private var previewText: String {
        let values = [memory.rawText, memory.cleanText ?? "", memory.content, memory.title, memory.summary ?? ""]
        return values.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? "Saved memory"
    }

    private var tags: [String] {
        let candidates = memory.tags.isEmpty ? (memory.ai?.tags.isEmpty == false ? memory.ai?.tags ?? [] : memory.concepts) : memory.tags
        let values = ([memory.category] + candidates)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty && $0 != "general" }
        return Array(Set(values)).sorted().prefix(3).map { $0 }
    }

    private var sourceIcon: String {
        let source = "\(memory.sourceType) \(memory.type)".lowercased()
        if source.contains("tweet") || source.contains("x") { return "bubble.left.and.bubble.right.fill" }
        if source.contains("link") || source.contains("url") { return "link" }
        if source.contains("image") { return "photo" }
        if source.contains("voice") { return "mic" }
        return "note.text"
    }

    private var postTextSize: NomiPostTextSize {
        NomiPostTextSize.value(for: postTextSizeRaw)
    }

    private var postOptionsMenu: some View {
        Menu {
            Picker("Post text size", selection: $postTextSizeRaw) {
                ForEach(NomiPostTextSize.allCases) { size in
                    Text(size.title).tag(size.rawValue)
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
                .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Post options")
    }
}

private struct FeedMediaStrip: View {
    let media: [NomiMemoryMedia]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(media.prefix(4))) { item in
                    FeedMediaTile(item: item)
                }
            }
        }
    }
}

private struct FeedMediaTile: View {
    let item: NomiMemoryMedia

    var body: some View {
        Group {
            if let videoURL = item.bestVideoURL ?? (item.type == "video" ? item.url : nil) {
                FeedVideoPreview(url: videoURL)
            } else if let imageURL = item.bestDisplayURL {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallbackTile(icon: "photo", title: item.type.capitalized)
                    case .empty:
                        ProgressView()
                    @unknown default:
                        fallbackTile(icon: "photo", title: item.type.capitalized)
                    }
                }
                .frame(width: 178, height: 132)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                fallbackTile(icon: "photo", title: item.type.capitalized)
            }
        }
    }

    private func fallbackTile(icon: String, title: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3.bold())
                .foregroundStyle(Color.nomiCoral)
            Text(title.isEmpty ? "Media" : title)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiInk)
        }
        .frame(width: 178, height: 132)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }
}

private struct FeedVideoPreview: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            VideoPlayer(player: player)
                .frame(width: 178, height: 132)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            Image(systemName: "play.circle.fill")
                .font(.title3.bold())
                .foregroundStyle(.white)
                .shadow(radius: 4)
                .padding(8)
        }
        .onAppear {
            let nextPlayer = AVPlayer(url: url)
            nextPlayer.isMuted = true
            player = nextPlayer
            nextPlayer.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }
}

private struct FeedReferencedPostCard: View {
    let post: NomiReferencedPost
    @AppStorage("nomi.postTextSize") private var postTextSizeRaw = NomiPostTextSize.standard.rawValue

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)

                Text(sourceLine)
                    .font(.caption.weight(.black))
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(1)
            }

            if let text = post.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                Text(text)
                    .font(.system(size: referencedPostTextSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(3)
            }

            if !post.media.isEmpty {
                FeedMediaStrip(media: post.media)
            }
        }
        .padding(10)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var sourceLine: String {
        if let username = post.username?.trimmingCharacters(in: .whitespacesAndNewlines), !username.isEmpty {
            return "@\(username.replacingOccurrences(of: "@", with: ""))"
        }
        return "Related post"
    }

    private var referencedPostTextSize: CGFloat {
        max(12, NomiPostTextSize.value(for: postTextSizeRaw).feedPreviewSize - 2)
    }
}

private func feedActionRow(onAsk: @escaping () -> Void, onConnect: @escaping () -> Void, onOpen: @escaping () -> Void, isFavorite: Bool) -> some View {
    HStack(spacing: 0) {
        feedAction("Ask", "bubble.left", action: onAsk)
        feedAction("Connect", "arrow.triangle.2.circlepath", action: onConnect)
        feedAction("Open", "arrow.up.forward.square", action: onOpen)

        Spacer(minLength: 8)

        Image(systemName: isFavorite ? "bookmark.fill" : "bookmark")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Color.nomiMuted)
            .frame(width: 32, height: 28)

        Image(systemName: "ellipsis")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Color.nomiMuted)
            .frame(width: 32, height: 28)
    }
}

private func feedAction(_ label: String, _ icon: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        HStack(spacing: 5) {
            Image(systemName: icon)
            Text(label)
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(Color.nomiMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 28)
    }
    .buttonStyle(.plain)
}

private struct HomeEmptyFeedState: View {
    let tab: HomeFeedTab

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: tab == .inbox ? "tray" : "sparkles")
                .font(.title3.bold())
                .foregroundStyle(Color.nomiCoral)
                .frame(width: 48, height: 48)
                .background(Color.nomiCoral.opacity(0.10), in: Circle())

            Text(title)
                .font(.headline.weight(.black))
                .foregroundStyle(Color.nomiInk)

            Text(bodyText)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
        .padding(.vertical, 28)
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var title: String {
        switch tab {
        case .forYou: return "Your memory feed is ready"
        case .recent: return "No recent captures yet"
        case .projects: return "No project-linked memories"
        case .inbox: return "Inbox is clear"
        }
    }

    private var bodyText: String {
        switch tab {
        case .forYou: return "Save a note, link, image, or voice thought and Nomi will shape it into a calm personal feed."
        case .recent: return "Your newest memories will land here as compact feed cards."
        case .projects: return "Project-connected memories will appear here when available."
        case .inbox: return "Unprocessed captures will show here when Nomi needs your attention."
        }
    }
}

enum HomeDrawerDestination {
    case profile
    case nomiPro
    case dailyBrief
    case projects
    case connectedIdeas
    case circle
    case importSources
    case settings
    case help
}

private enum NomiDrawerItem: CaseIterable, Identifiable {
    case profile
    case nomiPro
    case dailyBrief
    case projects
    case connectedIdeas
    case circle
    case importSources
    case settings
    case help

    var id: Self { self }

    var title: String {
        switch self {
        case .profile: return "Profile"
        case .nomiPro: return "Nomi Pro"
        case .dailyBrief: return "Daily Brief"
        case .projects: return "Projects"
        case .connectedIdeas: return "Connected Ideas"
        case .circle: return "Circle"
        case .importSources: return "Import Sources"
        case .settings: return "Settings & Privacy"
        case .help: return "Help"
        }
    }

    var icon: String {
        switch self {
        case .profile: return "person"
        case .nomiPro: return "diamond"
        case .dailyBrief: return "sun.max"
        case .projects: return "folder"
        case .connectedIdeas: return "point.3.connected.trianglepath.dotted"
        case .circle: return "person.2"
        case .importSources: return "square.and.arrow.down"
        case .settings: return "gearshape"
        case .help: return "questionmark.circle"
        }
    }

    var hasDividerBefore: Bool {
        switch self {
        case .projects, .settings: return true
        default: return false
        }
    }

    var accent: Color {
        switch self {
        case .nomiPro, .dailyBrief: return Color.nomiOrange
        case .connectedIdeas, .circle: return Color.nomiPurple
        default: return Color.nomiInk
        }
    }

    var badge: String? {
        self == .nomiPro ? "Pro" : nil
    }

    var destination: HomeDrawerDestination {
        switch self {
        case .profile: return .profile
        case .nomiPro: return .nomiPro
        case .dailyBrief: return .dailyBrief
        case .projects: return .projects
        case .connectedIdeas: return .connectedIdeas
        case .circle: return .circle
        case .importSources: return .importSources
        case .settings: return .settings
        case .help: return .help
        }
    }
}

private struct NomiHomeSideDrawer: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var isPresented: Bool
    let displayName: String
    let imageURL: URL?
    let handle: String
    let memoryCount: Int
    let projectCount: Int
    let onMenuTap: (NomiDrawerItem) -> Void

    var body: some View {
        GeometryReader { proxy in
            let drawerWidth = min(proxy.size.width * 0.84, 336)

            ZStack(alignment: .leading) {
                if isPresented {
                    Color.black.opacity(0.42)
                        .ignoresSafeArea()
                        .onTapGesture {
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                                isPresented = false
                            }
                        }
                        .transition(.opacity)
                }

                drawerContent
                    .frame(width: drawerWidth)
                    .frame(maxHeight: .infinity)
                    .background(drawerSurface)
                    .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 26, topTrailingRadius: 26))
                    .shadow(color: .black.opacity(0.20), radius: 22, x: 10, y: 0)
                    .offset(x: isPresented ? 0 : -drawerWidth - 24)
                    .gesture(
                        DragGesture()
                            .onEnded { value in
                                if value.translation.width < -72 {
                                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                                        isPresented = false
                                    }
                                }
                            }
                    )
            }
            .animation(.spring(response: 0.32, dampingFraction: 0.86), value: isPresented)
        }
        .allowsHitTesting(isPresented)
    }

    private var drawerContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                NomiAvatarView(name: displayName, imageURL: imageURL, size: 58, fontSize: 20)

                VStack(alignment: .leading, spacing: 5) {
                    Text(displayName)
                        .font(.system(size: 19, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Text(handle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)
                }

                Spacer()

                Image("NomiMascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 44)
                    .padding(5)
                    .background(drawerIconSurface, in: Circle())
            }
            .padding(.top, 58)

            HStack(spacing: 0) {
                drawerStat(memoryCount, "Memories")
                Rectangle()
                    .fill(Color.nomiStroke)
                    .frame(width: 1, height: 34)
                drawerStat(projectCount, "Projects")
            }
            .frame(height: 70)
            .background(drawerPanelSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(drawerPanelStroke, lineWidth: 1))

            VStack(spacing: 0) {
                ForEach(NomiDrawerItem.allCases) { item in
                    if item.hasDividerBefore {
                        Divider()
                            .padding(.vertical, 9)
                    }

                    Button {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                            isPresented = false
                        }
                        onMenuTap(item)
                    } label: {
                        HStack(spacing: 16) {
                            Image(systemName: item.icon)
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(item.accent)
                                .frame(width: 28)

                            Text(item.title)
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.nomiInk)

                            Spacer()

                            if let badge = item.badge {
                                Text(badge)
                                    .font(.caption2.weight(.black))
                                    .foregroundStyle(.white)
                                    .padding(.vertical, 5)
                                    .padding(.horizontal, 8)
                                    .background(Color.nomiOrange, in: Capsule())
                            } else {
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.black))
                                    .foregroundStyle(Color.nomiMuted)
                            }
                        }
                        .frame(height: 52)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer(minLength: 8)

            Button {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                    isPresented = false
                }
                onMenuTap(.nomiPro)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "diamond.fill")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(
                            LinearGradient(colors: [Color.nomiOrange, Color.nomiPink], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: Circle()
                        )

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Nomi Pro")
                            .font(.headline.weight(.black))
                        Text("More recaps, smarter insights, and unlimited connections.")
                            .font(.caption.weight(.bold))
                            .lineLimit(2)
                    }

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.black))
                }
                .foregroundStyle(Color.nomiPink)
                .padding(14)
                .background(drawerPanelSurface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiPink.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 18)
        }
        .padding(.horizontal, 20)
    }

    private func drawerStat(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value.formatted())
                .font(.system(size: 20, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private var drawerSurface: Color {
        colorScheme == .dark
            ? Color(red: 0.08, green: 0.075, blue: 0.105)
            : Color(red: 1.0, green: 0.965, blue: 0.945)
    }

    private var drawerPanelSurface: Color {
        colorScheme == .dark
            ? Color(red: 0.13, green: 0.105, blue: 0.14)
            : Color(red: 1.0, green: 0.91, blue: 0.88)
    }

    private var drawerPanelStroke: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.12)
            : Color(red: 0.88, green: 0.36, blue: 0.30).opacity(0.22)
    }

    private var drawerIconSurface: Color {
        colorScheme == .dark
            ? Color(red: 0.18, green: 0.12, blue: 0.18)
            : Color(red: 1.0, green: 0.86, blue: 0.88)
    }
}

private struct DailySummaryView: View {
    @Environment(\.dismiss) private var dismiss

    let memories: [NomiMemory]
    let todayMemories: [NomiMemory]
    let summaryText: String
    let topCategories: String

    private var linkCount: Int {
        memories.filter { ["link", "tweet", "url", "x_post", "x-post", "xpost"].contains($0.type.lowercased()) }.count
    }

    private var noteCount: Int {
        max(memories.count - linkCount, 0)
    }

    private var recentTags: [String] {
        Array(
            Set(memories.flatMap(\.tags).map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        )
        .filter { !$0.isEmpty }
        .sorted()
        .prefix(8)
        .map { $0 }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        heroCard
                        statsGrid
                        recentTodayList
                    }
                    .padding(20)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Today Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image("NomiMascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 52, height: 52)

                VStack(alignment: .leading, spacing: 4) {
                    Text(memories.isEmpty ? "Start your first summary" : "Nomi noticed")
                        .font(.system(size: 22, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)

                    Text(memories.isEmpty ? "Capture something and this will become your daily rollup." : "Top themes: \(topCategories).")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                }
            }

            Text(summaryText)
                .font(.system(size: 16, weight: .regular, design: .rounded))
                .foregroundStyle(Color.nomiInk)
                .lineSpacing(3)

            if !recentTags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(recentTags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.caption.weight(.black))
                                .foregroundStyle(Color.nomiPurple)
                                .padding(.vertical, 6)
                                .padding(.horizontal, 10)
                                .background(.white.opacity(0.82), in: Capsule())
                        }
                    }
                }
            }
        }
        .padding(18)
        .background(
            LinearGradient(
                colors: [Color(red: 0.96, green: 0.89, blue: 1.0), Color(red: 1.0, green: 0.92, blue: 0.96)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.nomiPurple.opacity(0.16), lineWidth: 1.2)
        )
    }

    private var statsGrid: some View {
        HStack(spacing: 10) {
            SummaryStatCard(title: "Today", value: "\(todayMemories.count)", icon: "calendar")
            SummaryStatCard(title: "Notes", value: "\(noteCount)", icon: "note.text")
            SummaryStatCard(title: "Links", value: "\(linkCount)", icon: "link")
        }
    }

    private var recentTodayList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Captured today")
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)

            if todayMemories.isEmpty {
                EmptyStateView(
                    title: "Nothing captured today",
                    message: "Save an X post, link, note, image, or voice thought and it will appear here."
                )
                .background(.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(todayMemories.prefix(8)) { memory in
                        HStack(spacing: 12) {
                            Image(systemName: memory.displayType == "X post" ? "text.bubble" : "doc.text")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Color.nomiCoral)
                                .frame(width: 34, height: 34)
                                .background(Color.nomiCoral.opacity(0.10), in: RoundedRectangle(cornerRadius: 11, style: .continuous))

                            VStack(alignment: .leading, spacing: 3) {
                                Text(memory.title)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Color.nomiInk)
                                    .lineLimit(1)

                                Text("\(memory.displayType) · \(memory.category)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.nomiMuted)
                            }

                            Spacer()
                        }
                        .padding(.vertical, 10)

                        if memory.id != todayMemories.prefix(8).last?.id {
                            Divider()
                        }
                    }
                }
                .padding(.horizontal, 14)
                .background(.white.opacity(0.90), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }
}

struct AskNomiSheet: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let project: NomiProject?

    @State private var question = ""
    @State private var response: BrainQueryResponse?
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var openingSourceMemoryId: String?
    @State private var sourceOpenErrorMessage: String?
    @State private var openedSourceMemory: NomiMemory?

    private let backendService = XBackendService()

    init(project: NomiProject? = nil) {
        self.project = project
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        questionBox
                        resultContent
                    }
                    .padding(18)
                    .padding(.bottom, 28)
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
            .navigationDestination(item: $openedSourceMemory) { memory in
                MemoryDetailView(memory: memory)
            }
            .alert("Source unavailable", isPresented: sourceOpenErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(sourceOpenErrorMessage ?? "Nomi couldn’t open that memory. It may have been deleted or is no longer available.")
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image("NomiMascot")
                .resizable()
                .scaledToFit()
                .frame(width: 42, height: 42)
                .padding(8)
                .background(Color.nomiPink.opacity(0.18), in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text("Ask Nomi")
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(Color.nomiInk)

                Text(projectSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
            }

            Spacer()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
                    .frame(width: 40, height: 40)
                    .background(askControlFill, in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private var questionBox: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("What do I know about...", text: $question, axis: .vertical)
                .lineLimit(2...5)
                .textInputAutocapitalization(.sentences)
                .foregroundStyle(Color.nomiInk)
                .tint(Color.nomiPink)
                .padding(14)
                .background(askFieldFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.nomiStroke, lineWidth: 1)
                )

            Button {
                Task { await askNomi() }
            } label: {
                HStack {
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    }

                    Text(isLoading ? "Asking Nomi..." : "Ask Nomi")
                    Image(systemName: "sparkles")
                }
                .font(.headline.weight(.black))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(canAsk ? Color.nomiPink : Color.nomiMuted.opacity(0.45), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .disabled(!canAsk)
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(askCardFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var resultContent: some View {
        if let errorMessage {
            Text(errorMessage)
                .font(.subheadline)
                .foregroundStyle(Color.nomiCoral)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(askCardFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else if let response {
            answerCard(response)
        } else {
            EmptyStateView(
                title: "Ask from your library",
                message: "Nomi will answer only from memories you have saved."
            )
            .background(askCardFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func answerCard(_ response: BrainQueryResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Answer")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Text(response.confidence)
                    .font(.caption.weight(.black))
                    .foregroundStyle(response.confidence.caseInsensitiveCompare("low") == .orderedSame ? Color.nomiOrange : Color.nomiPink)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 9)
                    .background(askFieldFill, in: Capsule())
            }

            if response.sources.isEmpty {
                Text(noContextMessage)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                scopeLabel(for: response)

                Text(response.answer)
                    .font(.body)
                    .foregroundStyle(Color.nomiInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)

                if response.confidence.caseInsensitiveCompare("low") == .orderedSame {
                    Label(response.sources.count >= 4 ? "Partial match from \(response.sources.count) memories." : "Low confidence — based only on a few matching memories.", systemImage: "exclamationmark.triangle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiOrange)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Sources")
                        .font(.caption.weight(.black))
                        .foregroundStyle(Color.nomiMuted)
                        .textCase(.uppercase)

                    ForEach(response.sources) { source in
                        sourceCard(source)
                    }
                }
            }
        }
        .padding(14)
        .background(askCardFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private func scopeLabel(for response: BrainQueryResponse) -> some View {
        Text(scopeTitle(for: response))
            .font(.caption.weight(.black))
            .foregroundStyle(Color.nomiMuted)
            .padding(.vertical, 5)
            .padding(.horizontal, 8)
            .background(askFieldFill, in: Capsule())
            .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func scopeTitle(for response: BrainQueryResponse) -> String {
        if response.scope?.type == "project" || project != nil {
            let responseTitle = response.scope?.projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = responseTitle?.isEmpty == false ? responseTitle : project?.name
            return "Project: \(title ?? "Selected project")"
        }
        return "Global memory search"
    }

    private func sourceCard(_ source: BrainQuerySource) -> some View {
        let matchedMemory = memoryStore.memories.first { $0.id == source.memoryId }
        let isLoading = openingSourceMemoryId == source.memoryId

        return Group {
            if let matchedMemory {
                NavigationLink(value: matchedMemory) {
                    sourceCardContent(source, isOpenable: true, isLoading: false)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    Task { await openSource(source) }
                } label: {
                    sourceCardContent(source, isOpenable: true, isLoading: isLoading)
                }
                .disabled(isLoading)
                .buttonStyle(.plain)
            }
        }
    }

    private func sourceCardContent(_ source: BrainQuerySource, isOpenable: Bool, isLoading: Bool) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(source.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Spacer()

                if isLoading {
                    ProgressView()
                        .controlSize(.mini)
                } else if isOpenable {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.nomiMuted)
                }
            }

            if let relevanceReason = source.relevanceReason, !relevanceReason.isEmpty {
                Text(relevanceReason)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.nomiPink)
                    .lineLimit(1)
            }

            Text(source.snippet)
                .font(.caption)
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            if let date = source.capturedAt ?? source.createdAt {
                Text(NomiFormatters.shortDate.string(from: date))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(11)
        .background(askFieldFill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var canAsk: Bool {
        !isLoading && !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var projectSubtitle: String {
        if let project {
            return "Ask about memories linked to \(project.name)."
        }
        return "Ask a question about your saved memories."
    }

    private var noContextMessage: String {
        if project != nil {
            return "Nomi couldn’t find enough saved context in this project to answer that yet."
        }
        return "Nomi couldn’t find enough saved context to answer that yet."
    }

    private var sourceOpenErrorBinding: Binding<Bool> {
        Binding(
            get: { sourceOpenErrorMessage != nil },
            set: { if !$0 { sourceOpenErrorMessage = nil } }
        )
    }

    private var askCardFill: Color {
        colorScheme == .dark
            ? Color(red: 0.10, green: 0.09, blue: 0.13)
            : Color.white
    }

    private var askFieldFill: Color {
        colorScheme == .dark
            ? Color(red: 0.15, green: 0.13, blue: 0.18)
            : Color(red: 1.0, green: 0.96, blue: 0.97)
    }

    private var askControlFill: Color {
        colorScheme == .dark
            ? Color(red: 0.14, green: 0.12, blue: 0.17)
            : Color.white
    }

    private func askNomi() async {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            response = try await backendService.askMemories(question: trimmed, projectId: project?.id, limit: 12, allowGlobalFallback: project != nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func openSource(_ source: BrainQuerySource) async {
        guard openingSourceMemoryId == nil else { return }
        guard let userId = appSession.user?.uid else {
            sourceOpenErrorMessage = "Sign in before opening saved memories."
            return
        }

        openingSourceMemoryId = source.memoryId
        defer { openingSourceMemoryId = nil }

        do {
            guard let memory = try await memoryStore.memory(id: source.memoryId, userId: userId) else {
                sourceOpenErrorMessage = "Nomi couldn’t open that memory. It may have been deleted or is no longer available."
                return
            }
            openedSourceMemory = memory
        } catch {
            sourceOpenErrorMessage = "Nomi couldn’t open that memory. It may have been deleted or is no longer available."
        }
    }
}

private struct SummaryStatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiPurple)

            Text(value)
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)

            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct RecentCaptureRow: View {
    @Environment(\.colorScheme) private var colorScheme

    let memory: NomiMemory

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Color.nomiCoral)
                .frame(width: 40, height: 40)
                .background(iconFill, in: RoundedRectangle(cornerRadius: 13, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(memory.title)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Text("\(memory.displayType) · \(memory.displayDate)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
            }

            Spacer(minLength: 10)

            Text("#\(memory.category.lowercased().replacingOccurrences(of: " ", with: ""))")
                .font(.caption.weight(.black))
                .foregroundStyle(Color.nomiCoral)
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(tagFill, in: Capsule())
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
    }

    private var iconFill: Color {
        colorScheme == .dark ? Color.nomiCoral.opacity(0.18) : Color(red: 1.0, green: 0.91, blue: 0.86)
    }

    private var tagFill: Color {
        colorScheme == .dark ? Color.nomiCoral.opacity(0.14) : Color(red: 1.0, green: 0.91, blue: 0.87)
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
