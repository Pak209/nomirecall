import Foundation

enum NomiFormatters {
    static let shortDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    static let shortDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

extension NomiMemory {
    var displayDate: String {
        NomiFormatters.shortDateTime.string(from: createdAt)
    }

    var previewText: String {
        content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var displayType: String {
        switch type {
        case "link":
            return "Link"
        case "image":
            return "Image"
        case "voice":
            return "Voice"
        case "x_post":
            return "X post"
        default:
            return "Note"
        }
    }
}

extension String {
    var nomiTags: [String] {
        split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
