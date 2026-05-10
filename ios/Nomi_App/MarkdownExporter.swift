import Foundation

enum MarkdownExporter {
    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let dateOnlyFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter
    }()

    static func makeMarkdown(from memory: NomiMemory, exportedAt: Date = Date()) -> String {
        let title = cleanText(memory.title, fallback: "Untitled memory")
        let category = cleanText(memory.category, fallback: "General")
        let content = memory.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let tags = normalizedTags(memory.tags)
        let sourceType = obsidianSourceType(memory)

        var lines: [String] = [
            "---",
            "source: nomi",
            "source_type: \(yamlQuoted(sourceType))",
            "title: \(yamlQuoted(title))",
            "category: \(yamlQuoted(category))",
            "tags:"
        ]

        for tag in yamlTags(tags) {
            lines.append("  - \(yamlQuoted(tag))")
        }

        if let author = memory.sourceUsername, !author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append("author: \(yamlQuoted(author))")
        }

        if let sourceDate = memory.sourceDate {
            lines.append("post_date: \(yamlQuoted(dateOnlyFormatter.string(from: sourceDate)))")
        }

        if let sourceURL = memory.sourceURL {
            lines.append("original_url: \(yamlQuoted(sourceURL.absoluteString))")
        }

        lines.append("exported_at: \(yamlQuoted(isoFormatter.string(from: exportedAt)))")
        lines.append("---")
        lines.append("")
        lines.append("# \(title)")
        lines.append("")

        if let summary = summary(from: memory), !summary.isEmpty {
            lines.append("## Summary")
            lines.append("")
            lines.append(summary)
            lines.append("")
        }

        lines.append(sourceType == "x-post" ? "## Original Post" : "## Original Content")
        lines.append("")
        lines.append(content.isEmpty ? "_No saved content._" : content)
        lines.append("")
        lines.append("## My Tags")
        lines.append("")
        lines.append(obsidianHashtags(tags).isEmpty ? "#nomi" : obsidianHashtags(tags).joined(separator: " "))
        lines.append("")
        lines.append("## Source")
        lines.append("")

        var sourceLines = ["- Saved from: Nomi"]
        if let author = memory.sourceUsername, !author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sourceLines.append("- Author: \(author)")
        }
        if let sourceURL = memory.sourceURL {
            sourceLines.append("- Original URL: \(sourceURL.absoluteString)")
        }
        if let sourceDate = memory.sourceDate {
            sourceLines.append("- Post Date: \(dateOnlyFormatter.string(from: sourceDate))")
        }
        if let mediaURL = memory.mediaURL {
            sourceLines.append("- Media: \(mediaURL.absoluteString)")
        }

        lines.append(contentsOf: sourceLines)
        lines.append("")

        if let mediaURL = memory.mediaURL {
            lines.append("## Media")
            lines.append("")
            lines.append("- \(mediaURL.absoluteString)")
            lines.append("")
        }

        return lines.joined(separator: "\n")
    }

    static func writeMarkdownFile(markdown: String, title: String) throws -> URL {
        let filename = sanitizedFilename(from: title)
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("NomiExports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let fileURL = directory.appendingPathComponent(filename)
        try markdown.write(to: fileURL, atomically: true, encoding: .utf8)
        return fileURL
    }

    static func sanitizedFilename(from title: String) -> String {
        let fallback = "Nomi Memory"
        let illegalCharacters = CharacterSet(charactersIn: "/:\"?#%&{}<>*$!'@+`|=\n\r\t")
        let sanitized = title
            .components(separatedBy: illegalCharacters)
            .joined(separator: " ")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let base = sanitized.isEmpty ? fallback : sanitized
        let limited = String(base.prefix(80)).trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(limited.isEmpty ? fallback : limited).md"
    }

    private static func cleanText(_ value: String, fallback: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }

    private static func yamlQuoted(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\""
    }

    private static func normalizedTags(_ tags: [String]) -> [String] {
        var seen = Set<String>()
        return (["nomi"] + tags)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { tag in
                let key = tag.lowercased()
                if seen.contains(key) { return false }
                seen.insert(key)
                return true
            }
    }

    private static func yamlTags(_ tags: [String]) -> [String] {
        tags.map { $0.hasPrefix("#") ? String($0.dropFirst()) : $0 }
    }

    private static func obsidianHashtags(_ tags: [String]) -> [String] {
        yamlTags(tags).map { tag in
            let normalized = tag
                .lowercased()
                .replacingOccurrences(of: "[^a-z0-9_/-]+", with: "-", options: .regularExpression)
                .trimmingCharacters(in: CharacterSet(charactersIn: "-/"))
            return normalized.isEmpty ? nil : "#\(normalized)"
        }
        .compactMap { $0 }
    }

    private static func obsidianSourceType(_ memory: NomiMemory) -> String {
        let type = memory.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sourceHost = memory.sourceURL?.host?.lowercased() ?? ""

        if sourceHost.contains("x.com") || sourceHost.contains("twitter.com") {
            return "x-post"
        }

        if memory.sourceUsername?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false,
           type == "link" {
            return "x-post"
        }

        switch type {
        case "tweet", "x_post", "x-post", "xpost":
            return "x-post"
        case "url":
            return "link"
        default:
            return type.isEmpty ? "note" : type
        }
    }

    private static func summary(from memory: NomiMemory) -> String? {
        nil
    }
}
