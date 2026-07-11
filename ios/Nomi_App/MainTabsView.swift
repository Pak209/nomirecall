import SwiftUI

struct MainTabsView: View {
    @StateObject private var memoryStore = MemoryStore()
    @StateObject private var intelligenceStore = IntelligenceStore()
    @State private var selectedTab: NomiTab = .home
    @State private var isShowingQuickCapture = false
    @State private var isShowingAskNomi = false
    @State private var isShowingDailyBrief = false
    @State private var isShowingPaywall = false
    @State private var isShowingProjects = false
    @State private var isShowingCircle = false
    @State private var pendingSharePayload: NomiSharePayload?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack(alignment: .bottom) {
            tabContent
                .environmentObject(memoryStore)
                .environmentObject(intelligenceStore)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            NomiTabBar(selectedTab: $selectedTab)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear(perform: consumeSharedCaptureIfNeeded)
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            consumeSharedCaptureIfNeeded()
        }
        .onReceive(NotificationCenter.default.publisher(for: .nomiSharedCaptureReceived)) { notification in
            if let payload = notification.object as? NomiSharePayload {
                pendingSharePayload = payload
                isShowingQuickCapture = true
            } else {
                consumeSharedCaptureIfNeeded()
            }
        }
        .sheet(isPresented: $isShowingQuickCapture) {
            QuickCaptureView(pendingSharePayload: $pendingSharePayload)
                .environmentObject(memoryStore)
        }
        .sheet(isPresented: $isShowingAskNomi) {
            AskNomiSheet()
                .environmentObject(memoryStore)
        }
        .sheet(isPresented: $isShowingDailyBrief) {
            DailyBriefView()
                .environmentObject(memoryStore)
                .environmentObject(intelligenceStore)
        }
        .sheet(isPresented: $isShowingPaywall) {
            NomiPaywallView()
        }
        .sheet(isPresented: $isShowingProjects) {
            ProjectsView(showsCloseButton: true)
                .environmentObject(intelligenceStore)
        }
        .sheet(isPresented: $isShowingCircle) {
            FriendCircleView()
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .home:
            HomeView {
                isShowingQuickCapture = true
            } onDrawerDestination: { destination in
                handleHomeDrawerDestination(destination)
            }
        case .ideas:
            ConnectedIdeasView(onSearch: { selectedTab = .recall })
        case .ask:
            HomeView {
                isShowingQuickCapture = true
            } onDrawerDestination: { destination in
                handleHomeDrawerDestination(destination)
            }
            .onAppear {
                isShowingAskNomi = true
                selectedTab = .home
            }
        case .recall:
            RecallView()
        case .profile:
            SettingsView()
        }
    }

    private func handleHomeDrawerDestination(_ destination: HomeDrawerDestination) {
        switch destination {
        case .profile, .settings:
            selectedTab = .profile
        case .nomiPro:
            isShowingPaywall = true
        case .dailyBrief:
            isShowingDailyBrief = true
        case .projects:
            isShowingProjects = true
        case .connectedIdeas:
            selectedTab = .ideas
        case .circle:
            isShowingCircle = true
        case .importSources:
            selectedTab = .profile
        case .help:
            selectedTab = .profile
        }
    }

    private func consumeSharedCaptureIfNeeded() {
        guard let payload = NomiShareInbox.consumePendingPayload() else { return }
        pendingSharePayload = payload
        isShowingQuickCapture = true
    }
}

private enum NomiTab: CaseIterable {
    case home
    case ideas
    case ask
    case recall
    case profile

    var title: String {
        switch self {
        case .home: "Home"
        case .ideas: "Ideas"
        case .ask: "Ask"
        case .recall: "Recall"
        case .profile: "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .home: "house.fill"
        case .ideas: "point.3.connected.trianglepath.dotted"
        case .ask: "sparkles"
        case .recall: "clock.arrow.circlepath"
        case .profile: "person"
        }
    }
}

private struct NomiTabBar: View {
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selectedTab: NomiTab

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            tabButton(.home)
            tabButton(.ideas)
            tabButton(.ask)
            tabButton(.recall)
            tabButton(.profile)
        }
        .padding(.horizontal, 10)
        .padding(.top, 11)
        .padding(.bottom, 10)
        .background(tabBarFill, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(tabBarStroke, lineWidth: 1)
        )
        .shadow(color: Color(red: 1, green: 0.22, blue: 0.42).opacity(colorScheme == .dark ? 0.20 : 0.13), radius: 18, y: 7)
    }

    private func tabButton(_ tab: NomiTab) -> some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 17, weight: .semibold))

                Text(tab.title)
                    .font(.caption2.weight(.bold))
            }
            .foregroundStyle(selectedTab == tab ? Color.nomiCoral : Color.nomiMuted)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var tabBarFill: Color {
        colorScheme == .dark
            ? Color(red: 0.12, green: 0.11, blue: 0.15)
            : Color.white
    }

    private var tabBarStroke: Color {
        colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.06)
    }
}

struct FriendCircleView: View {
    @EnvironmentObject private var appSession: AppSession

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        emptyState
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 16)
                    .padding(.bottom, 112)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            NomiAvatarView(
                name: appSession.profile?.displayName ?? appSession.profile?.email,
                imageURL: appSession.profile?.photoURL,
                size: 44,
                fontSize: 15
            )

            VStack(alignment: .leading, spacing: 4) {
                Text("Friend Circle")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(Color.nomiInk)

                Text("The people you learn with and from.")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.nomiMuted)
            }

            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 80)
            Image(systemName: "person.2.wave.2.fill")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(Color.nomiPink)
                .frame(width: 82, height: 82)
                .background(Color.nomiPink.opacity(0.10), in: Circle())

            Text("Learn with people you trust.")
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.nomiInk)

            Text("Invite friends, share collections, and discover the ideas your circle is saving.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)

            Text("Friend Circle is not connected yet.")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiPink)
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
                .background(Color.nomiPink.opacity(0.10), in: Capsule())
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

private struct LegacyConnectedIdeasGraphView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @Environment(\.dismiss) private var dismiss

    let centerMemory: NomiMemory?
    var showsBackButton = false

    @State private var selectedFilter: GraphFilter = .all
    @State private var selectedResult: RelatedMemoryResult?
    @State private var navigateToMemory: NomiMemory?
    @State private var graphScale: CGFloat = 1.0
    @State private var steadyGraphScale: CGFloat = 1.0

    init(centerMemory: NomiMemory? = nil, showsBackButton: Bool = false) {
        self.centerMemory = centerMemory
        self.showsBackButton = showsBackButton
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 16) {
                    header
                    filterChips

                    if memoryStore.isLoading {
                        Spacer()
                        ProgressView()
                            .tint(Color.nomiPink)
                        Spacer()
                    } else if let center = activeCenterMemory {
                        if filteredResults.isEmpty {
                            emptyState
                        } else {
                            graphCanvas(center: center, results: filteredResults)
                            graphLegend
                            Spacer(minLength: 0)
                        }
                    } else {
                        emptyState
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, showsBackButton ? 24 : 112)
            }
            .navigationBarHidden(true)
            .sheet(item: $selectedResult) { result in
                GraphMemoryPreviewSheet(result: result) {
                    navigateToMemory = result.memory
                    selectedResult = nil
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
            .navigationDestination(item: $navigateToMemory) { memory in
                MemoryDetailView(memory: memory)
            }
        }
    }

    private var header: some View {
        HStack {
            if showsBackButton {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .frame(width: 52, height: 52)
                        .background(Color.nomiCardStrong, in: Circle())
                        .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
            } else {
                Color.clear.frame(width: 52, height: 52)
            }

            Spacer()

            Text("Connected Ideas")
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.nomiInk)

            Spacer()

            Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.nomiPink)
                .frame(width: 52, height: 52)
                .background(Color.nomiCardStrong, in: Circle())
                .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
        }
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(GraphFilter.allCases) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Label(filter.title, systemImage: filter.systemImage)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(selectedFilter == filter ? Color.nomiPink : Color.nomiInk)
                            .lineLimit(1)
                            .padding(.vertical, 11)
                            .padding(.horizontal, 14)
                            .background(selectedFilter == filter ? Color.nomiPink.opacity(0.12) : Color.nomiCardStrong, in: Capsule())
                            .overlay(Capsule().stroke(selectedFilter == filter ? Color.nomiPink.opacity(0.30) : Color.nomiStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollClipDisabled()
    }

    private var activeCenterMemory: NomiMemory? {
        if let centerMemory,
           memoryStore.memories.contains(where: { $0.id == centerMemory.id }) {
            return centerMemory
        }
        return memoryStore.defaultGraphMemory
    }

    private var filteredResults: [RelatedMemoryResult] {
        guard let center = activeCenterMemory else { return [] }
        let results = memoryStore.graphMemories(for: center, limit: 10)
        guard selectedFilter != .all else { return results }
        return results.filter { result in
            result.reasonTypes.contains(selectedFilter.reasonType)
        }
    }

    private func graphCanvas(center: NomiMemory, results: [RelatedMemoryResult]) -> some View {
        GeometryReader { proxy in
            let viewport = proxy.size
            let canvasSize = CGSize(
                width: max(viewport.width, 350),
                height: max(viewport.height, 430)
            )

            ScrollViewReader { reader in
                ScrollView([.horizontal, .vertical], showsIndicators: false) {
                    GraphCanvasContent(
                        center: center,
                        results: results,
                        size: canvasSize,
                        selectResult: { selectedResult = $0 }
                    )
                    .frame(width: canvasSize.width, height: canvasSize.height)
                    .scaleEffect(graphScale)
                    .frame(width: canvasSize.width * graphScale, height: canvasSize.height * graphScale)
                    .contentShape(Rectangle())
                    .gesture(
                        MagnificationGesture()
                            .onChanged { value in
                                graphScale = min(max(steadyGraphScale * value, 0.78), 1.65)
                            }
                            .onEnded { value in
                                steadyGraphScale = min(max(steadyGraphScale * value, 0.78), 1.65)
                                graphScale = steadyGraphScale
                            }
                    )
                    .simultaneousGesture(
                        TapGesture(count: 2)
                            .onEnded {
                                withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                                    graphScale = 1.0
                                    steadyGraphScale = 1.0
                                    reader.scrollTo(GraphCanvasContent.centerNodeID, anchor: .center)
                                }
                            }
                    )
                }
                .onAppear {
                    DispatchQueue.main.async {
                        reader.scrollTo(GraphCanvasContent.centerNodeID, anchor: .center)
                    }
                }
            }
            .frame(width: viewport.width, height: viewport.height)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                Text("\(Int(graphScale * 100))%")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(Color.nomiMuted)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 9)
                    .background(Color.nomiCardStrong.opacity(0.92), in: Capsule())
                    .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
                    .padding(10)
            }
        }
        .frame(height: 430)
    }

    private var graphLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                legendItem("Concept", color: MemoryConnectionReasonType.concept.graphColor)
                legendItem("Entity", color: MemoryConnectionReasonType.entity.graphColor)
                legendItem("Author", color: MemoryConnectionReasonType.author.graphColor)
                legendItem("Project", color: MemoryConnectionReasonType.project.graphColor)
                legendItem("Tag", color: MemoryConnectionReasonType.tag.graphColor)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 18)
            .background(Color.nomiCardStrong, in: Capsule())
            .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
        }
        .scrollClipDisabled()
    }

    private func legendItem(_ title: String, color: Color) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 34, height: 3)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()

            Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(Color.nomiPink)
                .frame(width: 82, height: 82)
                .background(Color.nomiPink.opacity(0.10), in: Circle())

            Text("No strong connections yet")
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.nomiInk)

            Text("Save more memories or process your memories with Nomi AI to build your idea graph.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

private enum GraphFilter: String, CaseIterable, Identifiable {
    case all
    case concepts
    case entities
    case author
    case project
    case intent
    case tags

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .concepts: "Concepts"
        case .entities: "Entities"
        case .author: "Author"
        case .project: "Project"
        case .intent: "Intent"
        case .tags: "Tags"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "square.grid.2x2"
        case .concepts: "sparkles"
        case .entities: "circle.hexagongrid"
        case .author: "person"
        case .project: "folder"
        case .intent: "target"
        case .tags: "tag"
        }
    }

    var reasonType: MemoryConnectionReasonType {
        switch self {
        case .all: .similarText
        case .concepts: .concept
        case .entities: .entity
        case .author: .author
        case .project: .project
        case .intent: .intent
        case .tags: .tag
        }
    }
}

private struct GraphCanvasContent: View {
    static let centerNodeID = "connected-ideas-center-node"

    let center: NomiMemory
    let results: [RelatedMemoryResult]
    let size: CGSize
    let selectResult: (RelatedMemoryResult) -> Void

    var body: some View {
        let centerPoint = CGPoint(x: size.width / 2, y: size.height / 2)
        let nodePositions = positions(in: size, count: results.count)

        ZStack {
            ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                let point = nodePositions[index]
                GraphConnectionLine(start: centerPoint, end: point)
                    .stroke(
                        result.strongestReasonType.graphColor.opacity(0.72),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
            }

            ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                let point = nodePositions[index]
                Button {
                    selectResult(result)
                } label: {
                    RelatedGraphNode(result: result)
                }
                .buttonStyle(.plain)
                .position(point)
            }

            CenterGraphNode(memory: center, count: results.count)
                .id(Self.centerNodeID)
                .position(centerPoint)
        }
        .frame(width: size.width, height: size.height)
    }

    private func positions(in size: CGSize, count: Int) -> [CGPoint] {
        guard count > 0 else { return [] }
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let radiusX = min(size.width * 0.38, 152)
        let radiusY = min(size.height * 0.34, 162)
        let startAngle = -CGFloat.pi / 2

        return (0..<count).map { index in
            let angle = startAngle + (CGFloat(index) / CGFloat(count)) * CGFloat.pi * 2
            let stagger: CGFloat = index.isMultiple(of: 2) ? 1.0 : 1.06
            return CGPoint(
                x: center.x + cos(angle) * radiusX * stagger,
                y: center.y + sin(angle) * radiusY * stagger
            )
        }
    }
}

private struct GraphConnectionLine: Shape {
    let start: CGPoint
    let end: CGPoint

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: start)
        path.addQuadCurve(
            to: end,
            control: CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 18)
        )
        return path
    }
}

private struct CenterGraphNode: View {
    let memory: NomiMemory
    let count: Int

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: memory.graphIcon)
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            Text(memory.graphTitle)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiInk)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            Text(memory.graphSourceTypeLabel)
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.nomiMuted)
        }
        .padding(16)
        .frame(width: 150, height: 150)
        .background(Color.nomiCardStrong, in: Circle())
        .overlay(Circle().stroke(Color.nomiPink.opacity(0.78), lineWidth: 2))
        .shadow(color: Color.nomiPink.opacity(0.18), radius: 18, y: 8)
        .overlay(alignment: .topTrailing) {
            if count > 0 {
                Text("\(count)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(Color.nomiPink)
                    .frame(width: 30, height: 30)
                    .background(Color.nomiPink.opacity(0.14), in: Circle())
                    .offset(x: -12, y: 12)
            }
        }
    }
}

private struct RelatedGraphNode: View {
    let result: RelatedMemoryResult

    var body: some View {
        VStack(spacing: 7) {
            Image(systemName: result.memory.graphIcon)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            Text(result.memory.graphTitle)
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.nomiInk)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.76)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .frame(width: 108, height: 82)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(result.strongestReasonType.graphColor.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.045), radius: 10, y: 5)
        .overlay(alignment: .topTrailing) {
            Text("\(result.score)")
                .font(.caption.weight(.black))
                .foregroundStyle(result.strongestReasonType.graphColor)
                .frame(width: 28, height: 28)
                .background(result.strongestReasonType.graphColor.opacity(0.16), in: Circle())
                .offset(x: 9, y: -9)
        }
    }
}

private struct GraphMemoryPreviewSheet: View {
    let result: RelatedMemoryResult
    let openMemory: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: result.memory.graphIcon)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(result.memory.graphTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(2)

                    Text(result.memory.graphSourceTypeLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                }

                Spacer()

                HStack(spacing: 6) {
                    Text("Strength")
                    Text("\(result.score)")
                        .font(.headline.weight(.black))
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiPink)
                .padding(.vertical, 9)
                .padding(.horizontal, 12)
                .background(Color.nomiPink.opacity(0.08), in: Capsule())
                .overlay(Capsule().stroke(Color.nomiPink.opacity(0.22), lineWidth: 1))
            }

            Text(result.memory.previewText)
                .font(.body)
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(3)

            Text("Why it connects")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiMuted)

            FlowChipLayout(items: result.reasons, tint: result.strongestReasonType.graphColor)

            Button(action: openMemory) {
                Label("Open Memory", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiSecondaryButtonStyle())
            .tint(Color.nomiPink)

            Spacer(minLength: 0)
        }
        .padding(22)
        .background(NomiBackground())
    }
}

private struct FlowChipLayout: View {
    let items: [String]
    let tint: Color

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 138), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .padding(.vertical, 9)
                    .padding(.horizontal, 12)
                    .background(tint.opacity(0.10), in: Capsule())
            }
        }
    }
}

private extension MemoryConnectionReasonType {
    var graphColor: Color {
        switch self {
        case .concept: Color.nomiPurple
        case .entity: Color(red: 0.42, green: 0.62, blue: 1.0)
        case .project: Color(red: 0.30, green: 0.68, blue: 0.55)
        case .intent: Color.nomiOrange
        case .author: Color(red: 1.0, green: 0.55, blue: 0.36)
        case .category: Color(red: 0.56, green: 0.45, blue: 0.92)
        case .tag: Color.nomiPink
        case .similarText: Color.nomiMuted
        }
    }
}

private extension NomiMemory {
    var graphTitle: String {
        if let username = sourceUsername ?? author?.username,
           !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let handle = username.hasPrefix("@") ? username : "@\(username)"
            return sourceType == "x_bookmark" ? "\(handle) on X" : handle
        }

        return title.isEmpty ? "Untitled memory" : title
    }

    var graphIcon: String {
        switch sourceType.lowercased() {
        case "x_bookmark": "quote.bubble.fill"
        case "link": "link"
        case "image": "photo"
        case "voice": "waveform"
        default: "tray.and.arrow.down.fill"
        }
    }

    var graphSourceTypeLabel: String {
        switch sourceType.lowercased() {
        case "x_bookmark": "X Bookmark"
        case "manual_note": "Manual Note"
        case "link": "Link"
        case "image": "Image"
        case "voice": "Voice"
        default: sourceType.isEmpty ? "Memory" : sourceType
        }
    }
}
