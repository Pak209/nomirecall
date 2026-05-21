import Foundation
import FirebaseFirestore
import FirebaseStorage

struct NomiMemory: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let userId: String
    var sourceType: String
    var sourceUrl: URL?
    var sourceId: String?
    var title: String
    var rawText: String
    var cleanText: String?
    var contentHash: String?
    var summary: String?
    var content: String
    var category: String
    var tags: [String]
    var concepts: [String]
    var entities: [String]
    var author: NomiMemoryAuthor?
    var intent: String
    var projectIds: [String]
    var confidenceScore: Double?
    var isArchived: Bool
    var isFavorite: Bool
    var capturedAt: Date
    var createdAt: Date
    var updatedAt: Date?
    var mediaURL: URL?
    var sourceURL: URL?
    var sourceUsername: String?
    var sourceDate: Date?
    var type: String
    var links: [NomiMemoryLink] = []
    var media: [NomiMemoryMedia] = []
    var referencedPosts: [NomiReferencedPost] = []
    var ai: NomiMemoryAI?
    var sync: NomiMemorySync?
}

struct NomiMemoryAuthor: Codable, Equatable, Hashable {
    var id: String?
    var username: String?
    var displayName: String?
    var avatarUrl: URL?
}

struct NomiMemoryAI: Codable, Equatable, Hashable {
    var summary: String?
    var category: String?
    var tags: [String]
    var concepts: [String]
    var entities: [String]
    var claims: [String]
    var actionItems: [String]
    var keyTakeaways: [String]
    var suggestedProjects: [String]
    var importanceScore: Double?
    var modelUsed: String?
    var processedAt: Date?
    var processingVersion: String?
    var processingStatus: String?
    var errorMessage: String?
    var retryCount: Int
}

struct NomiMemorySync: Codable, Equatable, Hashable {
    var provider: String?
    var importStatus: String?
    var importedAt: Date?
    var lastSyncAttemptAt: Date?
    var errorMessage: String?
    var retryCount: Int
    var rawPayloadHash: String?
}

enum NomiMemoryDateRange: String, CaseIterable, Identifiable {
    case today
    case week
    case month
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "Today"
        case .week: return "This week"
        case .month: return "This month"
        case .all: return "All time"
        }
    }
}

enum NomiMemorySortOption: String, CaseIterable, Identifiable {
    case newest
    case oldest
    case updated
    case relevance

    var id: String { rawValue }

    var title: String {
        switch self {
        case .newest: return "Newest first"
        case .oldest: return "Oldest first"
        case .updated: return "Recently updated"
        case .relevance: return "Most relevant"
        }
    }
}

struct NomiMemorySearchOptions: Equatable {
    var query = ""
    var category: String?
    var tag: String?
    var sourceType: String?
    var dateRange: NomiMemoryDateRange = .all
    var favoritesOnly = false
    var archivedOnly = false
    var sortBy: NomiMemorySortOption = .newest
}

struct RelatedMemoryResult: Identifiable, Equatable {
    var id: String { memory.id }
    let memory: NomiMemory
    let score: Int
    let reasons: [String]
    let reasonTypes: [MemoryConnectionReasonType]

    var strength: Double {
        min(Double(score) / 12.0, 1.0)
    }

    var strongestReasonType: MemoryConnectionReasonType {
        reasonTypes.first ?? .similarText
    }
}

enum MemoryConnectionReasonType: String, Codable, CaseIterable, Identifiable, Hashable {
    case concept
    case entity
    case project
    case intent
    case author
    case category
    case tag
    case similarText

    var id: String { rawValue }

    var title: String {
        switch self {
        case .concept: "Concepts"
        case .entity: "Entities"
        case .project: "Project"
        case .intent: "Intent"
        case .author: "Author"
        case .category: "Category"
        case .tag: "Tags"
        case .similarText: "Similar"
        }
    }
}

enum MemoryEdgeReason: String, Codable, CaseIterable {
    case sharedTag = "shared_tag"
    case sharedCategory = "shared_category"
    case sharedAuthor = "shared_author"
    case sharedConcept = "shared_concept"
    case sharedEntity = "shared_entity"
    case similarSummary = "similar_summary"
    case manualLink = "manual_link"
    case unknown
}

struct MemoryEdge: Identifiable, Codable, Equatable, Hashable {
    var id: String
    var userId: String
    var fromMemoryId: String
    var toMemoryId: String
    var reason: MemoryEdgeReason
    var strength: Double
    var explanation: String?
    var reasons: [String] = []
    var reasonTypes: [String] = []
    var score: Double?
    var confidence: String?
    var createdAt: Date
    var updatedAt: Date
}

enum NomiMemorySearch {
    static func filter(_ memories: [NomiMemory], options: NomiMemorySearchOptions) -> [NomiMemory] {
        let query = normalize(options.query)
        let category = normalize(options.category ?? "")
        let tag = normalize(options.tag ?? "")
        let sourceType = normalize(options.sourceType ?? "")
        let now = Date()

        let scored = memories.compactMap { memory -> (memory: NomiMemory, relevance: Int)? in
            if options.archivedOnly {
                guard memory.isArchived else { return nil }
            } else {
                guard !memory.isArchived else { return nil }
            }

            if options.favoritesOnly && !memory.isFavorite { return nil }
            if !category.isEmpty && normalize(memory.category) != category { return nil }
            if !sourceType.isEmpty && normalize(memory.sourceType) != sourceType { return nil }
            if !tag.isEmpty && !memory.tags.map(normalize).contains(tag) { return nil }
            if !matches(date: memory.capturedAt, range: options.dateRange, now: now) { return nil }

            let relevance = relevanceScore(for: memory, query: query)
            if !query.isEmpty && relevance == 0 { return nil }

            return (memory, relevance)
        }

        switch options.sortBy {
        case .newest:
            return scored.sorted { $0.memory.createdAt > $1.memory.createdAt }.map(\.memory)
        case .oldest:
            return scored.sorted { $0.memory.createdAt < $1.memory.createdAt }.map(\.memory)
        case .updated:
            return scored.sorted { ($0.memory.updatedAt ?? $0.memory.createdAt) > ($1.memory.updatedAt ?? $1.memory.createdAt) }.map(\.memory)
        case .relevance:
            return scored.sorted {
                if $0.relevance == $1.relevance {
                    return $0.memory.createdAt > $1.memory.createdAt
                }
                return $0.relevance > $1.relevance
            }.map(\.memory)
        }
    }

    static func relevanceScore(for memory: NomiMemory, query: String) -> Int {
        guard !query.isEmpty else { return 0 }
        let fields = searchableFields(for: memory)
        return fields.reduce(0) { score, field in
            let normalizedField = normalize(field)
            guard normalizedField.contains(query) else { return score }
            if normalize(memory.title) == normalizedField { return score + 5 }
            if memory.tags.map(normalize).contains(normalizedField) { return score + 3 }
            return score + 1
        }
    }

    private static func searchableFields(for memory: NomiMemory) -> [String] {
        [
            memory.title,
            memory.summary ?? "",
            memory.rawText,
            memory.content,
            memory.category,
            memory.author?.username ?? "",
            memory.author?.displayName ?? "",
            memory.sourceUsername ?? ""
        ] + memory.tags + memory.concepts + memory.entities
    }

    private static func matches(date: Date, range: NomiMemoryDateRange, now: Date) -> Bool {
        let calendar = Calendar.current
        switch range {
        case .today:
            return calendar.isDate(date, inSameDayAs: now)
        case .week:
            guard let start = calendar.dateInterval(of: .weekOfYear, for: now)?.start else { return true }
            return date >= start
        case .month:
            guard let start = calendar.dateInterval(of: .month, for: now)?.start else { return true }
            return date >= start
        case .all:
            return true
        }
    }

    static func normalize(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

enum RelatedMemories {
    static let graphMinimumScore = 2
    static let genericTags: Set<String> = [
        "xpost",
        "twitter",
        "x",
        "bookmark",
        "imported",
        "post",
        "link",
        "url",
        "thread",
        "social",
        "general",
    ]

    static func find(for current: NomiMemory, in memories: [NomiMemory], limit: Int = 6) -> [RelatedMemoryResult] {
        candidates(for: current, in: memories, minimumScore: 1, limit: limit)
    }

    static func graphCandidates(for current: NomiMemory, in memories: [NomiMemory], limit: Int = 8) -> [RelatedMemoryResult] {
        candidates(for: current, in: memories, minimumScore: graphMinimumScore, limit: limit)
    }

    private static func candidates(for current: NomiMemory, in memories: [NomiMemory], minimumScore: Int, limit: Int) -> [RelatedMemoryResult] {
        memories
            .filter { $0.id != current.id && !$0.isArchived }
            .compactMap { candidate -> RelatedMemoryResult? in
                let result = score(current, candidate)
                guard result.score >= minimumScore else { return nil }
                return RelatedMemoryResult(memory: candidate, score: result.score, reasons: result.reasons, reasonTypes: result.reasonTypes)
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

    private static func score(_ current: NomiMemory, _ candidate: NomiMemory) -> (score: Int, reasons: [String], reasonTypes: [MemoryConnectionReasonType]) {
        var score = 0
        var reasons: [String] = []
        var reasonTypes: [MemoryConnectionReasonType] = []

        if let concept = firstSharedValue(current.concepts, candidate.concepts) {
            score += 4
            reasons.append("Shared concept: \(concept)")
            reasonTypes.append(.concept)
        }

        if let entity = firstSharedValue(current.entities, candidate.entities) {
            score += 4
            reasons.append("Shared entity: \(entity)")
            reasonTypes.append(.entity)
        }

        if !Set(current.projectIds).intersection(Set(candidate.projectIds)).isEmpty {
            score += 3
            reasons.append("Same project")
            reasonTypes.append(.project)
        }

        if meaningful(current.intent),
           NomiMemorySearch.normalize(current.intent) == NomiMemorySearch.normalize(candidate.intent) {
            score += 3
            reasons.append("Same intent: \(current.intent)")
            reasonTypes.append(.intent)
        }

        if sameAuthor(current, candidate) {
            score += 2
            reasons.append("Same author")
            reasonTypes.append(.author)
        }

        if !current.category.isEmpty,
           NomiMemorySearch.normalize(current.category) != "general",
           NomiMemorySearch.normalize(current.category) == NomiMemorySearch.normalize(candidate.category) {
            score += 2
            reasons.append("Same category: \(current.category)")
            reasonTypes.append(.category)
        }

        if let tag = firstSharedValue(meaningfulTags(current.tags), meaningfulTags(candidate.tags)) {
            score += 1
            reasons.append("Shared tag: \(tag)")
            reasonTypes.append(.tag)
        }

        if hasSimilarText(current, candidate) {
            score += 1
            reasons.append("Similar summary")
            reasonTypes.append(.similarText)
        }

        return (score, Array(reasons.prefix(3)), Array(reasonTypes.prefix(3)))
    }

    private static func firstSharedValue(_ lhs: [String], _ rhs: [String]) -> String? {
        let rhsKeys = Set(rhs.map(NomiMemorySearch.normalize))
        return lhs.first { rhsKeys.contains(NomiMemorySearch.normalize($0)) }
    }

    private static func meaningfulTags(_ tags: [String]) -> [String] {
        tags.filter { tag in
            let normalized = NomiMemorySearch.normalize(tag).replacingOccurrences(of: "#", with: "")
            return !normalized.isEmpty && !genericTags.contains(normalized)
        }
    }

    private static func meaningful(_ value: String) -> Bool {
        let normalized = NomiMemorySearch.normalize(value)
        return !normalized.isEmpty && normalized != "unknown" && normalized != "general"
    }

    private static func sameAuthor(_ lhs: NomiMemory, _ rhs: NomiMemory) -> Bool {
        let lhsAuthor = NomiMemorySearch.normalize(lhs.author?.username ?? lhs.author?.displayName ?? lhs.sourceUsername ?? "")
        let rhsAuthor = NomiMemorySearch.normalize(rhs.author?.username ?? rhs.author?.displayName ?? rhs.sourceUsername ?? "")
        return !lhsAuthor.isEmpty && lhsAuthor == rhsAuthor
    }

    private static func hasSimilarText(_ lhs: NomiMemory, _ rhs: NomiMemory) -> Bool {
        let lhsWords = significantWords(lhs.title + " " + (lhs.summary ?? lhs.content))
        let rhsWords = significantWords(rhs.title + " " + (rhs.summary ?? rhs.content))
        return lhsWords.intersection(rhsWords).count >= 3
    }

    private static func significantWords(_ text: String) -> Set<String> {
        let stopWords: Set<String> = ["the", "and", "for", "with", "that", "this", "from", "into", "your", "about"]
        let words = text
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 3 && !stopWords.contains($0) }
        return Set(words)
    }
}

struct NomiMemoryLink: Identifiable, Codable, Equatable, Hashable {
    var id: String { url?.absoluteString ?? displayUrl ?? title ?? "link" }
    var url: URL?
    var displayUrl: String?
    var title: String?
}

struct NomiMemoryMedia: Identifiable, Codable, Equatable, Hashable {
    var id: String { url?.absoluteString ?? previewImageUrl?.absoluteString ?? altText ?? type }
    var type: String
    var url: URL?
    var previewImageUrl: URL?
    var altText: String?
    var width: Int?
    var height: Int?
    var variants: [NomiMemoryMediaVariant] = []

    var bestDisplayURL: URL? {
        if type == "photo" { return url ?? previewImageUrl }
        return previewImageUrl ?? url ?? variants.first?.url
    }

    var bestVideoURL: URL? {
        variants
            .filter { ($0.contentType ?? "").contains("mp4") }
            .sorted { ($0.bitRate ?? 0) > ($1.bitRate ?? 0) }
            .first?.url
    }
}

struct NomiMemoryMediaVariant: Codable, Equatable, Hashable {
    var url: URL
    var contentType: String?
    var bitRate: Int?
}

struct NomiReferencedPost: Identifiable, Codable, Equatable, Hashable {
    var id: String
    var referenceType: String?
    var username: String?
    var url: URL?
    var text: String?
    var postDate: Date?
    var links: [NomiMemoryLink] = []
    var media: [NomiMemoryMedia] = []
}

final class MemoryService {
    private let database = Firestore.firestore()
    private let storage = Storage.storage()

    func createMemory(
        userId: String,
        title: String,
        content: String,
        category: String,
        tags: [String] = [],
        sourceURL: URL? = nil,
        sourceUsername: String? = nil,
        sourceDate: Date? = nil,
        type: String = "note",
        links: [NomiMemoryLink] = [],
        media: [NomiMemoryMedia] = [],
        referencedPosts: [NomiReferencedPost] = []
    ) async throws -> String {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let document = database
            .collection("users")
            .document(userId)
            .collection("memories")
            .document()

        var data: [String: Any] = [
            "id": document.documentID,
            "userId": userId,
            "sourceType": Self.memorySourceType(for: type),
            "title": title,
            "rawText": content,
            "summary": String(content.prefix(240)),
            "content": content,
            "category": category,
            "tags": tags,
            "concepts": [],
            "entities": [],
            "intent": "unknown",
            "projectIds": [],
            "isArchived": false,
            "isFavorite": false,
            "capturedAt": sourceDate.map(Timestamp.init(date:)) ?? FieldValue.serverTimestamp(),
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
            "type": type,
            "links": Self.linkDictionaries(links),
            "media": Self.mediaDictionaries(media),
            "referencedPosts": Self.referencedPostDictionaries(referencedPosts),
            "sync": [
                "provider": "manual",
                "importStatus": "imported",
                "retryCount": 0
            ]
        ]

        if let sourceURL {
            data["sourceUrl"] = sourceURL.absoluteString
            data["sourceURL"] = sourceURL.absoluteString
        }

        if let sourceUsername {
            data["sourceUsername"] = sourceUsername
        }

        if let sourceDate {
            data["sourceDate"] = Timestamp(date: sourceDate)
        }

        try await document.setData(data)

        return document.documentID
    }

    func memories(userId: String, limit: Int = 50) async throws -> [NomiMemory] {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let snapshot = try await memoriesReference(userId: userId)
            .order(by: "createdAt", descending: true)
            .limit(to: limit)
            .getDocuments()

        return snapshot.documents.compactMap { Self.memory(from: $0) }
    }

    func memory(userId: String, memoryId: String) async throws -> NomiMemory? {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let document = try await memoriesReference(userId: userId)
            .document(memoryId)
            .getDocument()

        guard document.exists else { return nil }
        return Self.memory(from: document)
    }

    func updateMemory(_ memory: NomiMemory) async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        var data: [String: Any] = [
            "title": memory.title,
            "rawText": memory.rawText.isEmpty ? memory.content : memory.rawText,
            "summary": memory.summary ?? String(memory.content.prefix(240)),
            "content": memory.content,
            "category": memory.category,
            "tags": memory.tags,
            "concepts": memory.concepts,
            "entities": memory.entities,
            "intent": memory.intent,
            "projectIds": memory.projectIds,
            "isArchived": memory.isArchived,
            "isFavorite": memory.isFavorite,
            "type": memory.type,
            "sourceType": memory.sourceType,
            "links": Self.linkDictionaries(memory.links),
            "media": Self.mediaDictionaries(memory.media),
            "referencedPosts": Self.referencedPostDictionaries(memory.referencedPosts),
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if let mediaURL = memory.mediaURL {
            data["mediaURL"] = mediaURL.absoluteString
        }

        if let sourceURL = memory.sourceURL {
            data["sourceURL"] = sourceURL.absoluteString
            data["sourceUrl"] = sourceURL.absoluteString
        } else if let sourceUrl = memory.sourceUrl {
            data["sourceUrl"] = sourceUrl.absoluteString
        }

        if let sourceUsername = memory.sourceUsername {
            data["sourceUsername"] = sourceUsername
        }

        if let sourceDate = memory.sourceDate {
            data["sourceDate"] = Timestamp(date: sourceDate)
        }

        try await memoriesReference(userId: memory.userId)
            .document(memory.id)
            .setData(data, merge: true)
    }

    func deleteMemory(_ memory: NomiMemory) async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        try await memoriesReference(userId: memory.userId)
            .document(memory.id)
            .delete()
    }

    func createOrUpdateMemoryEdge(userId: String, edge: MemoryEdge) async throws {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        var data: [String: Any] = [
            "id": edge.id,
            "userId": userId,
            "fromMemoryId": edge.fromMemoryId,
            "toMemoryId": edge.toMemoryId,
            "reason": edge.reason.rawValue,
            "strength": min(max(edge.strength, 0), 1),
            "createdAt": Timestamp(date: edge.createdAt),
            "updatedAt": Timestamp(date: edge.updatedAt)
        ]

        if let explanation = edge.explanation {
            data["explanation"] = explanation
        }

        try await database
            .collection("users")
            .document(userId)
            .collection("memoryEdges")
            .document(edge.id)
            .setData(data, merge: true)
    }

    func memoryEdges(userId: String) async throws -> [MemoryEdge] {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let snapshot = try await database
            .collection("users")
            .document(userId)
            .collection("memoryEdges")
            .order(by: "updatedAt", descending: true)
            .limit(to: 300)
            .getDocuments()

        return snapshot.documents.compactMap(Self.memoryEdge)
    }

    func uploadMedia(userId: String, memoryId: String, data: Data, fileExtension: String) async throws -> URL {
        guard FirebaseAppReady.isConfigured else { throw AuthServiceError.firebaseNotConfigured }

        let reference = storage.reference()
            .child("users")
            .child(userId)
            .child("memories")
            .child(memoryId)
            .child("media.\(fileExtension)")

        _ = try await reference.putDataAsync(data)
        return try await reference.downloadURL()
    }

    private func memoriesReference(userId: String) -> CollectionReference {
        database
            .collection("users")
            .document(userId)
            .collection("memories")
    }

    private static func memoryEdge(from document: DocumentSnapshot) -> MemoryEdge? {
        guard let data = document.data() else { return nil }
        let id = data["edgeId"] as? String ?? data["id"] as? String ?? document.documentID
        guard
            let fromMemoryId = data["fromMemoryId"] as? String,
            let toMemoryId = data["toMemoryId"] as? String
        else { return nil }

        let score = data["score"] as? Double ?? data["strength"] as? Double
        let reasonTypes = data["reasonTypes"] as? [String] ?? []
        let reasons = data["reasons"] as? [String] ?? []
        let fallbackReason = MemoryEdgeReason(rawValue: data["reason"] as? String ?? "") ?? .unknown
        let reason = reason(from: reasonTypes) ?? fallbackReason
        let createdAt = (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
        let updatedAt = (data["updatedAt"] as? Timestamp)?.dateValue()
            ?? (data["lastRecomputedAt"] as? Timestamp)?.dateValue()
            ?? createdAt

        return MemoryEdge(
            id: id,
            userId: data["userId"] as? String ?? "",
            fromMemoryId: fromMemoryId,
            toMemoryId: toMemoryId,
            reason: reason,
            strength: min(max(data["strength"] as? Double ?? score ?? 0, 0), 1),
            explanation: data["explanation"] as? String ?? reasons.first,
            reasons: reasons,
            reasonTypes: reasonTypes,
            score: score,
            confidence: data["confidence"] as? String,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private static func reason(from reasonTypes: [String]) -> MemoryEdgeReason? {
        if reasonTypes.contains("shared_tags") { return .sharedTag }
        if reasonTypes.contains("same_category") { return .sharedCategory }
        if reasonTypes.contains("shared_concepts") { return .sharedConcept }
        if reasonTypes.contains("shared_entities") { return .sharedEntity }
        if reasonTypes.contains("semantic_similarity") { return .similarSummary }
        return nil
    }

    private static func memory(from document: DocumentSnapshot) -> NomiMemory? {
        guard let data = document.data() else { return nil }
        let userId = data["userId"] as? String ?? ""
        let title = data["title"] as? String ?? "Untitled memory"
        let rawText = data["rawText"] as? String ?? data["content"] as? String ?? ""
        let cleanText = data["cleanText"] as? String
        let contentHash = data["contentHash"] as? String
        let content = data["content"] as? String ?? rawText
        let summary = data["summary"] as? String
        let category = data["category"] as? String ?? "General"
        let tags = data["tags"] as? [String] ?? []
        let concepts = data["concepts"] as? [String] ?? []
        let entities = data["entities"] as? [String] ?? []
        let createdAt = (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
        let updatedAt = (data["updatedAt"] as? Timestamp)?.dateValue() ?? date(from: data["updatedAt"])
        let capturedAt = (data["capturedAt"] as? Timestamp)?.dateValue()
            ?? date(from: data["capturedAt"])
            ?? (data["sourceDate"] as? Timestamp)?.dateValue()
            ?? createdAt
        let mediaURL = (data["mediaURL"] as? String).flatMap(URL.init(string:))
        let sourceUrl = stringURL(data["sourceUrl"] ?? data["sourceURL"])
        let sourceURL = stringURL(data["sourceURL"] ?? data["sourceUrl"])
        let author = author(from: data["author"])
        let sourceUsername = data["sourceUsername"] as? String ?? author?.username
        let sourceDate = (data["sourceDate"] as? Timestamp)?.dateValue()
        let type = data["type"] as? String ?? "note"
        let sourceType = data["sourceType"] as? String ?? memorySourceType(for: type)
        let sourceId = data["sourceId"] as? String ?? data["externalId"] as? String
        let links = links(from: data["links"])
        let media = media(from: data["media"])
        let referencedPosts = referencedPosts(from: data["referencedPosts"])
        let ai = ai(from: data["ai"])
        let sync = sync(from: data["sync"])

        return NomiMemory(
            id: document.documentID,
            userId: userId,
            sourceType: sourceType,
            sourceUrl: sourceUrl,
            sourceId: sourceId,
            title: title,
            rawText: rawText,
            cleanText: cleanText,
            contentHash: contentHash,
            summary: summary,
            content: content,
            category: category,
            tags: tags,
            concepts: concepts,
            entities: entities,
            author: author,
            intent: data["intent"] as? String ?? "unknown",
            projectIds: data["projectIds"] as? [String] ?? [],
            confidenceScore: data["confidenceScore"] as? Double,
            isArchived: data["isArchived"] as? Bool ?? false,
            isFavorite: data["isFavorite"] as? Bool ?? false,
            capturedAt: capturedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            mediaURL: mediaURL,
            sourceURL: sourceURL,
            sourceUsername: sourceUsername,
            sourceDate: sourceDate,
            type: type,
            links: links,
            media: media,
            referencedPosts: referencedPosts,
            ai: ai,
            sync: sync
        )
    }

    private static func linkDictionaries(_ links: [NomiMemoryLink]) -> [[String: Any]] {
        links.map {
            clean([
                "url": $0.url?.absoluteString,
                "displayUrl": $0.displayUrl,
                "title": $0.title
            ])
        }
    }

    private static func mediaDictionaries(_ media: [NomiMemoryMedia]) -> [[String: Any]] {
        media.map {
            clean([
                "type": $0.type,
                "url": $0.url?.absoluteString,
                "previewImageUrl": $0.previewImageUrl?.absoluteString,
                "altText": $0.altText,
                "width": $0.width,
                "height": $0.height,
                "variants": $0.variants.map { variant in
                    clean([
                        "url": variant.url.absoluteString,
                        "contentType": variant.contentType,
                        "bitRate": variant.bitRate
                    ])
                }
            ])
        }
    }

    private static func referencedPostDictionaries(_ posts: [NomiReferencedPost]) -> [[String: Any]] {
        posts.map {
            clean([
                "id": $0.id,
                "referenceType": $0.referenceType,
                "username": $0.username,
                "url": $0.url?.absoluteString,
                "text": $0.text,
                "postDate": $0.postDate.map(Timestamp.init(date:)),
                "links": linkDictionaries($0.links),
                "media": mediaDictionaries($0.media)
            ])
        }
    }

    private static func links(from value: Any?) -> [NomiMemoryLink] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.map {
            NomiMemoryLink(
                url: stringURL($0["url"]),
                displayUrl: $0["displayUrl"] as? String ?? $0["display_url"] as? String,
                title: $0["title"] as? String
            )
        }
    }

    private static func media(from value: Any?) -> [NomiMemoryMedia] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.map {
            NomiMemoryMedia(
                type: $0["type"] as? String ?? "media",
                url: stringURL($0["url"]),
                previewImageUrl: stringURL($0["previewImageUrl"] ?? $0["preview_image_url"]),
                altText: $0["altText"] as? String ?? $0["alt_text"] as? String,
                width: $0["width"] as? Int,
                height: $0["height"] as? Int,
                variants: mediaVariants(from: $0["variants"])
            )
        }
    }

    private static func mediaVariants(from value: Any?) -> [NomiMemoryMediaVariant] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.compactMap {
            guard let url = stringURL($0["url"]) else { return nil }
            return NomiMemoryMediaVariant(
                url: url,
                contentType: $0["contentType"] as? String ?? $0["content_type"] as? String,
                bitRate: $0["bitRate"] as? Int ?? $0["bit_rate"] as? Int
            )
        }
    }

    private static func referencedPosts(from value: Any?) -> [NomiReferencedPost] {
        guard let rows = value as? [[String: Any]] else { return [] }
        return rows.compactMap {
            guard let id = $0["id"] as? String else { return nil }
            return NomiReferencedPost(
                id: id,
                referenceType: $0["referenceType"] as? String ?? $0["reference_type"] as? String,
                username: $0["username"] as? String,
                url: stringURL($0["url"]),
                text: $0["text"] as? String,
                postDate: ($0["postDate"] as? Timestamp)?.dateValue() ?? date(from: $0["postDate"]),
                links: links(from: $0["links"]),
                media: media(from: $0["media"])
            )
        }
    }

    private static func author(from value: Any?) -> NomiMemoryAuthor? {
        guard let row = value as? [String: Any] else { return nil }
        let author = NomiMemoryAuthor(
            id: row["id"] as? String,
            username: row["username"] as? String,
            displayName: row["displayName"] as? String,
            avatarUrl: stringURL(row["avatarUrl"])
        )
        return author.id == nil && author.username == nil && author.displayName == nil && author.avatarUrl == nil ? nil : author
    }

    private static func ai(from value: Any?) -> NomiMemoryAI? {
        guard let row = value as? [String: Any] else { return nil }
        return NomiMemoryAI(
            summary: row["summary"] as? String,
            category: row["category"] as? String,
            tags: row["tags"] as? [String] ?? [],
            concepts: row["concepts"] as? [String] ?? [],
            entities: row["entities"] as? [String] ?? [],
            claims: row["claims"] as? [String] ?? [],
            actionItems: row["actionItems"] as? [String] ?? [],
            keyTakeaways: row["keyTakeaways"] as? [String] ?? [],
            suggestedProjects: row["suggestedProjects"] as? [String] ?? [],
            importanceScore: row["importanceScore"] as? Double,
            modelUsed: row["modelUsed"] as? String,
            processedAt: (row["processedAt"] as? Timestamp)?.dateValue() ?? date(from: row["processedAt"]),
            processingVersion: row["processingVersion"] as? String,
            processingStatus: row["processingStatus"] as? String,
            errorMessage: row["errorMessage"] as? String,
            retryCount: row["retryCount"] as? Int ?? 0
        )
    }

    private static func sync(from value: Any?) -> NomiMemorySync? {
        guard let row = value as? [String: Any] else { return nil }
        return NomiMemorySync(
            provider: row["provider"] as? String,
            importStatus: row["importStatus"] as? String,
            importedAt: (row["importedAt"] as? Timestamp)?.dateValue() ?? date(from: row["importedAt"]),
            lastSyncAttemptAt: (row["lastSyncAttemptAt"] as? Timestamp)?.dateValue() ?? date(from: row["lastSyncAttemptAt"]),
            errorMessage: row["errorMessage"] as? String,
            retryCount: row["retryCount"] as? Int ?? 0,
            rawPayloadHash: row["rawPayloadHash"] as? String
        )
    }

    private static func clean(_ dictionary: [String: Any?]) -> [String: Any] {
        dictionary.compactMapValues { $0 }
    }

    private static func memorySourceType(for type: String) -> String {
        switch type.lowercased() {
        case "tweet":
            return "x_bookmark"
        case "text", "note":
            return "manual_note"
        case "url", "rss":
            return "link"
        case "image":
            return "image"
        case "voice":
            return "voice"
        default:
            return "unknown"
        }
    }

    private static func stringURL(_ value: Any?) -> URL? {
        guard let string = value as? String else { return nil }
        return URL(string: string)
    }

    private static func date(from value: Any?) -> Date? {
        guard let string = value as? String else { return nil }
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let standardFormatter = ISO8601DateFormatter()
        standardFormatter.formatOptions = [.withInternetDateTime]
        return fractionalFormatter.date(from: string) ?? standardFormatter.date(from: string)
    }
}
