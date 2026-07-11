import Foundation

struct GalaxyGraphModel {
    let center: NomiMemory
    let nodes: [GalaxyNode]
    let edges: [GalaxyEdge]

    var notesCount: Int {
        nodes.filter(\.isMemory).count
    }

    var linksCount: Int {
        edges.count
    }

    var categoryNodes: [GalaxyNode] {
        nodes
            .filter { $0.kind == .concept }
            .sorted {
                if $0.links == $1.links { return $0.title < $1.title }
                return $0.links > $1.links
            }
    }

    func filteredNodes(for filter: GalaxyFilter) -> [GalaxyNode] {
        switch filter {
        case .all:
            // Individual memory dots (one per saved memory) and @author nodes
            // overwhelm the overview. The default view stays at the
            // category/concept altitude; Memory and Entities chips surface
            // the rest on demand.
            return nodes.filter { $0.kind != .memory && $0.kind != .author }
        case .links:
            // Link-flavored memories only (links, X posts, TikToks) — this
            // chip previously returned the same set as All and did nothing.
            return nodes.filter { node in
                if node.kind == .hub { return true }
                guard node.kind == .memory, let memory = node.memory else { return false }
                return memory.displayType == "Link"
                    || memory.displayType == "X post"
                    || memory.type.localizedCaseInsensitiveContains("tiktok")
                    || memory.sourceUrl != nil
            }
        case .primary:
            return nodes.filter { $0.kind == .hub }
        case .memories:
            return nodes.filter { $0.kind == .hub || $0.kind == .memory }
        case .concepts:
            return nodes.filter { $0.kind == .hub || $0.kind == .concept || $0.kind == .tag }
        case .entities:
            return nodes.filter { $0.kind == .hub || $0.kind == .entity || $0.kind == .author }
        }
    }

    func filteredEdges(for filter: GalaxyFilter) -> [GalaxyEdge] {
        let visibleIds = Set(filteredNodes(for: filter).map(\.id))
        return edges.filter { visibleIds.contains($0.from) && visibleIds.contains($0.to) }
    }

    static func make(center: NomiMemory, memories: [NomiMemory], relatedResults: [RelatedMemoryResult]) -> GalaxyGraphModel {
        let hubID = "hub-\(center.id)"
        let activeMemories = memories
            .filter { !$0.isArchived }
            .sorted {
                if $0.id == center.id { return true }
                if $1.id == center.id { return false }
                return $0.createdAt > $1.createdAt
            }
        let relatedById = Dictionary(uniqueKeysWithValues: relatedResults.map { ($0.memory.id, $0) })
        var nodes: [GalaxyNode] = [
            GalaxyNode(
                id: hubID,
                title: center.galaxyTitle,
                subtitle: "Central Hub",
                detail: center.galaxyPreview,
                kind: .hub,
                links: activeMemories.count,
                memory: center,
                position: SIMD3<Double>(0, 0, 0.08)
            )
        ]
        var edges: [GalaxyEdge] = []

        let categories = Dictionary(grouping: activeMemories) { memory in
            memory.category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "General" : memory.category
        }
        let sortedCategories = categories.keys.sorted { lhs, rhs in
            (categories[lhs]?.count ?? 0) > (categories[rhs]?.count ?? 0)
        }
        let categoryCenters = Dictionary(uniqueKeysWithValues: sortedCategories.enumerated().map { index, category in
            (category, orbitPoint(index: index, count: sortedCategories.count, radius: 1.22, yCompression: 0.66, depthAmount: 0.24))
        })
        let memoryIndexById = Dictionary(uniqueKeysWithValues: activeMemories.enumerated().map { ($0.element.id, $0.offset) })

        for memory in activeMemories {
            let memoryID = "memory-\(memory.id)"
            let category = memory.category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "General" : memory.category
            let siblings = categories[category] ?? []
            let siblingIndex = siblings.firstIndex(where: { $0.id == memory.id }) ?? memoryIndexById[memory.id] ?? 0
            let categoryCenter = categoryCenters[category] ?? .zero
            let point = moonPoint(
                index: siblingIndex,
                count: siblings.count,
                center: categoryCenter,
                radius: memory.id == center.id ? 0.30 : 0.38 + Double(siblingIndex % 4) * 0.055
            )
            let result = relatedById[memory.id]
            let links = result?.score ?? max(1, memory.tags.count + memory.concepts.count + memory.entities.count)
            nodes.append(
                GalaxyNode(
                    id: memoryID,
                    title: memory.galaxyTitle,
                    subtitle: memory.galaxySubtitle,
                    detail: memory.galaxyPreview,
                    kind: .memory,
                    links: links,
                    memory: memory,
                    position: point
                )
            )
            edges.append(
                GalaxyEdge(
                    id: "edge-\(hubID)-\(memoryID)",
                    from: hubID,
                    to: memoryID,
                    strength: result?.strength ?? 0.24,
                    reason: result?.strongestReasonType ?? .category
                )
            )
        }

        for (index, category) in sortedCategories.enumerated() {
            let categoryID = "category-\(category.normalizedGalaxyID)"
            let point = categoryCenters[category] ?? orbitPoint(index: index, count: sortedCategories.count, radius: 1.22, yCompression: 0.66, depthAmount: 0.24)
            nodes.append(
                GalaxyNode(
                    id: categoryID,
                    title: category,
                    subtitle: "Category",
                    detail: "\(categories[category]?.count ?? 0) memories saved in \(category).",
                    kind: .concept,
                    links: categories[category]?.count ?? 0,
                    memory: nil,
                    position: SIMD3<Double>(point.x, point.y, point.z + 0.16)
                )
            )
            edges.append(
                GalaxyEdge(
                    id: "edge-\(hubID)-\(categoryID)",
                    from: hubID,
                    to: categoryID,
                    strength: 0.56,
                    reason: .category
                )
            )

            for memory in categories[category] ?? [] {
                edges.append(
                    GalaxyEdge(
                        id: "edge-\(categoryID)-memory-\(memory.id)",
                        from: categoryID,
                        to: "memory-\(memory.id)",
                        strength: 0.42,
                        reason: .category
                    )
                )
            }
        }

        return GalaxyGraphModel(center: center, nodes: nodes, edges: edges)
    }

    private static func orbitPoint(index: Int, count: Int, radius: Double, yCompression: Double = 0.78, depthAmount: Double = 0.42) -> SIMD3<Double> {
        let count = max(count, 1)
        let angle = (-Double.pi / 2.0) + (Double(index) / Double(count)) * Double.pi * 2.0
        let depth = sin(angle * 1.7) * depthAmount
        let stagger = index.isMultiple(of: 2) ? 1.0 : 1.18
        return SIMD3<Double>(
            cos(angle) * radius * stagger,
            sin(angle) * radius * yCompression * stagger,
            depth
        )
    }

    private static func moonPoint(index: Int, count: Int, center: SIMD3<Double>, radius: Double) -> SIMD3<Double> {
        let count = max(count, 1)
        let ring = index / 9
        let ringIndex = index % 9
        let ringCount = min(9, max(1, count - ring * 9))
        let angle = (-Double.pi / 2.0) + (Double(ringIndex) / Double(ringCount)) * Double.pi * 2.0 + Double(ring) * 0.38
        let ringRadius = radius + Double(ring) * 0.24
        return SIMD3<Double>(
            center.x + cos(angle) * ringRadius,
            center.y + sin(angle) * ringRadius * 0.72,
            center.z - 0.16 + sin(angle * 1.4) * 0.10
        )
    }

}

private extension String {
    var normalizedGalaxyID: String {
        lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
    }
}
