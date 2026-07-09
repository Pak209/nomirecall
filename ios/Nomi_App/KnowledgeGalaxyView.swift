import SwiftUI

struct ConnectedIdeasGraphView: View {
    let centerMemory: NomiMemory?
    var showsBackButton = false

    init(centerMemory: NomiMemory? = nil, showsBackButton: Bool = false) {
        self.centerMemory = centerMemory
        self.showsBackButton = showsBackButton
    }

    var body: some View {
        KnowledgeGalaxyView(centerMemory: centerMemory, showsBackButton: showsBackButton)
    }
}

struct KnowledgeGalaxyView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let centerMemory: NomiMemory?
    var showsBackButton = false

    @State private var selectedFilter: GalaxyFilter = .all
    @State private var selectedNode: GalaxyNode?
    @State private var navigateToMemory: NomiMemory?
    @State private var openedCategory: GalaxyNode?
    @State private var canvasScale: CGFloat = 1
    @State private var canvasOffset: CGSize = .zero
    @State private var recenterToken = UUID()
    @State private var focusedCategoryIndex = 0
    @State private var focusedNodeID: String?

    init(centerMemory: NomiMemory? = nil, showsBackButton: Bool = false) {
        self.centerMemory = centerMemory
        self.showsBackButton = showsBackButton
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                galaxyBackground

                if memoryStore.isLoading {
                    ProgressView()
                        .tint(Color.nomiPink)
                } else if let graph {
                    KnowledgeGalaxyCanvasView(
                        graph: graph,
                        filter: selectedFilter,
                        selectedNode: $selectedNode,
                        scale: $canvasScale,
                        offset: $canvasOffset,
                        focusedNodeID: focusedNodeID,
                        onCategorySwipe: { step in
                            focusCategory(step: step, graph: graph)
                        },
                        onCategoryOpen: { node in
                            openedCategory = node
                        }
                    )
                    .id(recenterToken)
                    .ignoresSafeArea()

                    topChrome(graph: graph)
                    rightToolbar

                    if let selectedNode {
                        GalaxyNodeDetailCard(
                            node: selectedNode,
                            openMemory: {
                                if let memory = selectedNode.memory {
                                    navigateToMemory = memory
                                }
                            },
                            openCategory: {
                                openedCategory = selectedNode
                            }
                        )
                        .padding(.horizontal, 18)
                        .padding(.bottom, showsBackButton ? 18 : 104)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                } else {
                    emptyState
                        .padding(.bottom, showsBackButton ? 24 : 112)
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(item: $navigateToMemory) { memory in
                MemoryDetailView(memory: memory)
            }
            .navigationDestination(item: $openedCategory) { node in
                CategoryDetailView(categoryName: node.title)
            }
            .onChange(of: selectedFilter) { _, _ in
                selectedNode = graph?.filteredNodes(for: selectedFilter).first
            }
            .onAppear {
                if let graph, let firstCategory = graph.categoryNodes.first {
                    selectedNode = firstCategory
                    focusedNodeID = firstCategory.id
                } else {
                    selectedNode = graph?.nodes.first
                    focusedNodeID = selectedNode?.id
                }
            }
        }
    }

    private var activeCenterMemory: NomiMemory? {
        if let centerMemory,
           memoryStore.memories.contains(where: { $0.id == centerMemory.id }) {
            return centerMemory
        }
        return memoryStore.defaultGraphMemory
    }

    private var graph: GalaxyGraphModel? {
        guard let center = activeCenterMemory else { return nil }
        return GalaxyGraphModel.make(
            center: center,
            memories: memoryStore.memories,
            relatedResults: memoryStore.graphMemories(for: center, limit: memoryStore.memories.count)
        )
    }

    private var galaxyBackground: some View {
        ZStack {
            galaxyBase
            RadialGradient(
                colors: [
                    Color.nomiPurple.opacity(colorScheme == .dark ? 0.30 : 0.18),
                    Color.nomiPink.opacity(colorScheme == .dark ? 0.10 : 0.12),
                    .clear
                ],
                center: .center,
                startRadius: 10,
                endRadius: 330
            )
            LinearGradient(
                colors: [
                    topScrim,
                    .clear,
                    bottomScrim
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .ignoresSafeArea()
    }

    private var galaxyBase: Color {
        colorScheme == .dark
            ? Color(red: 0.01, green: 0.0, blue: 0.035)
            : Color(red: 0.985, green: 0.968, blue: 1.0)
    }

    private var topScrim: Color {
        colorScheme == .dark ? Color.black.opacity(0.68) : Color.white.opacity(0.76)
    }

    private var bottomScrim: Color {
        colorScheme == .dark ? Color.black.opacity(0.70) : Color.white.opacity(0.58)
    }

    private func topChrome(graph: GalaxyGraphModel) -> some View {
        VStack(spacing: 12) {
            header
            filterChips
            statsPill(graph: graph)
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(alignment: .top) {
            LinearGradient(
                colors: [
                    colorScheme == .dark ? Color.black.opacity(0.74) : Color.white.opacity(0.82),
                    colorScheme == .dark ? Color.black.opacity(0.34) : Color.white.opacity(0.42),
                    .clear
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 190)
            .ignoresSafeArea()
        }
    }

    private var header: some View {
        HStack {
            if showsBackButton {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.headline.weight(.bold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(GalaxyIconButtonStyle())
            } else {
                Image(systemName: "square.grid.2x2")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(primaryChrome)
                    .frame(width: 44, height: 44)
                    .background(iconButtonFill, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(iconButtonStroke, lineWidth: 1))
            }

            Spacer()

            Text("Knowledge Galaxy")
                .font(.headline.weight(.black))
                .foregroundStyle(primaryChrome)

            Spacer()

            Button {
                recenter()
            } label: {
                Image(systemName: "scope")
                    .font(.headline.weight(.bold))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(GalaxyIconButtonStyle())
        }
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(GalaxyFilter.allCases) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Label(filter.title, systemImage: filter.icon)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(selectedFilter == filter ? .white : secondaryChrome)
                            .lineLimit(1)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 14)
                            .background(selectedFilter == filter ? Color.nomiPurple : chipFill, in: Capsule())
                            .overlay(Capsule().stroke(selectedFilter == filter ? Color.nomiPurple.opacity(0.34) : chipStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollClipDisabled()
    }

    private func statsPill(graph: GalaxyGraphModel) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "square")
                .font(.caption.weight(.black))
                .foregroundStyle(Color.nomiPink)
            Text("\(max(graph.notesCount, memoryStore.memories.count)) notes • \(graph.linksCount) links")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(primaryChrome.opacity(0.88))
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .background(Color.nomiPurple.opacity(0.20), in: Capsule())
        .overlay(Capsule().stroke(Color.nomiPurple.opacity(0.36), lineWidth: 1))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var rightToolbar: some View {
        VStack(spacing: 14) {
            Spacer()
                .frame(height: 150)

            Button {
                selectedNode = graph?.nodes.first
            } label: {
                Image(systemName: "sparkles")
                    .frame(width: 58, height: 58)
            }
            .buttonStyle(GalaxyFloatingButtonStyle())

            Button {
                recenter()
            } label: {
                Image(systemName: "scope")
                    .frame(width: 58, height: 58)
            }
            .buttonStyle(GalaxyFloatingButtonStyle())

            Button {
                selectedNode = nil
            } label: {
                Image(systemName: "circle.slash")
                    .frame(width: 58, height: 58)
            }
            .buttonStyle(GalaxyFloatingButtonStyle())

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.trailing, 18)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(Color.nomiPink)
                .frame(width: 82, height: 82)
                .background(Color.nomiPink.opacity(0.12), in: Circle())

            Text("No galaxy yet")
                .font(.title3.weight(.bold))
                .foregroundStyle(primaryChrome)

            Text("Save more memories or process your captures with Nomi AI to light up connected ideas.")
                .font(.subheadline)
                .foregroundStyle(secondaryChrome)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func recenter() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.84)) {
            canvasScale = 1
            canvasOffset = .zero
            recenterToken = UUID()
            focusedNodeID = selectedNode?.id
        }
    }

    private func focusCategory(step: Int, graph: GalaxyGraphModel) {
        let categories = graph.categoryNodes
        guard !categories.isEmpty else { return }
        let nextIndex = (focusedCategoryIndex + step + categories.count) % categories.count
        focusedCategoryIndex = nextIndex
        let node = categories[nextIndex]
        withAnimation(.spring(response: 0.36, dampingFraction: 0.84)) {
            selectedFilter = .all
            selectedNode = node
            focusedNodeID = node.id
        }
    }

    private var primaryChrome: Color {
        colorScheme == .dark ? .white : Color(red: 0.12, green: 0.09, blue: 0.18)
    }

    private var secondaryChrome: Color {
        colorScheme == .dark ? .white.opacity(0.62) : Color(red: 0.44, green: 0.38, blue: 0.54)
    }

    private var chipFill: Color {
        colorScheme == .dark ? Color(red: 0.055, green: 0.025, blue: 0.09).opacity(0.92) : .white.opacity(0.74)
    }

    private var chipStroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.22) : Color.nomiPurple.opacity(0.16)
    }

    private var iconButtonFill: Color {
        colorScheme == .dark ? Color(red: 0.055, green: 0.025, blue: 0.09).opacity(0.96) : .white.opacity(0.76)
    }

    private var iconButtonStroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.24) : Color.black.opacity(0.06)
    }
}

private struct GalaxyNodeDetailCard: View {
    @Environment(\.colorScheme) private var colorScheme

    let node: GalaxyNode
    let openMemory: () -> Void
    var openCategory: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Capsule()
                .fill(.white.opacity(0.20))
                .frame(width: 72, height: 7)
                .frame(maxWidth: .infinity)

            HStack(alignment: .center, spacing: 14) {
                Group {
                    if node.isCategory {
                        NomiCategoryIconView(categoryName: node.title, size: 46, strokeColor: node.kind.color)
                    } else {
                        Image(systemName: node.kind.icon)
                            .font(.title2.weight(.black))
                            .foregroundStyle(node.kind.color)
                    }
                }
                .frame(width: 64, height: 64)
                .background(node.kind.color.opacity(0.18), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(node.kind.color.opacity(0.72), lineWidth: 2))

                VStack(alignment: .leading, spacing: 4) {
                    Text(node.title)
                        .font(.title3.weight(.black))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)

                    Text(node.subtitle)
                        .font(.subheadline.weight(.black))
                        .foregroundStyle(node.kind.color)
                }

                Spacer()

                HStack(spacing: 6) {
                    Text("\(node.links)")
                        .font(.headline.weight(.black))
                    Text("links")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(.white.opacity(0.56))
            }

            Text(node.detail)
                .font(.body)
                .foregroundStyle(detailText)
                .lineLimit(3)

            if node.isMemory {
                Button(action: openMemory) {
                    Label("Open Memory", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(GalaxyMemoryButtonStyle(tint: node.kind.color))
            } else if node.isCategory {
                Button(action: openCategory) {
                    Label("Explore Category", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(GalaxyMemoryButtonStyle(tint: node.kind.color))
            }
        }
        .padding(22)
        .background(cardFill, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(cardStroke, lineWidth: 1))
        .shadow(color: .black.opacity(0.32), radius: 24, y: -4)
    }

    private var cardFill: Color {
        colorScheme == .dark
            ? Color(red: 0.018, green: 0.0, blue: 0.035).opacity(0.98)
            : Color.white.opacity(0.94)
    }

    private var cardStroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.24) : Color.black.opacity(0.06)
    }

    private var detailText: Color {
        colorScheme == .dark ? .white.opacity(0.58) : Color(red: 0.42, green: 0.38, blue: 0.48)
    }
}

private struct GalaxyIconButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground.opacity(configuration.isPressed ? 0.62 : 0.88))
            .background(fill(configuration.isPressed), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(stroke, lineWidth: 1))
    }

    private var foreground: Color {
        colorScheme == .dark ? .white : Color(red: 0.12, green: 0.09, blue: 0.18)
    }

    private var stroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.24) : Color.black.opacity(0.06)
    }

    private func fill(_ pressed: Bool) -> Color {
        if colorScheme == .dark {
            return Color(red: 0.055, green: 0.025, blue: 0.09).opacity(pressed ? 0.82 : 0.96)
        }
        return Color.white.opacity(pressed ? 0.62 : 0.78)
    }
}

private struct GalaxyFloatingButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) private var colorScheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.title3.weight(.bold))
            .foregroundStyle(foreground.opacity(configuration.isPressed ? 0.55 : 0.78))
            .background(fill(configuration.isPressed), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(stroke, lineWidth: 1))
    }

    private var foreground: Color {
        colorScheme == .dark ? .white : Color(red: 0.16, green: 0.10, blue: 0.24)
    }

    private var stroke: Color {
        colorScheme == .dark ? Color.nomiPurple.opacity(0.24) : Color.black.opacity(0.06)
    }

    private func fill(_ pressed: Bool) -> Color {
        if colorScheme == .dark {
            return Color(red: 0.045, green: 0.018, blue: 0.08).opacity(pressed ? 0.76 : 0.94)
        }
        return Color.white.opacity(pressed ? 0.62 : 0.82)
    }
}

private struct GalaxyMemoryButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .foregroundStyle(tint)
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(tint.opacity(configuration.isPressed ? 0.18 : 0.11), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(tint.opacity(0.24), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}
