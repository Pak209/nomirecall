import SwiftUI

enum GalaxyNodeKind: String, Identifiable, CaseIterable, Hashable {
    case hub
    case memory
    case concept
    case entity
    case author
    case tag

    var id: String { rawValue }

    var title: String {
        switch self {
        case .hub: "Primary"
        case .memory: "Memory"
        case .concept: "Concept"
        case .entity: "Entity"
        case .author: "Author"
        case .tag: "Tag"
        }
    }

    var icon: String {
        switch self {
        case .hub: "sparkles"
        case .memory: "square.on.square"
        case .concept: "lightbulb.fill"
        case .entity: "circle.hexagongrid.fill"
        case .author: "person.crop.circle.fill"
        case .tag: "tag.fill"
        }
    }

    var color: Color {
        switch self {
        case .hub: Color(red: 0.82, green: 0.22, blue: 1.0)
        case .memory: Color(red: 0.23, green: 0.55, blue: 1.0)
        case .concept: Color.nomiPurple
        case .entity: Color(red: 0.26, green: 0.76, blue: 0.96)
        case .author: Color(red: 1.0, green: 0.35, blue: 0.56)
        case .tag: Color.nomiPink
        }
    }
}

struct GalaxyNode: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let detail: String
    let kind: GalaxyNodeKind
    let links: Int
    let memory: NomiMemory?
    let position: SIMD3<Double>

    var isMemory: Bool { memory != nil }

    /// Category orbit nodes are concept-kind nodes created with a "category-"
    /// id prefix (see GalaxyGraphModel). They get the Nomi category icon
    /// treatment instead of the generic kind glyph.
    var isCategory: Bool { id.hasPrefix("category-") }
}

struct GalaxyEdge: Identifiable, Hashable {
    let id: String
    let from: String
    let to: String
    let strength: Double
    let reason: MemoryConnectionReasonType
}

enum GalaxyFilter: String, CaseIterable, Identifiable {
    case all
    case primary
    case memories
    case concepts
    case entities
    case links

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .primary: "Primary"
        case .memories: "Memory"
        case .concepts: "Concepts"
        case .entities: "Entities"
        case .links: "Links"
        }
    }

    var icon: String {
        switch self {
        case .all: "square.grid.2x2"
        case .primary: "sparkles"
        case .memories: "square.on.square"
        case .concepts: "lightbulb"
        case .entities: "circle.hexagongrid"
        case .links: "point.3.connected.trianglepath.dotted"
        }
    }
}

extension NomiMemory {
    var galaxyTitle: String {
        if let username = sourceUsername ?? author?.username,
           !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let handle = username.hasPrefix("@") ? username : "@\(username)"
            return sourceType == "x_bookmark" ? "\(handle) on X" : handle
        }

        return title.isEmpty ? "Untitled memory" : title
    }

    var galaxySubtitle: String {
        switch sourceType.lowercased() {
        case "x_bookmark": "X Bookmark"
        case "manual_note": "Manual Note"
        case "link": "Link"
        case "image": "Image"
        case "voice": "Voice"
        default: sourceType.isEmpty ? "Memory" : sourceType
        }
    }

    var galaxyPreview: String {
        if let summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return summary
        }
        if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return content
        }
        return rawText
    }
}

extension MemoryConnectionReasonType {
    var galaxyColor: Color {
        switch self {
        case .concept: Color.nomiPurple
        case .entity: Color(red: 0.26, green: 0.76, blue: 0.96)
        case .project: Color(red: 0.30, green: 0.68, blue: 0.55)
        case .intent: Color.nomiOrange
        case .author: Color(red: 1.0, green: 0.35, blue: 0.56)
        case .category: Color(red: 0.56, green: 0.45, blue: 0.92)
        case .tag: Color.nomiPink
        case .similarText: Color.nomiMuted
        }
    }
}
