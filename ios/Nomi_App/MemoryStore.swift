import Foundation

@MainActor
final class MemoryStore: ObservableObject {
    @Published private(set) var memories: [NomiMemory] = []
    @Published private(set) var memoryEdges: [MemoryEdge] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let memoryService = MemoryService()
    private let backendService = XBackendService()
    private var attemptedLegacyImports = Set<String>()

    var categories: [String] {
        Array(Set(memories.map(\.category))).sorted()
    }

    var tags: [String] {
        filterTags(archivedOnly: false)
    }

    var sourceTypes: [String] {
        Array(Set(memories.map(\.sourceType))).sorted()
    }

    func search(options: NomiMemorySearchOptions) -> [NomiMemory] {
        NomiMemorySearch.filter(memories, options: options)
    }

    func filterTags(archivedOnly: Bool) -> [String] {
        let systemTags: Set<String> = [
            "xpost",
            "twitter",
            "x",
            "bookmark",
            "bookmarks",
            "imported",
            "post",
            "link",
            "links",
            "url",
            "urls",
            "thread",
            "social",
            "general",
            "capture",
            "note",
            "text",
            "manual",
            "manual_note",
            "tweet",
            "x_bookmark"
        ]

        let scopedMemories = memories.filter { archivedOnly ? $0.isArchived : !$0.isArchived }
        let tags = scopedMemories.flatMap(\.tags)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "") }
            .filter { !$0.isEmpty && !systemTags.contains($0.lowercased()) }
        return Array(Set(tags)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    func relatedMemories(for memory: NomiMemory, limit: Int = 6) -> [RelatedMemoryResult] {
        let persisted = persistedRelatedMemories(for: memory, limit: limit)
        if !persisted.isEmpty { return persisted }
        return RelatedMemories.find(for: memory, in: memories, limit: limit)
    }

    func graphMemories(for memory: NomiMemory, limit: Int = 8) -> [RelatedMemoryResult] {
        let persisted = persistedRelatedMemories(for: memory, limit: limit)
        if !persisted.isEmpty { return persisted }

        let strong = RelatedMemories.graphCandidates(for: memory, in: memories, limit: limit)
        let minimumVisibleNodes = min(4, limit)
        guard strong.count < minimumVisibleNodes else { return strong }

        let strongIds = Set(strong.map(\.memory.id))
        let softerMatches = RelatedMemories.find(for: memory, in: memories, limit: limit)
            .filter { !strongIds.contains($0.memory.id) }
        return Array((strong + softerMatches).prefix(limit))
    }

    var defaultGraphMemory: NomiMemory? {
        memories
            .filter { !$0.isArchived }
            .map { memory in
                (memory, graphMemories(for: memory, limit: 1).first?.score ?? 0)
            }
            .filter { $0.1 >= RelatedMemories.graphMinimumScore }
            .sorted {
                if $0.1 == $1.1 {
                    return $0.0.createdAt > $1.0.createdAt
                }
                return $0.1 > $1.1
            }
            .first?.0
    }

    func load(userId: String) async {
        guard !userId.isEmpty else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            memories = try await memoryService.memories(userId: userId)
            memoryEdges = (try? await memoryService.memoryEdges(userId: userId)) ?? []
            if memories.isEmpty && !attemptedLegacyImports.contains(userId) {
                attemptedLegacyImports.insert(userId)
                try await importLegacyMemoriesIfAvailable(userId: userId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func persistedRelatedMemories(for memory: NomiMemory, limit: Int) -> [RelatedMemoryResult] {
        guard !memoryEdges.isEmpty else { return [] }
        let byId = Dictionary(uniqueKeysWithValues: memories.map { ($0.id, $0) })
        return memoryEdges
            .filter { $0.fromMemoryId == memory.id || $0.toMemoryId == memory.id }
            .compactMap { edge -> RelatedMemoryResult? in
                let otherId = edge.fromMemoryId == memory.id ? edge.toMemoryId : edge.fromMemoryId
                guard let related = byId[otherId], !related.isArchived else { return nil }
                let score = max(1, Int(round((edge.score ?? edge.strength) * 12)))
                let reasons = edge.reasons.isEmpty
                    ? [edge.explanation ?? "Connected by saved memory overlap"]
                    : edge.reasons
                let reasonTypes = edge.reasonTypes.compactMap(memoryConnectionReasonType)
                return RelatedMemoryResult(
                    memory: related,
                    score: score,
                    reasons: reasons,
                    reasonTypes: reasonTypes.isEmpty ? [memoryConnectionReasonType(for: edge.reason)] : reasonTypes
                )
            }
            .sorted {
                if $0.score == $1.score {
                    return $0.memory.createdAt > $1.memory.createdAt
                }
                return $0.score > $1.score
            }
            .prefix(limit)
            .map { $0 }
    }

    private func memoryConnectionReasonType(_ rawValue: String) -> MemoryConnectionReasonType? {
        switch rawValue {
        case "shared_concepts": return .concept
        case "shared_entities": return .entity
        case "shared_projects": return .project
        case "shared_tags": return .tag
        case "same_category": return .category
        case "semantic_similarity": return .similarText
        default: return nil
        }
    }

    private func memoryConnectionReasonType(for reason: MemoryEdgeReason) -> MemoryConnectionReasonType {
        switch reason {
        case .sharedTag: return .tag
        case .sharedCategory: return .category
        case .sharedAuthor: return .author
        case .sharedConcept: return .concept
        case .sharedEntity: return .entity
        case .similarSummary, .manualLink, .unknown: return .similarText
        }
    }

    func memory(id memoryId: String, userId: String) async throws -> NomiMemory? {
        if let memory = memories.first(where: { $0.id == memoryId }) {
            return memory
        }

        guard !userId.isEmpty else { return nil }
        guard let memory = try await memoryService.memory(userId: userId, memoryId: memoryId) else {
            return nil
        }

        if let index = memories.firstIndex(where: { $0.id == memory.id }) {
            memories[index] = memory
        } else {
            memories.insert(memory, at: 0)
        }
        return memory
    }

    private func importLegacyMemoriesIfAvailable(userId: String) async throws {
        let response = try await backendService.importLegacyMemories()
        guard response.imported > 0 else { return }

        memories = try await memoryService.memories(userId: userId)
        successMessage = "Imported \(response.imported) previous memories."
    }

    func create(
        userId: String,
        title: String,
        content: String,
        category: String,
        tags: [String],
        sourceURL: URL?,
        sourceUsername: String? = nil,
        sourceDate: Date? = nil,
        type: String,
        links: [NomiMemoryLink] = [],
        media: [NomiMemoryMedia] = [],
        referencedPosts: [NomiReferencedPost] = [],
        tiktok: TikTokMemoryMetadata? = nil,
        processWithAI: Bool = true
    ) async -> String? {
        do {
            let memoryId = try await memoryService.createMemory(
                userId: userId,
                title: title.trimmedFallback("Untitled memory"),
                content: content.trimmedFallback("No content captured."),
                category: category.trimmedFallback("General"),
                tags: tags,
                sourceURL: sourceURL,
                sourceUsername: sourceUsername,
                sourceDate: sourceDate,
                type: type,
                links: links,
                media: media,
                referencedPosts: referencedPosts,
                tiktok: tiktok
            )
            if processWithAI {
                Task {
                    _ = try? await backendService.processMemoryAI(memoryId: memoryId)
                }
            }
            successMessage = "Memory saved."
            await load(userId: userId)
            return memoryId
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func update(_ memory: NomiMemory) async -> Bool {
        do {
            try await memoryService.updateMemory(memory)
            if let index = memories.firstIndex(where: { $0.id == memory.id }) {
                memories[index] = memory
            }
            successMessage = "Memory updated."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func favoriteMemory(_ memory: NomiMemory) async -> Bool {
        var updated = memory
        updated.isFavorite = true
        return await update(updated)
    }

    func unfavoriteMemory(_ memory: NomiMemory) async -> Bool {
        var updated = memory
        updated.isFavorite = false
        return await update(updated)
    }

    func archiveMemory(_ memory: NomiMemory) async -> Bool {
        var updated = memory
        updated.isArchived = true
        return await update(updated)
    }

    func unarchiveMemory(_ memory: NomiMemory) async -> Bool {
        var updated = memory
        updated.isArchived = false
        return await update(updated)
    }

    func updateMemory(_ memory: NomiMemory, patch: (inout NomiMemory) -> Void) async -> Bool {
        var updated = memory
        patch(&updated)
        return await update(updated)
    }

    func delete(_ memory: NomiMemory) async -> Bool {
        do {
            try await memoryService.deleteMemory(memory)
            memories.removeAll { $0.id == memory.id }
            successMessage = "Memory deleted."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reset() {
        memories = []
        errorMessage = nil
        successMessage = nil
    }
}

private extension String {
    func trimmedFallback(_ fallback: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}
