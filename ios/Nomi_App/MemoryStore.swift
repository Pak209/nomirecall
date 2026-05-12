import Foundation

@MainActor
final class MemoryStore: ObservableObject {
    @Published private(set) var memories: [NomiMemory] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let memoryService = MemoryService()
    private let backendService = XBackendService()
    private var attemptedLegacyImports = Set<String>()

    var categories: [String] {
        Array(Set(memories.map(\.category))).sorted()
    }

    func load(userId: String) async {
        guard !userId.isEmpty else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            memories = try await memoryService.memories(userId: userId)
            if memories.isEmpty && !attemptedLegacyImports.contains(userId) {
                attemptedLegacyImports.insert(userId)
                try await importLegacyMemoriesIfAvailable(userId: userId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
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
        referencedPosts: [NomiReferencedPost] = []
    ) async -> Bool {
        do {
            _ = try await memoryService.createMemory(
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
                referencedPosts: referencedPosts
            )
            successMessage = "Memory saved."
            await load(userId: userId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
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
}

private extension String {
    func trimmedFallback(_ fallback: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}
