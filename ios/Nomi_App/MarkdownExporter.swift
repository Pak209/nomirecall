import Foundation

struct ObsidianExportPackage {
    let rootDirectory: URL
    let captureFileURL: URL
    let hubFileURLs: [URL]

    var activityItems: [URL] {
        [captureFileURL] + hubFileURLs
    }
}

private struct ObsidianExportContext {
    let title: String
    let type: String
    let content: String
    let tags: [String]
    let topics: [String]
    let projects: [String]
    let sourceName: String
    let sourceLink: String
    let relatedMemories: [NomiMemory]
}

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

    private static let topicSynonyms: [String: String] = [
        "agentic ai": "AI Agents",
        "ai agent": "AI Agents",
        "ai agents": "AI Agents",
        "agents": "AI Agents",
        "artificial intelligence": "AI",
        "personal agi": "Personal AGI",
        "large language model": "LLMs",
        "large language models": "LLMs",
        "llm": "LLMs",
        "llms": "LLMs",
        "x post": "X Posts",
        "x posts": "X Posts",
        "tweet": "X Posts",
        "tweets": "X Posts"
    ]

    private static let stopWords: Set<String> = [
        "about", "after", "again", "also", "and", "are", "because", "been", "being", "but", "can",
        "could", "did", "does", "for", "from", "has", "have", "how", "into", "its", "just", "like",
        "more", "not", "now", "of", "on", "or", "our", "out", "over", "really", "should", "that",
        "the", "their", "them", "then", "there", "these", "they", "this", "through", "to", "too",
        "use", "was", "were", "what", "when", "where", "which", "while", "with", "would", "you", "your"
    ]

    static func makeMarkdown(from memory: NomiMemory, relatedMemories: [NomiMemory] = [], exportedAt: Date = Date()) -> String {
        makeMarkdown(from: memory, context: exportContext(for: memory, relatedMemories: relatedMemories), exportedAt: exportedAt)
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

    static func writeExportPackage(for memory: NomiMemory, relatedMemories: [NomiMemory] = [], exportedAt: Date = Date()) throws -> ObsidianExportPackage {
        let context = exportContext(for: memory, relatedMemories: relatedMemories)
        let rootDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("NomiObsidianExport", isDirectory: true)
        let packageDirectory = rootDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)

        let captureDirectory = packageDirectory.appendingPathComponent(captureFolder(for: context.type), isDirectory: true)
        try FileManager.default.createDirectory(at: captureDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: packageDirectory.appendingPathComponent("Topics", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: packageDirectory.appendingPathComponent("Sources", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: packageDirectory.appendingPathComponent("Projects", isDirectory: true), withIntermediateDirectories: true)

        let captureFileURL = captureDirectory.appendingPathComponent(sanitizedFilename(from: context.title))
        try makeMarkdown(from: memory, context: context, exportedAt: exportedAt)
            .write(to: captureFileURL, atomically: true, encoding: .utf8)

        var hubFileURLs: [URL] = []
        for topic in context.topics {
            hubFileURLs.append(try writeHubNote(
                name: topic,
                kind: "topic",
                folder: "Topics",
                captureTitle: context.title,
                packageDirectory: packageDirectory
            ))
        }

        hubFileURLs.append(try writeHubNote(
            name: context.sourceName,
            kind: "source",
            folder: "Sources",
            captureTitle: context.title,
            packageDirectory: packageDirectory
        ))

        for project in context.projects {
            hubFileURLs.append(try writeHubNote(
                name: project,
                kind: "project",
                folder: "Projects",
                captureTitle: context.title,
                packageDirectory: packageDirectory
            ))
        }

        return ObsidianExportPackage(
            rootDirectory: packageDirectory,
            captureFileURL: captureFileURL,
            hubFileURLs: uniqueURLs(hubFileURLs)
        )
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

    static func extractTopics(from memory: NomiMemory) -> [String] {
        let seedText = [
            memory.title,
            memory.category,
            memory.content,
            memory.tags.joined(separator: " "),
            memory.links.compactMap(\.title).joined(separator: " "),
            memory.referencedPosts.compactMap(\.text).joined(separator: " ")
        ].joined(separator: " ")

        var candidates: [String] = []
        candidates.append(memory.category)
        candidates.append(contentsOf: memory.tags)
        candidates.append(contentsOf: phraseCandidates(from: seedText))
        candidates.append(contentsOf: keywordCandidates(from: seedText))

        var seen = Set<String>()
        let normalized = candidates
            .map(normalizedTopicName)
            .filter { !$0.isEmpty && $0.count > 2 }
            .filter { topic in
                let key = topic.lowercased()
                guard !seen.contains(key) else { return false }
                seen.insert(key)
                return true
            }

        let fallback = normalized.isEmpty ? ["Nomi"] : normalized
        return Array(fallback.prefix(7)).prefix(7).map { $0 }
    }

    static func normalizedTopicName(_ value: String) -> String {
        let raw = value
            .replacingOccurrences(of: "#", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "[^A-Za-z0-9@\\s]+", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !raw.isEmpty else { return "" }
        let key = raw.lowercased()
        if let synonym = topicSynonyms[key] {
            return synonym
        }

        return raw
            .split(separator: " ")
            .map { normalizedTopicWord(String($0)) }
            .joined(separator: " ")
    }

    static func wikiLink(_ title: String) -> String {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? "" : "[[\(clean)]]"
    }

    private static func makeMarkdown(from memory: NomiMemory, context: ObsidianExportContext, exportedAt: Date) -> String {
        let created = memory.sourceDate ?? memory.createdAt
        let sourceURL = memory.sourceURL?.absoluteString ?? ""

        var lines: [String] = [
            "---",
            "title: \(yamlQuoted(context.title))",
            "type: \(yamlQuoted(context.type))",
            "source: \(yamlQuoted(context.sourceName))",
            "source_url: \(yamlQuoted(sourceURL))",
            "author: \(yamlQuoted(context.sourceName))",
            "created: \(yamlQuoted(isoFormatter.string(from: created)))",
            "tags:"
        ]

        for tag in yamlTags(context.tags) {
            lines.append("  - \(yamlQuoted(tag))")
        }

        lines.append("projects:")
        for project in context.projects {
            lines.append("  - \(yamlQuoted(project))")
        }

        lines.append("topics:")
        for topic in context.topics {
            lines.append("  - \(yamlQuoted(topic))")
        }

        lines.append("exported_at: \(yamlQuoted(isoFormatter.string(from: exportedAt)))")
        lines.append("---")
        lines.append("")
        lines.append("# \(context.title)")
        lines.append("")
        lines.append("## Connections")
        lines.append("")
        lines.append("- Topics: \(wikiLinks(context.topics))")
        lines.append("- Projects: \(wikiLinks(context.projects))")
        lines.append("- Source: \(context.sourceLink)")
        lines.append("- Related: \(relatedWikiLinks(context.relatedMemories))")
        lines.append("")

        lines.append(context.type == "x-post" ? "## Original Post" : "## Original Content")
        lines.append("")
        lines.append(context.content.isEmpty ? "_No saved content._" : context.content)
        lines.append("")
        lines.append("## My Tags")
        lines.append("")
        lines.append(obsidianHashtags(context.tags).isEmpty ? "#nomi" : obsidianHashtags(context.tags).joined(separator: " "))
        lines.append("")
        lines.append("## Source")
        lines.append("")

        var sourceLines = ["- Saved from: Nomi"]
        sourceLines.append("- Source note: \(context.sourceLink)")
        if let sourceUsername = memory.sourceUsername, !sourceUsername.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sourceLines.append("- Author: \(sourceUsername)")
        }
        if let sourceURL = memory.sourceURL {
            sourceLines.append("- Original URL: \(sourceURL.absoluteString)")
        }
        if let sourceDate = memory.sourceDate {
            sourceLines.append("- Source Date: \(dateOnlyFormatter.string(from: sourceDate))")
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
        }

        // Organic share loop: exports are Nomi's most-traveled artifact.
        lines.append("")
        lines.append("---")
        lines.append("*Saved with [Nomi](\(NomiShareLinks.marketingURL)) — your second brain that remembers.*")
        return lines.joined(separator: "\n")
    }

    private static func exportContext(for memory: NomiMemory, relatedMemories: [NomiMemory]) -> ObsidianExportContext {
        let title = cleanText(memory.title, fallback: "Untitled memory")
        let content = memory.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let tags = normalizedTags(memory.tags)
        let type = obsidianSourceType(memory)
        let topics = extractTopics(from: memory)
        let projects = extractProjects(from: memory)
        let sourceName = sourceNoteName(for: memory)
        let related = relatedMemoriesForExport(memory: memory, topics: topics, allMemories: relatedMemories)

        return ObsidianExportContext(
            title: title,
            type: type,
            content: content,
            tags: tags,
            topics: topics,
            projects: projects,
            sourceName: sourceName,
            sourceLink: wikiLink(sourceName),
            relatedMemories: related
        )
    }

    private static func writeHubNote(
        name: String,
        kind: String,
        folder: String,
        captureTitle: String,
        packageDirectory: URL
    ) throws -> URL {
        let hubDirectory = packageDirectory.appendingPathComponent(folder, isDirectory: true)
        let fileURL = hubDirectory.appendingPathComponent(sanitizedFilename(from: name))
        let captureLink = wikiLink(captureTitle)

        var existing = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? hubMarkdown(name: name, kind: kind)
        if !existing.contains(captureLink) {
            if !existing.hasSuffix("\n") { existing.append("\n") }
            existing.append("- \(captureLink)\n")
        }

        try existing.write(to: fileURL, atomically: true, encoding: .utf8)
        return fileURL
    }

    private static func hubMarkdown(name: String, kind: String) -> String {
        [
            "---",
            "title: \(yamlQuoted(name))",
            "type: \(yamlQuoted(kind))",
            "source: \(yamlQuoted("Nomi"))",
            "source_url: \(yamlQuoted(""))",
            "author: \(yamlQuoted("Nomi"))",
            "created: \(yamlQuoted(isoFormatter.string(from: Date())))",
            "tags:",
            "  - \(yamlQuoted("nomi"))",
            "  - \(yamlQuoted(kind))",
            "projects:",
            "  - \(yamlQuoted("Nomi"))",
            "---",
            "",
            "# \(name)",
            "",
            "## Related Captures",
            ""
        ].joined(separator: "\n")
    }

    private static func sourceNoteName(for memory: NomiMemory) -> String {
        if let username = memory.sourceUsername?.trimmingCharacters(in: .whitespacesAndNewlines),
           !username.isEmpty {
            return username.hasPrefix("@") ? username : "@\(username)"
        }

        if let host = memory.sourceURL?.host?.replacingOccurrences(of: "www.", with: ""), !host.isEmpty {
            if host.contains("x.com") || host.contains("twitter.com") {
                return "X"
            }
            return normalizedTopicName(host.replacingOccurrences(of: ".", with: " "))
        }

        return "Nomi"
    }

    private static func extractProjects(from memory: NomiMemory) -> [String] {
        let text = [
            memory.title,
            memory.content,
            memory.category,
            memory.tags.joined(separator: " ")
        ].joined(separator: " ").lowercased()

        var projects = ["Nomi"]
        let knownProjects: [(String, String)] = [
            ("holobots", "Holobots"),
            ("holo bots", "Holobots"),
            ("nomi recall", "Nomi"),
            ("second brain", "Nomi")
        ]

        for (needle, project) in knownProjects where text.contains(needle) && !projects.contains(project) {
            projects.append(project)
        }

        return projects
    }

    private static func relatedMemoriesForExport(memory: NomiMemory, topics: [String], allMemories: [NomiMemory]) -> [NomiMemory] {
        let topicKeys = Set(topics.map { $0.lowercased() })
        let tagKeys = Set(memory.tags.map { normalizedTopicName($0).lowercased() })

        return allMemories
            .filter { $0.id != memory.id }
            .map { candidate -> (NomiMemory, Int) in
                let candidateTopics = Set(extractTopics(from: candidate).map { $0.lowercased() })
                let candidateTags = Set(candidate.tags.map { normalizedTopicName($0).lowercased() })
                var score = topicKeys.intersection(candidateTopics).count * 2
                score += tagKeys.intersection(candidateTags).count
                if candidate.category.caseInsensitiveCompare(memory.category) == .orderedSame {
                    score += 1
                }
                if candidate.sourceUsername == memory.sourceUsername && memory.sourceUsername != nil {
                    score += 1
                }
                return (candidate, score)
            }
            .filter { $0.1 > 0 }
            .sorted { lhs, rhs in
                if lhs.1 == rhs.1 { return lhs.0.createdAt > rhs.0.createdAt }
                return lhs.1 > rhs.1
            }
            .prefix(5)
            .map(\.0)
    }

    private static func phraseCandidates(from text: String) -> [String] {
        let lowercased = text.lowercased()
        var phrases: [String] = []

        for key in topicSynonyms.keys where lowercased.contains(key) {
            phrases.append(key)
        }

        let words = normalizedWords(from: lowercased)
        guard words.count > 1 else { return phrases }

        for index in words.indices.dropLast() {
            let first = words[index]
            let second = words[index + 1]
            if !stopWords.contains(first), !stopWords.contains(second) {
                phrases.append("\(first) \(second)")
            }
        }

        return phrases
    }

    private static func keywordCandidates(from text: String) -> [String] {
        var counts: [String: Int] = [:]
        for word in normalizedWords(from: text) where word.count >= 4 && !stopWords.contains(word) {
            counts[word, default: 0] += 1
        }

        return counts
            .sorted { lhs, rhs in
                if lhs.value == rhs.value { return lhs.key < rhs.key }
                return lhs.value > rhs.value
            }
            .prefix(10)
            .map(\.key)
    }

    private static func normalizedWords(from text: String) -> [String] {
        text
            .replacingOccurrences(of: "[^A-Za-z0-9@\\s]+", with: " ", options: .regularExpression)
            .lowercased()
            .split(separator: " ")
            .map(String.init)
    }

    private static func normalizedTopicWord(_ word: String) -> String {
        let lower = word.lowercased()
        switch lower {
        case "ai": return "AI"
        case "agi": return "AGI"
        case "api": return "API"
        case "apis": return "APIs"
        case "llm": return "LLM"
        case "llms": return "LLMs"
        case "url": return "URL"
        case "urls": return "URLs"
        case "x": return "X"
        default:
            return lower.prefix(1).uppercased() + lower.dropFirst()
        }
    }

    private static func captureFolder(for type: String) -> String {
        switch type {
        case "x-post":
            return "Captures/X"
        case "link", "url", "article":
            return "Captures/Articles"
        default:
            return "Captures/Notes"
        }
    }

    private static func wikiLinks(_ titles: [String]) -> String {
        let links = titles.map(wikiLink).filter { !$0.isEmpty }
        return links.isEmpty ? "_None yet._" : links.joined(separator: " ")
    }

    private static func relatedWikiLinks(_ memories: [NomiMemory]) -> String {
        let links = memories.map { wikiLink(cleanText($0.title, fallback: "Untitled memory")) }
        return links.isEmpty ? "_None yet._" : links.joined(separator: " ")
    }

    private static func uniqueURLs(_ urls: [URL]) -> [URL] {
        var seen = Set<String>()
        return urls.filter { url in
            let key = url.path
            guard !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }
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
}
