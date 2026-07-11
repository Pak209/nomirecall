import SwiftUI

// MARK: - Content filters

/// Content-type filters for the category screen (All / Notes / Links / Ideas / Media).
enum CategoryContentFilter: String, CaseIterable, Identifiable {
    case all
    case notes
    case links
    case ideas
    case media

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .notes: "Notes"
        case .links: "Links"
        case .ideas: "Ideas"
        case .media: "Media"
        }
    }

    var icon: String {
        switch self {
        case .all: "line.3.horizontal.decrease"
        case .notes: "note.text"
        case .links: "link"
        case .ideas: "sparkles"
        case .media: "photo.on.rectangle"
        }
    }

    func matches(_ memory: NomiMemory) -> Bool {
        switch self {
        case .all:
            return true
        case .notes:
            return memory.displayType == "Note" || memory.displayType == "Voice"
        case .links:
            return memory.displayType == "Link" || memory.displayType == "X post"
        case .ideas:
            let needle = "idea"
            return memory.intent.lowercased().contains(needle)
                || memory.tags.contains { $0.lowercased().contains(needle) }
                || memory.concepts.contains { $0.lowercased().contains(needle) }
        case .media:
            return memory.displayType == "Image"
                || memory.mediaURL != nil
                || !memory.media.isEmpty
        }
    }
}

// MARK: - Recency grouping

private enum RecencyBucket: Int, CaseIterable, Identifiable {
    case today
    case yesterday
    case thisWeek
    case thisMonth
    case earlier

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .yesterday: "Yesterday"
        case .thisWeek: "This Week"
        case .thisMonth: "This Month"
        case .earlier: "Earlier"
        }
    }

    static func bucket(for date: Date, calendar: Calendar = .current) -> RecencyBucket {
        if calendar.isDateInToday(date) { return .today }
        if calendar.isDateInYesterday(date) { return .yesterday }
        if calendar.isDate(date, equalTo: .now, toGranularity: .weekOfYear) { return .thisWeek }
        if calendar.isDate(date, equalTo: .now, toGranularity: .month) { return .thisMonth }
        return .earlier
    }
}

// MARK: - Header

/// Reusable category header: large Nomi ghost icon, title, memory count.
struct CategoryHeaderView: View {
    @Environment(\.colorScheme) private var colorScheme

    let categoryName: String
    let memoryCount: Int

    var body: some View {
        VStack(spacing: 12) {
            NomiCategoryIconView(categoryName: categoryName, size: 84)
                .shadow(color: Color.nomiCategoryStroke(for: colorScheme).opacity(colorScheme == .dark ? 0.55 : 0.25), radius: 18)

            Text(categoryName)
                .font(.system(size: 30, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)

            Text("\(memoryCount) \(memoryCount == 1 ? "memory" : "memories")")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

// MARK: - Memory card

/// Category-screen memory card: ghost glyph, title, snippet, date, tags,
/// favorite state, overflow menu. Distinct from the feed's MemoryCardView —
/// this one leads with the category icon per the knowledge-world design.
struct CategoryMemoryCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore

    let memory: NomiMemory
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 14) {
                NomiCategoryIconView(categoryName: memory.category, size: 46)
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 7) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(memory.title)
                            .font(.headline.weight(.black))
                            .foregroundStyle(Color.nomiInk)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        Spacer(minLength: 10)

                        Text(memory.displayDate)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.nomiPurple)
                    }

                    if !memory.previewText.isEmpty {
                        Text(memory.previewText)
                            .font(.subheadline)
                            .foregroundStyle(Color.nomiMuted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    if !memory.tags.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(memory.tags.prefix(3), id: \.self) { tag in
                                Text(tag)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(Color.nomiMuted)
                                    .padding(.vertical, 4)
                                    .padding(.horizontal, 9)
                                    .background(tagFill, in: Capsule())
                            }
                        }
                    }
                }

                VStack(alignment: .trailing, spacing: 10) {
                    favoriteButton
                    overflowMenu
                }
            }
            .padding(16)
            .background(cardFill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(cardStroke, lineWidth: 1)
            )
            .shadow(color: Color.nomiPurple.opacity(colorScheme == .dark ? 0.16 : 0.08), radius: 12, y: 5)
        }
        .buttonStyle(.plain)
    }

    private var favoriteButton: some View {
        Button {
            Task {
                if memory.isFavorite {
                    _ = await memoryStore.unfavoriteMemory(memory)
                } else {
                    _ = await memoryStore.favoriteMemory(memory)
                }
            }
        } label: {
            Image(systemName: memory.isFavorite ? "star.fill" : "star")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(memory.isFavorite ? Color.nomiPurple : Color.nomiMuted)
        }
        .buttonStyle(.plain)
    }

    /// Every other category currently in use (normalized like the galaxy).
    private var otherCategories: [String] {
        let current = memory.category.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentName = current.isEmpty ? "General" : current
        var names: Set<String> = []
        for candidate in memoryStore.memories where !candidate.isArchived {
            let raw = candidate.category.trimmingCharacters(in: .whitespacesAndNewlines)
            names.insert(raw.isEmpty ? "General" : raw)
        }
        names.remove(currentName)
        return names.sorted()
    }

    private var availableProjects: [NomiProject] {
        let linked = Set(memory.projectIds)
        return intelligenceStore.projects.filter { !linked.contains($0.id) }
    }

    private var overflowMenu: some View {
        Menu {
            Button(action: onOpen) {
                Label("Open Memory", systemImage: "arrow.up.right.square")
            }
            Button {
                Task {
                    if memory.isFavorite {
                        _ = await memoryStore.unfavoriteMemory(memory)
                    } else {
                        _ = await memoryStore.favoriteMemory(memory)
                    }
                }
            } label: {
                Label(memory.isFavorite ? "Remove Favorite" : "Favorite", systemImage: memory.isFavorite ? "star.slash" : "star")
            }
            // Refile this memory into a different category (rename semantics:
            // categories are strings on memories, so this is a one-field patch).
            Menu {
                ForEach(otherCategories, id: \.self) { name in
                    Button(name) {
                        Task { _ = await memoryStore.updateMemory(memory) { $0.category = name } }
                    }
                }
            } label: {
                Label("Move to Category", systemImage: "folder.badge.gearshape")
            }
            // Turn ideas into project work: assign this memory to a project
            // using the same store API MemoryDetailView's Projects card uses.
            if !availableProjects.isEmpty {
                Menu {
                    ForEach(availableProjects) { project in
                        Button(project.name) {
                            Task { _ = await intelligenceStore.assign(memory: memory, to: project) }
                        }
                    }
                } label: {
                    Label("Add to Project", systemImage: "folder.badge.plus")
                }
            }
            Button(role: .destructive) {
                Task { _ = await memoryStore.archiveMemory(memory) }
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.subheadline.weight(.black))
                .foregroundStyle(Color.nomiMuted)
                .frame(width: 26, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var cardFill: Color {
        colorScheme == .dark ? Color(red: 0.09, green: 0.08, blue: 0.13) : Color.nomiCardStrong
    }

    private var cardStroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.22) : Color.nomiStroke
    }

    private var tagFill: Color {
        colorScheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.05)
    }
}

// MARK: - Category screen

/// The "knowledge world" for a single category: opened from a Knowledge
/// Galaxy category node. Header with the large Nomi category icon, content
/// filters, and memory cards grouped by recency.
struct CategoryDetailView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.colorScheme) private var colorScheme

    let categoryName: String

    @Environment(\.dismiss) private var dismiss

    @State private var filter: CategoryContentFilter = .all
    @State private var searchText = ""
    @State private var openedMemory: NomiMemory?
    @State private var isRenamePresented = false
    @State private var renameText = ""
    @State private var isRenaming = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20, pinnedViews: []) {
                CategoryHeaderView(categoryName: categoryName, memoryCount: categoryMemories.count)

                filterChips

                if filteredMemories.isEmpty {
                    emptyState
                } else {
                    ForEach(groupedMemories, id: \.bucket.id) { group in
                        Section {
                            VStack(spacing: 12) {
                                ForEach(group.memories) { memory in
                                    CategoryMemoryCard(memory: memory) {
                                        openedMemory = memory
                                    }
                                }
                            }
                        } header: {
                            Text(group.bucket.title)
                                .font(.headline.weight(.black))
                                .foregroundStyle(Color.nomiInk)
                                .padding(.top, 4)
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 28)
        }
        .background(screenBackground.ignoresSafeArea())
        .navigationTitle(categoryName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Filter", selection: $filter) {
                        ForEach(CategoryContentFilter.allCases) { option in
                            Label(option.title, systemImage: option.icon).tag(option)
                        }
                    }
                    Button {
                        Task { await refresh() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    Button {
                        renameText = categoryName
                        isRenamePresented = true
                    } label: {
                        Label("Rename Category", systemImage: "pencil")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search \(categoryName)")
        .refreshable { await refresh() }
        .navigationDestination(item: $openedMemory) { memory in
            MemoryDetailView(memory: memory)
        }
        .task {
            if intelligenceStore.projects.isEmpty {
                await intelligenceStore.loadProjects()
            }
        }
        .alert("Rename Category", isPresented: $isRenamePresented) {
            TextField("Category name", text: $renameText)
            Button("Rename") {
                Task { await renameCategory() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every memory in \(categoryName) will move to the new category.")
        }
        .overlay {
            if isRenaming {
                ZStack {
                    Color.black.opacity(0.35).ignoresSafeArea()
                    ProgressView("Renaming…")
                        .padding(22)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
        }
        .disabled(isRenaming)
    }

    /// Renames the category by moving every memory in it to the new name —
    /// categories are just strings on memories, so this is a batch update
    /// through the existing store API (no backend changes).
    private func renameCategory() async {
        let newName = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newName.isEmpty, newName.caseInsensitiveCompare(categoryName) != .orderedSame else { return }
        isRenaming = true
        defer { isRenaming = false }
        for memory in categoryMemories {
            _ = await memoryStore.updateMemory(memory) { $0.category = newName }
        }
        // This screen's category no longer exists — return to the galaxy,
        // which rebuilds with the renamed node.
        dismiss()
    }

    // MARK: Data

    /// Matches GalaxyGraphModel's category normalization (trimmed; empty → "General").
    private var categoryMemories: [NomiMemory] {
        memoryStore.memories.filter { memory in
            guard !memory.isArchived else { return false }
            let normalized = memory.category.trimmingCharacters(in: .whitespacesAndNewlines)
            let effective = normalized.isEmpty ? "General" : normalized
            return effective.caseInsensitiveCompare(categoryName) == .orderedSame
        }
    }

    private var filteredMemories: [NomiMemory] {
        let base = categoryMemories.filter { filter.matches($0) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return base }
        return base.filter { memory in
            memory.title.localizedCaseInsensitiveContains(query)
                || memory.previewText.localizedCaseInsensitiveContains(query)
                || memory.tags.contains { $0.localizedCaseInsensitiveContains(query) }
        }
    }

    private var groupedMemories: [(bucket: RecencyBucket, memories: [NomiMemory])] {
        let sorted = filteredMemories.sorted { $0.capturedAt > $1.capturedAt }
        let grouped = Dictionary(grouping: sorted) { RecencyBucket.bucket(for: $0.capturedAt) }
        return RecencyBucket.allCases.compactMap { bucket in
            guard let memories = grouped[bucket], !memories.isEmpty else { return nil }
            return (bucket, memories)
        }
    }

    private func refresh() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }

    // MARK: Chrome

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(CategoryContentFilter.allCases) { option in
                    Button {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            filter = option
                        }
                    } label: {
                        Label(option.title, systemImage: option.icon)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(filter == option ? .white : Color.nomiMuted)
                            .lineLimit(1)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 14)
                            .background(filter == option ? Color.nomiPurple : chipFill, in: Capsule())
                            .overlay(Capsule().stroke(filter == option ? Color.nomiPurple.opacity(0.35) : Color.nomiStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var chipFill: Color {
        colorScheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.04)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            NomiCategoryIconView(categoryName: categoryName, size: 56)
                .opacity(0.6)
            Text(searchText.isEmpty ? "Nothing here yet" : "No matches")
                .font(.headline.weight(.black))
                .foregroundStyle(Color.nomiInk)
            Text(searchText.isEmpty
                 ? "Memories you save in \(categoryName) will appear here."
                 : "Try a different search or filter.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }

    private var screenBackground: some View {
        Group {
            if colorScheme == .dark {
                LinearGradient(
                    colors: [Color(red: 0.05, green: 0.04, blue: 0.09), Color(red: 0.02, green: 0.02, blue: 0.05)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            } else {
                Color(red: 0.98, green: 0.97, blue: 1.0)
            }
        }
    }
}

#Preview("Category screen — dark") {
    NavigationStack {
        CategoryDetailView(categoryName: "Tech")
    }
    .environmentObject(MemoryStore())
    .environmentObject(AppSession())
    .preferredColorScheme(.dark)
}

#Preview("Category screen — light") {
    NavigationStack {
        CategoryDetailView(categoryName: "Travel")
    }
    .environmentObject(MemoryStore())
    .environmentObject(AppSession())
    .preferredColorScheme(.light)
}
