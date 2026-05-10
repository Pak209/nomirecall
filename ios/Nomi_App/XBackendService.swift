import Foundation
import FirebaseAuth

enum BackendServiceError: LocalizedError {
    case notSignedIn
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn:
            return "Sign in before using X import."
        case .invalidResponse:
            return "The backend returned an unexpected response."
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
    let title: String?
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

    private func authorizedRequest(path: String) async throws -> URLRequest {
        try await authorizedRequest(url: baseURL.appendingPathComponent(path))
    }

    private func authorizedRequest(url: URL) async throws -> URLRequest {
        guard let user = Auth.auth().currentUser else { throw BackendServiceError.notSignedIn }

        let token = try await user.getIDToken()
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BackendServiceError.invalidResponse
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorResponse = try? decoder.decode(BackendErrorResponse.self, from: data)
            throw BackendServiceError.server(errorResponse?.error ?? "Backend request failed.")
        }

        return try decoder.decode(T.self, from: data)
    }
}

private struct BackendErrorResponse: Decodable {
    let error: String
}
