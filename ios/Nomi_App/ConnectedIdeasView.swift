import SwiftUI

// MARK: - Connected Ideas — category-first dashboard
//
// Replaces the galaxy as the Ideas tab's landing screen. The Knowledge Galaxy
// remains the underlying product concept and stays reachable (banner at the
// bottom + toolbar button), but the main treatment is a calm dashboard:
// hero → stats → category rail → project portal → quick capture.

struct ConnectedIdeasView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @EnvironmentObject private var appSession: AppSession

    /// Switches the app to the Recall tab — the existing search surface.
    var onSearch: () -> Void = {}

    /// Tiny Identifiable wrapper so a plain category name can drive
    /// navigationDestination(item:) without a global String conformance.
    private struct OpenedCategory: Identifiable, Hashable {
        let name: String
        var id: String { name }
    }

    @State private var openedCategory: OpenedCategory?
    @State private var isShowingCapture = false
    @State private var isShowingProjects = false
    @State private var isShowingProjectEditor = false
    /// Edge count is derived from the same graph model the galaxy uses; cached
    /// because building the graph on every body evaluation is wasteful.
    @State private var linkCount = 0

    var body: some View {
        NavigationStack {
            ZStack {
                background.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 28) {
                        hero
                        statsRow
                        categorySection
                        projectPortal
                        QuickCaptureBar { isShowingCapture = true }
                        galaxyBanner
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 18)
                    .padding(.bottom, 110)
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(item: $openedCategory) { category in
                CategoryDetailView(categoryName: category.name)
            }
            .navigationDestination(for: NomiProject.self) { project in
                ProjectWorkspaceView(project: project)
            }
            .sheet(isPresented: $isShowingCapture) {
                QuickCaptureView()
            }
            .sheet(isPresented: $isShowingProjects) {
                ProjectsView()
            }
            .sheet(isPresented: $isShowingProjectEditor) {
                ProjectEditorView(project: nil)
            }
            .task {
                await intelligenceStore.loadProjects()
                refreshLinkCount()
            }
            .onChange(of: memoryStore.memories) { _, _ in
                refreshLinkCount()
            }
            .refreshable {
                if let userId = appSession.user?.uid {
                    await memoryStore.load(userId: userId)
                }
                await intelligenceStore.loadProjects()
                refreshLinkCount()
            }
        }
    }

    // MARK: Data

    private var activeMemories: [NomiMemory] {
        memoryStore.memories.filter { !$0.isArchived }
    }

    /// Same normalization as GalaxyGraphModel: trimmed, empty → "General".
    private var categoryCounts: [(name: String, count: Int)] {
        var counts: [String: Int] = [:]
        for memory in activeMemories {
            let name = memory.category.trimmingCharacters(in: .whitespacesAndNewlines)
            counts[name.isEmpty ? "General" : name, default: 0] += 1
        }
        return counts
            .map { (name: $0.key, count: $0.value) }
            .sorted {
                if $0.count == $1.count { return $0.name < $1.name }
                return $0.count > $1.count
            }
    }

    private func refreshLinkCount() {
        guard let center = memoryStore.defaultGraphMemory else {
            linkCount = 0
            return
        }
        let graph = GalaxyGraphModel.make(
            center: center,
            memories: memoryStore.memories,
            relatedResults: memoryStore.graphMemories(for: center, limit: memoryStore.memories.count)
        )
        linkCount = graph.edges.count
    }

    // MARK: Sections

    private var background: some View {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color(red: 0.025, green: 0.025, blue: 0.055), Color(red: 0.005, green: 0.008, blue: 0.025)]
                : [Color(red: 0.99, green: 0.97, blue: 1.00), Color(red: 0.96, green: 0.94, blue: 0.99)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var hero: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Your ideas.")
                Text("Organized.")
                Text("Connected.")
                    .foregroundStyle(Color.nomiPurple)
            }
            .font(.system(size: 38, weight: .bold, design: .rounded))
            .foregroundStyle(Color.nomiInk)

            Spacer()

            Button(action: onSearch) {
                Image(systemName: "magnifyingglass")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .frame(width: 48, height: 48)
                    .background(Color.nomiPurple.opacity(colorScheme == .dark ? 0.08 : 0.05), in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Search memories")
        }
        .padding(.top, 4)
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            KnowledgeStatCard(value: activeMemories.count, label: "Notes", systemImage: "doc.text")
            KnowledgeStatCard(value: linkCount, label: "Links", systemImage: "link")
            KnowledgeStatCard(value: categoryCounts.count, label: "Categories", systemImage: "sparkles")
        }
    }

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Explore by category")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                Spacer()
            }

            if categoryCounts.isEmpty {
                Text("Capture your first memory and categories will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(categoryCounts, id: \.name) { entry in
                            CategoryExploreCard(
                                name: entry.name,
                                count: entry.count,
                                share: activeMemories.isEmpty ? 0 : Double(entry.count) / Double(activeMemories.count)
                            ) {
                                openedCategory = OpenedCategory(name: entry.name)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var projectPortal: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Project Portal", systemImage: "bolt.fill")
                    .font(.title3.weight(.black))
                    .foregroundStyle(Color.nomiInk)
                    .labelStyle(.titleAndIcon)

                Spacer()

                Button("View all") { isShowingProjects = true }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiPurple)
                    .buttonStyle(.plain)
            }

            if intelligenceStore.projects.isEmpty {
                Button { isShowingProjectEditor = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundStyle(Color.nomiPurple)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Start your first project")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(Color.nomiInk)
                            Text("Turn saved ideas into active work.")
                                .font(.subheadline)
                                .foregroundStyle(Color.nomiMuted)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
            } else {
                VStack(spacing: 10) {
                    ForEach(intelligenceStore.projects.prefix(3)) { project in
                        NavigationLink(value: project) {
                            ProjectPortalCard(project: project)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button { isShowingProjectEditor = true } label: {
                    Label("New project", systemImage: "plus")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiPurple)
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
            }
        }
    }

    private var galaxyBanner: some View {
        NavigationLink {
            ConnectedIdeasGraphView(showsBackButton: true)
        } label: {
            HStack(spacing: 14) {
                Image("NomiMascot")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 46, height: 46)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Your galaxy is growing")
                        .font(.headline.weight(.black))
                        .foregroundStyle(Color.nomiInk)
                    Text("\(activeMemories.count) notes across \(categoryCounts.count) categories")
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiMuted)
                }

                Spacer()

                Image(systemName: "arrow.right")
                    .font(.headline.weight(.black))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.nomiPurple, in: Circle())
            }
            .padding(16)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.nomiPurple.opacity(0.28), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Knowledge Galaxy")
    }
}

// MARK: - Stat card

struct KnowledgeStatCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let value: Int
    let label: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiPurple)

            Text("\(value)")
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)
                .contentTransition(.numericText())

            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

// MARK: - Category card

struct CategoryExploreCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let name: String
    let count: Int
    let share: Double
    let onOpen: () -> Void

    @State private var isPressed = false

    private var accent: Color {
        switch NomiCategory.match(name) {
        case .tech, .coding: Color(red: 0.44, green: 0.38, blue: 1.00)
        case .fitness: Color(red: 0.25, green: 0.72, blue: 1.00)
        case .trading: Color(red: 0.27, green: 0.91, blue: 0.61)
        case .music: Color(red: 1.00, green: 0.34, blue: 0.74)
        case .ideas: Color(red: 1.00, green: 0.68, blue: 0.31)
        case .projects: Color(red: 0.68, green: 0.43, blue: 1.00)
        case .travel: Color(red: 0.32, green: 0.82, blue: 0.95)
        case .general: Color(red: 0.74, green: 0.38, blue: 1.00)
        }
    }

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 8) {
                NomiCategoryIconView(categoryName: name, size: 62, strokeColor: accent, openBottom: true)

                Text(name)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Text("\(count) \(count == 1 ? "note" : "notes")")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)

                Text(share.formatted(.percent.precision(.fractionLength(0))))
                    .font(.caption.weight(.black))
                    .foregroundStyle(accent)
            }
            .frame(width: 126)
            .padding(.vertical, 18)
            .background(
                LinearGradient(
                    colors: [accent.opacity(colorScheme == .dark ? 0.10 : 0.06), Color.nomiCardStrong],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(isPressed ? accent : Color.nomiStroke, lineWidth: isPressed ? 1.5 : 1)
            )
            .scaleEffect(isPressed ? 0.97 : 1)
        }
        .buttonStyle(.plain)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.22, dampingFraction: 0.8)) { isPressed = pressing }
        }, perform: {})
        .accessibilityLabel("\(name), \(count) notes")
    }
}

// MARK: - Project card

struct ProjectPortalCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let project: NomiProject

    private var subtitle: String {
        let text = project.ai?.summary ?? project.summary ?? project.description ?? "No summary yet — open to add ideas."
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Projects have tags/concepts, not a category field — derive the closest
    /// canonical category for the icon without duplicating mapping logic.
    private var derivedCategory: NomiCategory {
        let haystack = ([project.name] + (project.tags ?? []) + (project.concepts ?? [])).joined(separator: " ")
        return NomiCategory.match(haystack)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NomiCategoryIconView(category: derivedCategory, size: 42)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(project.name)
                        .font(.headline.weight(.black))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Spacer()

                    Text(project.status.capitalized)
                        .font(.caption2.weight(.black))
                        .foregroundStyle(Color.nomiPurple)
                        .padding(.vertical, 4)
                        .padding(.horizontal, 8)
                        .background(Color.nomiPurple.opacity(0.14), in: Capsule())
                }

                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 12) {
                    Label("\(project.memoryIds?.count ?? 0) ideas", systemImage: "sparkles")
                    Label("Continue", systemImage: "arrow.right")
                        .foregroundStyle(Color.nomiPurple)
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

// MARK: - Quick capture bar

struct QuickCaptureBar: View {
    @Environment(\.colorScheme) private var colorScheme

    let onCapture: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Quick capture", systemImage: "pencil")
                .font(.title3.weight(.black))
                .foregroundStyle(Color.nomiInk)

            Button(action: onCapture) {
                HStack {
                    Text("Jot down a thought…")
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiMuted)
                    Spacer()
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Color.nomiPurple)
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Capture a new memory")
        }
    }
}

#Preview("Connected Ideas — dark") {
    ConnectedIdeasView()
        .environmentObject(MemoryStore())
        .environmentObject(IntelligenceStore())
        .environmentObject(AppSession())
        .preferredColorScheme(.dark)
}

#Preview("Connected Ideas — light") {
    ConnectedIdeasView()
        .environmentObject(MemoryStore())
        .environmentObject(IntelligenceStore())
        .environmentObject(AppSession())
        .preferredColorScheme(.light)
}
