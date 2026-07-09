import SwiftUI

struct KnowledgeGalaxyCanvasView: View {
    @Environment(\.colorScheme) private var colorScheme

    let graph: GalaxyGraphModel
    let filter: GalaxyFilter
    @Binding var selectedNode: GalaxyNode?
    @Binding var scale: CGFloat
    @Binding var offset: CGSize
    let focusedNodeID: String?
    let onCategorySwipe: (Int) -> Void
    var onCategoryOpen: (GalaxyNode) -> Void = { _ in }

    @State private var steadyScale: CGFloat = 1
    @State private var steadyOffset: CGSize = .zero

    private let stars: [GalaxyStar] = GalaxyStar.make(count: 96)

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let projection = GalaxyProjection(size: size, scale: scale, offset: offset)
            let nodes = visibleNodes.sorted { $0.position.z < $1.position.z }
            let nodeByID = Dictionary(uniqueKeysWithValues: visibleNodes.map { ($0.id, $0) })
            let selectedID = selectedNode?.id
            let connectedIDs = connectedNodeIDs(selectedID: selectedID)

            ZStack {
                Canvas { context, canvasSize in
                    drawStars(in: context, size: canvasSize)
                    drawAmbientRings(in: context, projection: projection, center: graph.nodes.first)
                    drawEdges(in: context, projection: projection, nodeByID: nodeByID, selectedID: selectedID, connectedIDs: connectedIDs)
                }

                ForEach(nodes) { node in
                    let point = projection.project(node.position)
                    GalaxyNodeView(
                        node: node,
                        isSelected: selectedID == node.id,
                        isDimmed: selectedID != nil && selectedID != node.id && !connectedIDs.contains(node.id),
                        depthScale: projection.depthScale(node.position.z)
                    )
                    .position(point)
                    .onTapGesture {
                        // Second tap on an already-selected category enters
                        // its dedicated category screen.
                        if node.isCategory && selectedNode?.id == node.id {
                            onCategoryOpen(node)
                        } else {
                            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                                selectedNode = node
                            }
                        }
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(dragGesture)
            .simultaneousGesture(magnificationGesture)
            .onTapGesture(count: 2) {
                recenter()
            }
            .onChange(of: focusedNodeID) { _, nodeID in
                guard let nodeID, let node = graph.nodes.first(where: { $0.id == nodeID }) else { return }
                focus(on: node, size: size)
            }
        }
    }

    func recenter() {
        withAnimation(.spring(response: 0.36, dampingFraction: 0.84)) {
            scale = 1
            steadyScale = 1
            offset = .zero
            steadyOffset = .zero
        }
    }

    private var visibleNodes: [GalaxyNode] {
        graph.filteredNodes(for: filter)
    }

    private var visibleEdges: [GalaxyEdge] {
        graph.filteredEdges(for: filter)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                offset = CGSize(
                    width: steadyOffset.width + value.translation.width,
                    height: steadyOffset.height + value.translation.height
                )
            }
            .onEnded { value in
                let horizontalIntent = abs(value.translation.width) > 86 && abs(value.translation.width) > abs(value.translation.height) * 1.35
                if horizontalIntent && scale <= 1.35 {
                    onCategorySwipe(value.translation.width < 0 ? 1 : -1)
                    return
                }
                steadyOffset = offset
            }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = min(max(steadyScale * value, 0.55), 2.25)
            }
            .onEnded { value in
                steadyScale = min(max(steadyScale * value, 0.55), 2.25)
                scale = steadyScale
            }
    }

    private func connectedNodeIDs(selectedID: String?) -> Set<String> {
        guard let selectedID else { return [] }
        var ids: Set<String> = [selectedID]
        for edge in visibleEdges where edge.from == selectedID || edge.to == selectedID {
            ids.insert(edge.from)
            ids.insert(edge.to)
        }
        return ids
    }

    private func drawStars(in context: GraphicsContext, size: CGSize) {
        for star in stars {
            let rect = CGRect(
                x: star.x * size.width,
                y: star.y * size.height,
                width: star.radius,
                height: star.radius
            )
            context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(star.opacity)))
        }
    }

    private func drawAmbientRings(in context: GraphicsContext, projection: GalaxyProjection, center: GalaxyNode?) {
        guard let center else { return }
        let point = projection.project(center.position)
        for index in 0..<3 {
            let radius = (72 + CGFloat(index) * 45) * projection.scale
            let rect = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
            context.stroke(
                Path(ellipseIn: rect),
                with: .color(Color.nomiPurple.opacity((colorScheme == .dark ? 0.16 : 0.11) - Double(index) * 0.028)),
                lineWidth: max(1, 2.0 - CGFloat(index) * 0.35)
            )
        }
    }

    private func focus(on node: GalaxyNode, size: CGSize) {
        let projection = GalaxyProjection(size: size, scale: scale, offset: .zero)
        let point = projection.project(node.position)
        withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) {
            offset = CGSize(width: size.width / 2 - point.x, height: size.height / 2 - point.y)
            steadyOffset = offset
        }
    }

    private func drawEdges(
        in context: GraphicsContext,
        projection: GalaxyProjection,
        nodeByID: [String: GalaxyNode],
        selectedID: String?,
        connectedIDs: Set<String>
    ) {
        for edge in visibleEdges {
            guard let from = nodeByID[edge.from], let to = nodeByID[edge.to] else { continue }
            let start = projection.project(from.position)
            let end = projection.project(to.position)
            let highlighted = selectedID == nil || edge.from == selectedID || edge.to == selectedID
            let dimmed = selectedID != nil && !highlighted

            var path = Path()
            path.move(to: start)
            let control = CGPoint(
                x: (start.x + end.x) / 2,
                y: (start.y + end.y) / 2 - CGFloat((from.position.z + to.position.z) * 28)
            )
            path.addQuadCurve(to: end, control: control)

            context.stroke(
                path,
                with: .color(edge.reason.galaxyColor.opacity(dimmed ? 0.07 : highlighted ? 0.74 : 0.28)),
                style: StrokeStyle(lineWidth: highlighted ? 1.7 + edge.strength * 2.6 : 1.0, lineCap: .round)
            )
        }
    }
}

private struct GalaxyProjection {
    let size: CGSize
    let scale: CGFloat
    let offset: CGSize

    func project(_ point: SIMD3<Double>) -> CGPoint {
        let depth = depthScale(point.z)
        let spread = min(size.width, size.height) * 0.34 * scale
        return CGPoint(
            x: size.width / 2 + CGFloat(point.x) * spread * depth + offset.width,
            y: size.height / 2 + CGFloat(point.y) * spread * depth + offset.height
        )
    }

    func depthScale(_ z: Double) -> CGFloat {
        CGFloat(1.0 + z * 0.28)
    }
}

private struct GalaxyNodeView: View {
    @Environment(\.colorScheme) private var colorScheme

    let node: GalaxyNode
    let isSelected: Bool
    let isDimmed: Bool
    let depthScale: CGFloat

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(node.kind.color.opacity(isSelected ? 0.24 : 0.16))
                    .frame(width: haloSize, height: haloSize)
                    .blur(radius: isSelected ? 1 : 3)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [.white, node.kind.color, node.kind.color.opacity(0.44)],
                            center: .center,
                            startRadius: 1,
                            endRadius: nodeSize / 2
                        )
                    )
                    .frame(width: nodeSize, height: nodeSize)
                    .overlay(Circle().stroke(.white.opacity(isSelected ? 0.82 : 0.38), lineWidth: isSelected ? 2 : 1))
                    .shadow(color: node.kind.color.opacity(isSelected ? 0.85 : 0.45), radius: isSelected ? 18 : 9)

                if node.isCategory {
                    // Category nodes show their category glyph (Nomi icon
                    // system) instead of the generic concept lightbulb.
                    NomiCategoryGlyph(categoryName: node.title, color: .white.opacity(0.85), weight: .black)
                        .frame(width: iconSize, height: iconSize)
                } else {
                    Image(systemName: node.kind.icon)
                        .font(.system(size: iconSize, weight: .black))
                        .foregroundStyle(.white.opacity(node.kind == .hub ? 0.95 : 0.78))
                }
            }

                Text(node.title)
                .font(.system(size: labelSize, weight: node.kind == .concept || node.kind == .hub || isSelected ? .black : .bold))
                .foregroundStyle(labelColor.opacity(isDimmed ? 0.36 : 0.94))
                .shadow(color: labelShadow, radius: colorScheme == .dark ? 6 : 3)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: labelWidth)
                .minimumScaleFactor(0.72)
        }
        .scaleEffect(depthScale)
        .opacity(isDimmed ? 0.34 : 1)
        .animation(.spring(response: 0.28, dampingFraction: 0.82), value: isSelected)
        .animation(.easeInOut(duration: 0.18), value: isDimmed)
    }

    private var nodeSize: CGFloat {
        switch node.kind {
        case .hub: 34
        case .concept: 54
        case .memory: 18
        default: 22
        }
    }

    private var haloSize: CGFloat {
        switch node.kind {
        case .hub: 92
        case .concept: 124
        case .memory: 44
        default: 48
        }
    }

    private var iconSize: CGFloat {
        switch node.kind {
        case .concept: 18
        case .hub: 12
        default: 8
        }
    }

    private var labelSize: CGFloat {
        switch node.kind {
        case .concept: 17
        case .hub: 14
        case .memory: 10
        default: 12
        }
    }

    private var labelWidth: CGFloat {
        switch node.kind {
        case .concept: 126
        case .hub: 120
        case .memory: 82
        default: 96
        }
    }

    private var labelColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.13, green: 0.09, blue: 0.20)
    }

    private var labelShadow: Color {
        colorScheme == .dark ? node.kind.color.opacity(0.72) : .white.opacity(0.90)
    }
}

private struct GalaxyStar {
    let x: CGFloat
    let y: CGFloat
    let radius: CGFloat
    let opacity: Double

    static func make(count: Int) -> [GalaxyStar] {
        (0..<count).map { index in
            let x = CGFloat((index * 37 % 101)) / 100.0
            let y = CGFloat((index * 61 % 113)) / 112.0
            let radius = CGFloat(0.8 + Double(index % 3) * 0.55)
            let opacity = 0.12 + Double(index % 7) * 0.055
            return GalaxyStar(x: x, y: y, radius: radius, opacity: opacity)
        }
    }
}
