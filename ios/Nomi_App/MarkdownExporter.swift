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

        if !memory.links.isEmpty {
            lines.append("links:")
            for link in memory.links {
                if let url = link.url?.absoluteString {
                    lines.append("  - \(yamlQuoted(url))")
                }
            }
        }

        if !memory.media.isEmpty {
            lines.append("media:")
            for media in memory.media {
                if let url = media.bestDisplayURL?.absoluteString ?? media.bestVideoURL?.absoluteString {
                    lines.append("  - \(yamlQuoted(url))")
                }
            }
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
        for link in memory.links {
            if let url = link.url {
                sourceLines.append("- Link: \(url.absoluteString)")
            }
        }
        for media in memory.media {
            if let url = media.bestDisplayURL ?? media.bestVideoURL {
                sourceLines.append("- \(media.type.capitalized): \(url.absoluteString)")
            }
        }

        lines.append(contentsOf: sourceLines)
        lines.append("")

        if let mediaURL = memory.mediaURL ?? memory.media.first?.bestDisplayURL ?? memory.media.first?.bestVideoURL {
            lines.append("## Media")
            lines.append("")
            lines.append("- \(mediaURL.absoluteString)")
            for media in memory.media.dropFirst() {
                if let url = media.bestDisplayURL ?? media.bestVideoURL {
                    lines.append("- \(url.absoluteString)")
                }
            }
            lines.append("")
        }

        if !memory.links.isEmpty {
            lines.append("## Links")
            lines.append("")
            for link in memory.links {
                if let url = link.url {
                    let label = link.title ?? link.displayUrl ?? url.absoluteString
                    lines.append("- [\(markdownEscaped(label))](\(url.absoluteString))")
                }
            }
            lines.append("")
        }

        if !memory.referencedPosts.isEmpty {
            lines.append("## Referenced Posts")
            lines.append("")
            for post in memory.referencedPosts {
                lines.append("### \(referencedPostTitle(post))")
                lines.append("")
                if let text = post.text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    lines.append(text)
                    lines.append("")
                }
                if let url = post.url {
                    lines.append("- URL: \(url.absoluteString)")
                }
                if let date = post.postDate {
                    lines.append("- Post Date: \(dateOnlyFormatter.string(from: date))")
                }
                for media in post.media {
                    if let url = media.bestDisplayURL ?? media.bestVideoURL {
                        lines.append("- \(media.type.capitalized): \(url.absoluteString)")
                    }
                }
                for link in post.links {
                    if let url = link.url {
                        lines.append("- Link: \(url.absoluteString)")
                    }
                }
                lines.append("")
            }
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

    private static func markdownEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "[", with: "\\[")
            .replacingOccurrences(of: "]", with: "\\]")
    }

    private static func referencedPostTitle(_ post: NomiReferencedPost) -> String {
        let label: String
        switch post.referenceType {
        case "quoted": label = "Quoted post"
        case "retweeted": label = "Repost"
        case "replied_to": label = "Reply"
        default: label = "Referenced post"
        }

        if let username = post.username, !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "\(label) from \(username)"
        }
        return label
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
