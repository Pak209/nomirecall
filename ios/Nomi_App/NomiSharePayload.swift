import Foundation

struct NomiSharePayload: Codable, Equatable {
    var urlString: String?
    var text: String?
    var title: String?
    var receivedAt: Date

    var primaryText: String {
        [title, text, urlString]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
    }
}

extension Notification.Name {
    static let nomiSharedCaptureReceived = Notification.Name("nomiSharedCaptureReceived")
}
