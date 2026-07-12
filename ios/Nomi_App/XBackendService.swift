import Foundation
import FirebaseAuth

enum BackendServiceError: LocalizedError {
    case notSignedIn
    case invalidResponse
    case network(String)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn:
            return "Sign in before using X import."
        case .invalidResponse:
            return "The backend returned an unexpected response."
        case .network(let message):
            return message
        case .server(let message):
            return message
        }
    }
}

struct XPostPreviewResponse: Decodable {
    let needsApiKey: Bool?
    let post: XPostPreview?
    let message: String?
}

struct XPostPreview: Decodable {
    let id: String
    let username: String?
    let url: URL?
    let text: String?
    let postDate: Date?
    let category: String?
    let tags: [String]?
    let links: [XLink]?
    let media: [XMedia]?
    let referencedPosts: [XReferencedPost]?
    let title: String?
}

struct TikTokPreviewResponse: Decodable {
    let tiktok: TikTokPreview
    let unavailable: Bool?
    let message: String?
}

struct TikTokPreview: Decodable, Equatable, Hashable {
    let source: String?
    let sourceType: String?
    let originalUrl: URL?
    let canonicalUrl: URL?
    let platformVideoId: String?
    let title: String?
    let authorName: String?
    let authorUrl: URL?
    let thumbnailUrl: URL?
    let providerName: String?
    let providerUrl: URL?
    let embedHtml: String?
    let playerUrl: URL?
    let transcriptStatus: String?
    let category: String?
    let tags: [String]?
    let memoryText: String?
    let unavailable: Bool?

    enum CodingKeys: String, CodingKey {
        case source
        case sourceType
        case originalUrl
        case canonicalUrl
        case platformVideoId
        case title
        case authorName = "author_name"
        case authorUrl = "author_url"
        case thumbnailUrl = "thumbnail_url"
        case providerName = "provider_name"
        case providerUrl = "provider_url"
        case embedHtml
        case playerUrl
        case transcriptStatus
        case category
        case tags
        case memoryText
        case unavailable
    }
}

struct XDiscoverResponse: Decodable {
    let items: [XDiscoverItem]
    let nextCursor: String?
    let needsApiKey: Bool?
    let errors: [XDiscoverError]?

    enum CodingKeys: String, CodingKey {
        case items
        case nextCursor = "next_cursor"
        case needsApiKey
        case errors
    }
}

struct LegacyMemoryImportResponse: Decodable {
    let imported: Int
    let skipped: Int?
    let message: String?
}

struct XBookmarkConnectResponse: Decodable {
    let configured: Bool
    let authorizationUrl: URL?
    let scopes: [String]?
}

struct XBookmarkStatusResponse: Decodable {
    let connected: Bool
    let username: String?
    let xUserId: String?
    let connectedAt: Date?
    let lastSyncedAt: Date?
    let lastSuccessfulSyncAt: Date?
    let lastFailedSyncAt: Date?
    let lastScheduledSyncAt: Date?
    let lastManualSyncAt: Date?
    let lastImportedCount: Int?
    let lastDuplicateCount: Int?
    let lastFailedCount: Int?
    let lastSyncStatus: String?
    let lastSyncError: String?
    let lastResult: String?
    let importedCount: Int?
    let skippedDuplicateCount: Int?
    let failedCount: Int?
    let nextEligibleSyncAt: Date?
    let dailySyncEnabled: Bool?
    let syncInProgress: Bool?
    let totalImported: Int?
    let totalFailed: Int?
    let aiUsage: AIUsageMetadata?
}

struct XBookmarkSyncResponse: Decodable {
    let ok: Bool
    let status: String?
    let imported: Int
    let skipped: Int
    let checked: Int
    let importedCount: Int?
    let duplicateCount: Int?
    let failedCount: Int?
    let aiProcessedCount: Int?
    let aiSkippedCount: Int?
    let aiFailedCount: Int?
    let aiLimitReached: Bool?
    let aiUsage: AIUsageMetadata?
    let errors: [String]?
}

private struct DailySyncUpdateResponse: Decodable {
    let ok: Bool
    let dailySyncEnabled: Bool
}

struct MemoryAIProcessResponse: Decodable {
    let status: String
    let memoryId: String
    let error: String?
    let tier: String?
    let limit: Int?
    let used: Int?
    let remaining: Int?
    let resetDateKey: String?
}

struct MemoryAIBatchProcessResponse: Decodable {
    let processedCount: Int
    let skippedCount: Int
    let failedCount: Int
    let limitReached: Bool?
    let errors: [String]
    let usage: AIUsageMetadata?
}

struct DailyBriefResponse: Decodable {
    let brief: NomiDailyBrief
}

struct DailyBriefListResponse: Decodable {
    let briefs: [NomiDailyBrief]
}

struct NomiDailyBrief: Identifiable, Decodable, Hashable {
    let id: String
    let dateKey: String
    let timezone: String?
    let memoryIds: [String]
    let title: String
    let overview: String
    let savedCount: Int
    let mainThemes: [NomiBriefTheme]
    let bestSaves: [NomiBriefMemoryRef]
    let actionableIdeas: [NomiBriefActionIdea]
    let connectedOlderMemories: [NomiBriefMemoryRef]
    let suggestedFollowUps: [String]
    let suggestedProjectLinks: [NomiBriefProjectLink]?
    let status: String?
    let generatedAt: Date?
    let memoryCount: Int?
    let usedAi: Bool?
    let errorMessage: String?
}

struct NomiBriefTheme: Decodable, Hashable {
    let name: String
    let summary: String?
    let memoryIds: [String]?
}

struct NomiBriefMemoryRef: Decodable, Hashable {
    let memoryId: String
    let title: String?
    let reason: String
}

struct NomiBriefActionIdea: Decodable, Hashable {
    let text: String
    let memoryIds: [String]?
    let priority: String?
}

struct NomiBriefProjectLink: Decodable, Hashable {
    let projectId: String?
    let projectName: String?
    let reason: String
    let memoryIds: [String]?
}

struct ProjectResponse: Decodable {
    let project: NomiProject
}

struct ProjectListResponse: Decodable {
    let projects: [NomiProject]
}

struct ProjectMemoryListResponse: Decodable {
    let memories: [NomiProjectMemory]
}

struct ProjectSuggestionsResponse: Decodable {
    let suggestions: [NomiProjectMemorySuggestion]
}

struct NomiProject: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let description: String?
    let status: String
    let color: String?
    let icon: String?
    let memoryIds: [String]?
    let tags: [String]?
    let concepts: [String]?
    let summary: String?
    let ai: NomiProjectAI?
}

struct NomiProjectAI: Decodable, Hashable {
    let summary: String?
    let mainThemes: [String]?
    let openQuestions: [String]?
    let nextActions: [String]?
    let relatedMemoryIds: [String]?
    let suggestedMemoryIds: [String]?
    let status: String?
    let errorMessage: String?
}

struct NomiProjectMemory: Identifiable, Decodable, Hashable {
    let id: String
    let title: String?
    let summary: String?
    let category: String?
    let tags: [String]?
    let concepts: [String]?
    let entities: [String]?
}

struct NomiProjectMemorySuggestion: Identifiable, Decodable, Hashable {
    var id: String { memory.id }
    let memory: NomiProjectMemory
    let score: Int
    let reasons: [String]
}

private struct DailyBriefGenerateRequest: Encodable {
    let timezone: String
    let forceRegenerate: Bool
}

private struct ProjectCreateRequest: Encodable {
    let name: String
    let description: String?
    let tags: [String]
    let concepts: [String]
}

private struct ProjectUpdateRequest: Encodable {
    let name: String?
    let description: String?
    let status: String?
    let tags: [String]?
    let concepts: [String]?
}

private struct ProjectMemoryRequest: Encodable {
    let memoryId: String
}

private struct ProjectSummaryRequest: Encodable {
    let forceRegenerate: Bool
}

struct AIUsageMetadata: Decodable, Hashable {
    let tier: String
    let limit: Int
    let usedBefore: Int?
    let usedAfter: Int?
    let used: Int?
    let remainingBefore: Int?
    let remainingAfter: Int?
    let remaining: Int?
    let dateKey: String
    let processedCount: Int?
    let briefGeneratedCount: Int?
    let projectSummaryCount: Int?
    let failedCount: Int?
    let skippedCount: Int?
    let limitsDisabled: Bool?
}

private struct DailySyncUpdateRequest: Encodable {
    let enabled: Bool
}

private struct XBookmarkSyncRequest: Encodable {
    let limit: Int
    let processWithAI: Bool
}

private struct MemoryAIProcessRequest: Encodable {
    let forceReprocess: Bool
}

private struct MemoryAIBatchProcessRequest: Encodable {
    let limit: Int
    let forceReprocess: Bool
}

private struct BrainQueryRequest: Encodable {
    let question: String
    let projectId: String?
    let limit: Int?
    let allowGlobalFallback: Bool?
}

struct BrainQueryResponse: Decodable, Hashable {
    let answer: String
    let sources: [BrainQuerySource]
    let confidence: String
    let retrievalMode: String
    let scope: BrainQueryScope?

    enum CodingKeys: String, CodingKey {
        case answer
        case sources
        case confidence
        case retrievalMode
        case scope
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        answer = try container.decode(String.self, forKey: .answer)
        sources = (try? container.decode([BrainQuerySource].self, forKey: .sources)) ?? []
        confidence = (try? container.decode(String.self, forKey: .confidence)) ?? "low"
        retrievalMode = (try? container.decode(String.self, forKey: .retrievalMode)) ?? "keyword-semantic-lite"
        scope = try? container.decode(BrainQueryScope.self, forKey: .scope)
    }
}

struct BrainQueryScope: Decodable, Hashable {
    let type: String
    let projectId: String?
    let projectTitle: String?
}

struct BrainQuerySource: Identifiable, Decodable, Hashable {
    var id: String { memoryId }
    let memoryId: String
    let title: String
    let snippet: String
    let sourceUrl: URL?
    let createdAt: Date?
    let capturedAt: Date?
    let relevanceReason: String?

    enum CodingKeys: String, CodingKey {
        case memoryId
        case title
        case snippet
        case sourceUrl
        case createdAt
        case capturedAt
        case relevanceReason
    }

    init(from decoder: Decoder) throws {
        if let single = try? decoder.singleValueContainer(),
           let memoryId = try? single.decode(String.self) {
            self.memoryId = memoryId
            title = "Saved memory"
            snippet = ""
            sourceUrl = nil
            createdAt = nil
            capturedAt = nil
            relevanceReason = nil
            return
        }

        let container = try decoder.container(keyedBy: CodingKeys.self)
        memoryId = try container.decode(String.self, forKey: .memoryId)
        title = (try? container.decode(String.self, forKey: .title)) ?? "Saved memory"
        snippet = (try? container.decode(String.self, forKey: .snippet)) ?? ""
        sourceUrl = try? container.decode(URL.self, forKey: .sourceUrl)
        createdAt = try? container.decode(Date.self, forKey: .createdAt)
        capturedAt = try? container.decode(Date.self, forKey: .capturedAt)
        relevanceReason = try? container.decode(String.self, forKey: .relevanceReason)
    }
}

struct XDiscoverItem: Identifiable, Decodable {
    let id: String
    let title: String
    let summary: String?
    let sourceType: String?
    let sourceName: String?
    let url: URL?
    let topic: String?
    let publishedAt: Date?
    let body: String?
    let category: String?
    let tags: [String]?
    let authorUsername: String?
    let postDate: Date?
    let links: [XLink]?
    let media: [XMedia]?
    let referencedPosts: [XReferencedPost]?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case summary
        case sourceType = "source_type"
        case sourceName = "source_name"
        case url
        case topic
        case publishedAt = "published_at"
        case body
        case category
        case tags
        case authorUsername
        case postDate
        case links
        case media
        case referencedPosts
    }
}

struct XLink: Decodable, Hashable {
    let url: URL?
    let displayUrl: String?
    let title: String?
}

struct XMedia: Decodable, Hashable {
    let type: String
    let url: URL?
    let previewImageUrl: URL?
    let altText: String?
    let width: Int?
    let height: Int?
    let variants: [XMediaVariant]?
}

struct XMediaVariant: Decodable, Hashable {
    let url: URL
    let contentType: String?
    let bitRate: Int?
}

struct XReferencedPost: Decodable, Hashable {
    let id: String
    let referenceType: String?
    let username: String?
    let url: URL?
    let text: String?
    let postDate: Date?
    let links: [XLink]?
    let media: [XMedia]?
}

struct XDiscoverError: Decodable, Hashable {
    let status: Int?
    let message: String
}

final class XBackendService {
    private let baseURL: URL
    private let urlSession: URLSession

    init(baseURL: URL = BackendConfig.apiBaseURL, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
    }

    func previewPost(url: String) async throws -> XPostPreviewResponse {
        var request = try await authorizedRequest(path: "x-post/preview")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["url": url])
        return try await send(request)
    }

    func previewTikTok(url: String) async throws -> TikTokPreviewResponse {
        var request = try await authorizedRequest(path: "tiktok/preview")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["url": url])
        return try await send(request)
    }

    func discover(topics: [String], limit: Int = 20) async throws -> XDiscoverResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("x/discover"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "topics", value: topics.joined(separator: ",")),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        guard let url = components?.url else { throw BackendServiceError.invalidResponse }

        var request = try await authorizedRequest(url: url)
        request.httpMethod = "GET"
        return try await send(request)
    }

    func importLegacyMemories() async throws -> LegacyMemoryImportResponse {
        var request = try await authorizedRequest(path: "memories/import-legacy")
        request.httpMethod = "POST"
        return try await send(request)
    }

    func connectXBookmarks() async throws -> XBookmarkConnectResponse {
        var request = try await authorizedRequest(path: "x/bookmarks/connect")
        request.httpMethod = "GET"
        return try await send(request)
    }

    func xBookmarkStatus() async throws -> XBookmarkStatusResponse {
        var request = try await authorizedRequest(path: "x/bookmarks/status")
        request.httpMethod = "GET"
        return try await send(request)
    }

    func getAiUsageStatus() async throws -> AIUsageMetadata {
        var request = try await authorizedRequest(path: "ai/usage")
        request.httpMethod = "GET"
        return try await send(request)
    }

    func updateDailySyncEnabled(_ enabled: Bool) async throws -> XBookmarkStatusResponse {
        var request = try await authorizedRequest(path: "x/bookmarks/daily-sync")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(DailySyncUpdateRequest(enabled: enabled))
        let _: DailySyncUpdateResponse = try await send(request)
        return try await xBookmarkStatus()
    }

    func syncXBookmarks(limit: Int = 25, processWithAI: Bool = false) async throws -> XBookmarkSyncResponse {
        var request = try await authorizedRequest(path: "x/bookmarks/sync")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(XBookmarkSyncRequest(limit: limit, processWithAI: processWithAI))
        return try await send(request)
    }

    func runManualBookmarkSync(processWithAI: Bool) async throws -> XBookmarkSyncResponse {
        try await syncXBookmarks(limit: 25, processWithAI: processWithAI)
    }

    func processMemoryAI(memoryId: String, forceReprocess: Bool = false) async throws -> MemoryAIProcessResponse {
        var request = try await authorizedRequest(path: "memories/\(memoryId)/process-ai")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(MemoryAIProcessRequest(forceReprocess: forceReprocess))
        return try await send(request)
    }

    func processUnprocessedMemories(limit: Int = 20, forceReprocess: Bool = false) async throws -> MemoryAIBatchProcessResponse {
        var request = try await authorizedRequest(path: "memories/process-unprocessed")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(MemoryAIBatchProcessRequest(limit: limit, forceReprocess: forceReprocess))
        return try await send(request)
    }

    func processRecentMemories(limit: Int = 20, forceReprocess: Bool = false) async throws -> MemoryAIBatchProcessResponse {
        var request = try await authorizedRequest(path: "memories/process-recent")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(MemoryAIBatchProcessRequest(limit: limit, forceReprocess: forceReprocess))
        return try await send(request)
    }

    func askMemories(question: String, projectId: String? = nil, limit: Int? = 12, allowGlobalFallback: Bool? = nil) async throws -> BrainQueryResponse {
        var request = try await authorizedRequest(path: "brain/query")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(BrainQueryRequest(
            question: question,
            projectId: projectId,
            limit: limit,
            allowGlobalFallback: allowGlobalFallback
        ))
        return try await send(request)
    }

    func todayBrief(timezone: String = TimeZone.current.identifier, forceRegenerate: Bool = false) async throws -> NomiDailyBrief {
        var components = URLComponents(url: baseURL.appendingPathComponent("daily-briefs/today"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "timezone", value: timezone),
            URLQueryItem(name: "forceRegenerate", value: forceRegenerate ? "true" : "false")
        ]
        guard let url = components?.url else { throw BackendServiceError.invalidResponse }
        var request = try await authorizedRequest(url: url)
        request.httpMethod = "GET"
        let response: DailyBriefResponse = try await send(request)
        return response.brief
    }

    func generateTodayBrief(force: Bool = false) async throws -> NomiDailyBrief {
        var request = try await authorizedRequest(path: "daily-briefs/generate-today")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(DailyBriefGenerateRequest(timezone: TimeZone.current.identifier, forceRegenerate: force))
        let response: DailyBriefResponse = try await send(request)
        return response.brief
    }

    func getTodayBrief() async throws -> NomiDailyBrief {
        try await todayBrief()
    }

    func generateDailyBrief(dateKey: String, timezone: String = TimeZone.current.identifier, forceRegenerate: Bool = false) async throws -> NomiDailyBrief {
        var request = try await authorizedRequest(path: "daily-briefs/\(dateKey)/generate")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(DailyBriefGenerateRequest(timezone: timezone, forceRegenerate: forceRegenerate))
        let response: DailyBriefResponse = try await send(request)
        return response.brief
    }

    func listProjects(includeArchived: Bool = false) async throws -> [NomiProject] {
        var components = URLComponents(url: baseURL.appendingPathComponent("projects"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "includeArchived", value: includeArchived ? "true" : "false")]
        guard let url = components?.url else { throw BackendServiceError.invalidResponse }
        var request = try await authorizedRequest(url: url)
        request.httpMethod = "GET"
        let response: ProjectListResponse = try await send(request)
        return response.projects
    }

    func getProjects() async throws -> [NomiProject] {
        try await listProjects()
    }

    func createProject(name: String, description: String?, tags: [String], concepts: [String]) async throws -> NomiProject {
        var request = try await authorizedRequest(path: "projects")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ProjectCreateRequest(name: name, description: description, tags: tags, concepts: concepts))
        let response: ProjectResponse = try await send(request)
        return response.project
    }

    func updateProject(_ project: NomiProject, name: String?, description: String?, status: String?, tags: [String]?, concepts: [String]?) async throws -> NomiProject {
        var request = try await authorizedRequest(path: "projects/\(project.id)")
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ProjectUpdateRequest(name: name, description: description, status: status, tags: tags, concepts: concepts))
        let response: ProjectResponse = try await send(request)
        return response.project
    }

    func archiveProject(_ project: NomiProject) async throws -> NomiProject {
        var request = try await authorizedRequest(path: "projects/\(project.id)/archive")
        request.httpMethod = "POST"
        let response: ProjectResponse = try await send(request)
        return response.project
    }

    func assignMemory(memoryId: String, to project: NomiProject) async throws {
        var request = try await authorizedRequest(path: "projects/\(project.id)/memories")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ProjectMemoryRequest(memoryId: memoryId))
        let _: EmptyBackendResponse = try await send(request)
    }

    func removeMemory(memoryId: String, from project: NomiProject) async throws {
        var request = try await authorizedRequest(path: "projects/\(project.id)/memories/\(memoryId)")
        request.httpMethod = "DELETE"
        let _: EmptyBackendResponse = try await send(request)
    }

    func projectMemories(projectId: String) async throws -> [NomiProjectMemory] {
        var request = try await authorizedRequest(path: "projects/\(projectId)/memories")
        request.httpMethod = "GET"
        let response: ProjectMemoryListResponse = try await send(request)
        return response.memories
    }

    func projectSuggestions(projectId: String) async throws -> [NomiProjectMemorySuggestion] {
        var request = try await authorizedRequest(path: "projects/\(projectId)/suggestions")
        request.httpMethod = "GET"
        let response: ProjectSuggestionsResponse = try await send(request)
        return response.suggestions
    }

    func generateProjectSummary(projectId: String, forceRegenerate: Bool = false) async throws -> NomiProject {
        var request = try await authorizedRequest(path: "projects/\(projectId)/summary")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ProjectSummaryRequest(forceRegenerate: forceRegenerate))
        let response: ProjectResponse = try await send(request)
        return response.project
    }

    func disconnectXBookmarks() async throws {
        var request = try await authorizedRequest(path: "x/bookmarks/connection")
        request.httpMethod = "DELETE"
        let _: EmptyBackendResponse = try await send(request)
    }

    private func authorizedRequest(path: String) async throws -> URLRequest {
        try await authorizedRequest(url: baseURL.appendingPathComponent(path))
    }

    private func authorizedRequest(url: URL) async throws -> URLRequest {
        guard let user = Auth.auth().currentUser else { throw BackendServiceError.notSignedIn }

        let token = try await user.getIDToken()
        var request = URLRequest(url: url)
        // Render free-tier cold starts take 20-45s and GitHub-cron keep-alive
        // pings fire with multi-hour gaps, so an 18s timeout guaranteed a
        // "could not reach the backend" error whenever the app was first to
        // arrive at a sleeping instance. 45s rides out a full cold start; the
        // friendly waking/offline copy still covers real outages.
        request.timeoutInterval = 45
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let error as URLError {
            // Deploy/cold-start blips: one silent retry for idempotent GETs on
            // connection-class failures before surfacing the friendly error.
            let retriable: Set<URLError.Code> = [.timedOut, .cannotConnectToHost, .networkConnectionLost, .cannotFindHost, .dnsLookupFailed]
            let method = (request.httpMethod ?? "GET").uppercased()
            if method == "GET", retriable.contains(error.code),
               let retried = try? await { try? await Task.sleep(for: .seconds(2.5)); return try await urlSession.data(for: request) }() {
                (data, response) = retried
            } else {
                throw BackendServiceError.network(Self.friendlyNetworkMessage(for: error))
            }
        } catch {
            throw BackendServiceError.network("Nomi could not reach the backend. It may be waking up or your connection may be offline.")
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendServiceError.invalidResponse
        }

        let decoder = JSONDecoder.nomiBackendDecoder

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? decoder.decode(BackendErrorResponse.self, from: data)
            throw BackendServiceError.server(errorResponse?.error ?? "Backend request failed.")
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch let decodingError as DecodingError {
            throw BackendServiceError.server(decodingError.nomiReadableMessage)
        }
    }

    private static func friendlyNetworkMessage(for error: URLError) -> String {
        switch error.code {
        case .timedOut:
            return "Nomi is waking up the backend. Please try again in a few seconds."
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return "Nomi could not reach the backend. It may be waking up or your connection may be offline."
        default:
            return "Nomi could not complete that backend request. Please try again."
        }
    }
}

// MARK: - Friend Circle

extension XBackendService {
    func circleSearch(query: String) async throws -> CircleProfile? {
        var components = URLComponents(url: baseURL.appendingPathComponent("circle/search"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components?.url else { throw BackendServiceError.invalidResponse }

        var request = try await authorizedRequest(url: url)
        request.httpMethod = "GET"
        let response: CircleSearchResponse = try await send(request)
        return response.user
    }

    func circleRequests() async throws -> CircleRequestsResponse {
        var request = try await authorizedRequest(path: "circle/requests")
        request.httpMethod = "GET"
        return try await send(request)
    }

    @discardableResult
    func sendCircleRequest(toUserId: String) async throws -> CircleRequestActionResponse {
        var request = try await authorizedRequest(path: "circle/requests")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["toUserId": toUserId])
        return try await send(request)
    }

    func acceptCircleRequest(fromUserId: String) async throws {
        var request = try await authorizedRequest(path: "circle/requests/\(fromUserId)/accept")
        request.httpMethod = "POST"
        let _: CircleActionResponse = try await send(request)
    }

    func declineCircleRequest(fromUserId: String) async throws {
        var request = try await authorizedRequest(path: "circle/requests/\(fromUserId)/decline")
        request.httpMethod = "POST"
        let _: CircleActionResponse = try await send(request)
    }

    func circleFriends() async throws -> [CircleFriend] {
        var request = try await authorizedRequest(path: "circle/friends")
        request.httpMethod = "GET"
        let response: CircleFriendsResponse = try await send(request)
        return response.friends
    }

    func setCircleFriendPinned(friendId: String, pinned: Bool) async throws {
        var request = try await authorizedRequest(path: "circle/friends/\(friendId)")
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["pinned": pinned])
        let _: CircleActionResponse = try await send(request)
    }

    func removeCircleFriend(friendId: String) async throws {
        var request = try await authorizedRequest(path: "circle/friends/\(friendId)")
        request.httpMethod = "DELETE"
        let _: CircleActionResponse = try await send(request)
    }

    func blockCircleUser(userId: String) async throws {
        var request = try await authorizedRequest(path: "circle/block")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["userId": userId])
        let _: CircleActionResponse = try await send(request)
    }

    @discardableResult
    func shareToCircle(toUserId: String, memoryId: String) async throws -> CircleShareResponse {
        var request = try await authorizedRequest(path: "circle/share")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["toUserId": toUserId, "memoryId": memoryId])
        return try await send(request)
    }

    func circleInbox() async throws -> [CircleInboxItem] {
        var request = try await authorizedRequest(path: "circle/inbox")
        request.httpMethod = "GET"
        let response: CircleInboxResponse = try await send(request)
        return response.items
    }

    @discardableResult
    func saveCircleShare(shareId: String) async throws -> CircleSaveResponse {
        var request = try await authorizedRequest(path: "circle/inbox/\(shareId)/save")
        request.httpMethod = "POST"
        return try await send(request)
    }

    func ignoreCircleShare(shareId: String) async throws {
        var request = try await authorizedRequest(path: "circle/inbox/\(shareId)/ignore")
        request.httpMethod = "POST"
        let _: CircleActionResponse = try await send(request)
    }
}

private struct BackendErrorResponse: Decodable {
    let error: String
}

private struct EmptyBackendResponse: Decodable {}

private extension JSONDecoder {
    static var nomiBackendDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let value = try? container.decode(String.self) {
                let fractionalFormatter = ISO8601DateFormatter()
                fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

                let standardFormatter = ISO8601DateFormatter()
                standardFormatter.formatOptions = [.withInternetDateTime]

                if let date = fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value) {
                    return date
                }

                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Invalid date format: \(value)"
                )
            }

            if let timestamp = try? container.decode(FirestoreTimestampValue.self) {
                return Date(timeIntervalSince1970: TimeInterval(timestamp.seconds) + TimeInterval(timestamp.nanoseconds ?? 0) / 1_000_000_000)
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date format."
            )
        }
        return decoder
    }
}

private struct FirestoreTimestampValue: Decodable {
    let seconds: Int
    let nanoseconds: Int?

    enum CodingKeys: String, CodingKey {
        case seconds = "_seconds"
        case nanoseconds = "_nanoseconds"
    }
}

private extension DecodingError {
    var nomiReadableMessage: String {
        switch self {
        case .dataCorrupted(let context):
            return context.debugDescription
        case .keyNotFound(let key, _):
            return "The backend response is missing \(key.stringValue)."
        case .typeMismatch(_, let context), .valueNotFound(_, let context):
            return context.debugDescription
        @unknown default:
            return "The backend returned data Nomi could not read."
        }
    }
}


// MARK: - Referral endpoints

struct ReferralSummary: Decodable, Hashable {
    let code: String
    let proTrialUntil: String?
    let grantedDays: Int?
    let redeemed: Bool?
}

struct ReferralRedeemResult: Decodable, Hashable {
    let ok: Bool
    let proTrialUntil: String?
    let referrerRewarded: Bool?
}

extension XBackendService {
    func referralSummary() async throws -> ReferralSummary {
        let request = try await authorizedRequest(path: "referral/me")
        return try await send(request)
    }

    func redeemReferral(code: String) async throws -> ReferralRedeemResult {
        var request = try await authorizedRequest(path: "referral/redeem")
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])
        return try await send(request)
    }
}
