import SwiftUI

struct QuickCaptureView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    @Binding private var pendingSharePayload: NomiSharePayload?

    @State private var selectedType = CaptureType.note
    @State private var title = ""
    @State private var content = ""
    @State private var link = ""
    @State private var category = "General"
    @State private var tagText = ""
    @State private var isSaving = false
    @State private var isImportingXPost = false
    @State private var isLoadingTikTokPreview = false
    @State private var xSourceUsername: String?
    @State private var xSourceDate: Date?
    @State private var xLinks: [NomiMemoryLink] = []
    @State private var xMedia: [NomiMemoryMedia] = []
    @State private var xReferencedPosts: [NomiReferencedPost] = []
    @State private var tiktokPreview: TikTokPreview?
    @State private var tiktokPreviewURL = ""
    @State private var tiktokPreviewTask: Task<Void, Never>?
    @State private var alertTitle = "Could not save"

    private let categories = ["General", "Work", "Personal", "AI & Tech", "Finance", "Health", "Ideas"]
    private let xBackendService = XBackendService()

    init(pendingSharePayload: Binding<NomiSharePayload?> = .constant(nil)) {
        _pendingSharePayload = pendingSharePayload
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        typePicker
                        captureFields
                        categoryPicker
                        if selectedType != .link {
                            saveButton
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 10)
                    .padding(.bottom, 104)
                }
            }
            .navigationTitle("Quick Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.nomiInk)
                    }
                    .accessibilityLabel("Close quick capture")
                }
            }
            .presentationDragIndicator(.visible)
            .alert(alertTitle, isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(memoryStore.errorMessage ?? "Something went wrong.")
            }
            .onAppear(perform: applyPendingSharePayload)
            .onChange(of: pendingSharePayload) { _, _ in
                applyPendingSharePayload()
            }
            .onChange(of: link) { _, _ in
                scheduleTikTokPreview()
            }
            .onChange(of: selectedType) { _, _ in
                scheduleTikTokPreview()
            }
            .onDisappear {
                tiktokPreviewTask?.cancel()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Save anything")
                .font(.system(size: 30, weight: .black, design: .rounded))

            Text("Capture notes, links, images, and voice thoughts to your Nomi memory.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var typePicker: some View {
        HStack(spacing: 12) {
            ForEach(CaptureType.allCases) { type in
                Button {
                    selectedType = type
                } label: {
                    VStack(spacing: 8) {
                        Image(systemName: type.systemImage)
                            .font(.system(size: 20, weight: .semibold))
                        Text(type.title)
                            .font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 72)
                    .foregroundStyle(selectedType == type ? .pink : .primary)
                    .background(selectedType == type ? Color.nomiCardStrong : Color.nomiCard)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(selectedType == type ? .pink : Color.nomiStroke, lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var captureFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Optional title", text: $title)
                .nomiTextField()

            if selectedType == .link {
                TextField("https://example.com", text: $link)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .nomiTextField()

                if isTikTokLink {
                    tiktokPreviewSection
                } else if isXPostLink {
                    Button {
                        Task { await importXPost() }
                    } label: {
                        HStack {
                            if isImportingXPost {
                                ProgressView()
                            }

                            Text(isImportingXPost ? "Importing X post..." : "Import X post content")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiSecondaryButtonStyle())
                    .disabled(isImportingXPost || link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if hasImportedXRichContent {
                        importedXPreview
                    }
                }

                if !isTikTokLink {
                    saveButton
                }
            }

            TextEditor(text: $content)
                .frame(minHeight: 142)
                .padding(12)
                .background(Color.nomiField)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.nomiStroke, lineWidth: 1)
                )
                .overlay(alignment: .topLeading) {
                    if content.isEmpty {
                        Text(selectedType.placeholder)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 20)
                    }
                }

            TextField("Tags, separated by commas", text: $tagText)
                .textInputAutocapitalization(.never)
                .nomiTextField()
        }
    }

    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Category")
                .font(.subheadline.weight(.bold))

            Picker("Category", selection: $category) {
                ForEach(categories, id: \.self) { category in
                    Text(category).tag(category)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color.nomiField)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private var saveButton: some View {
        Button {
            Task { await save() }
        } label: {
            HStack {
                if isSaving {
                    ProgressView()
                        .tint(.white)
                }
                Text(isSaving ? "Saving..." : "Save memory")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(NomiPrimaryButtonStyle())
        .disabled(isSaving || !canSave)
        .opacity(isSaving || !canSave ? 0.55 : 1)
    }

    private var canSave: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var sourceURL: URL? {
        Self.normalizedWebURL(from: link)
    }

    private var isXPostLink: Bool {
        Self.xPostURL(from: link) != nil
    }

    private var isTikTokLink: Bool {
        Self.tiktokURL(from: link) != nil
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { memoryStore.errorMessage != nil },
            set: { if !$0 { memoryStore.errorMessage = nil } }
        )
    }

    private var hasImportedXRichContent: Bool {
        !xMedia.isEmpty || !xLinks.isEmpty || !xReferencedPosts.isEmpty
    }

    private var importedXPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Imported extras")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                if !xMedia.isEmpty {
                    Label("\(xMedia.count) media", systemImage: "photo.on.rectangle")
                }
                if !xLinks.isEmpty {
                    Label("\(xLinks.count) links", systemImage: "link")
                }
                if !xReferencedPosts.isEmpty {
                    Label("\(xReferencedPosts.count) related posts", systemImage: "arrow.triangle.branch")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.pink)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCard)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var tiktokPreviewSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isLoadingTikTokPreview {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading TikTok preview...")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(.secondary)
            } else if let tiktokPreview {
                tiktokPreviewCard(tiktokPreview)
            } else {
                Button {
                    Task { await loadTikTokPreview() }
                } label: {
                    Label("Load TikTok preview", systemImage: "play.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(NomiSecondaryButtonStyle())
                .disabled(link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func tiktokPreviewCard(_ preview: TikTokPreview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let thumbnailURL = preview.thumbnailUrl {
                AsyncImage(url: thumbnailURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        ZStack {
                            Color.black.opacity(0.06)
                            Image(systemName: "play.rectangle.fill")
                                .font(.system(size: 38, weight: .semibold))
                                .foregroundStyle(.pink)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 210)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(preview.authorName ?? "TikTok creator")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.pink)
                Text(preview.title ?? "TikTok video")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                    .lineLimit(3)
                if preview.unavailable == true {
                    Text("Preview metadata is unavailable, but Nomi can still save the TikTok URL.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Button {
                Task { await saveTikTokVideoMemory(preview) }
            } label: {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(isSaving ? "Saving..." : "Save Video Memory")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())
            .disabled(isSaving)
        }
        .padding(12)
        .background(Color.nomiCardStrong)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private func save() async {
        guard let userId = appSession.user?.uid else { return }

        isSaving = true
        alertTitle = "Could not save"
        defer { isSaving = false }

        let savedMemoryId = await memoryStore.create(
            userId: userId,
            title: title,
            content: content.isEmpty ? link : content,
            category: category,
            tags: tagText.nomiTags,
            sourceURL: selectedType == .link ? sourceURL : nil,
            sourceUsername: xSourceUsername,
            sourceDate: xSourceDate,
            type: isXPostLink ? "x_post" : selectedType.memoryType,
            links: xLinks,
            media: xMedia,
            referencedPosts: xReferencedPosts
        )

        if savedMemoryId != nil {
            resetDraft()
        }
    }

    private func saveTikTokVideoMemory(_ preview: TikTokPreview) async {
        guard let userId = appSession.user?.uid else { return }

        isSaving = true
        alertTitle = "Could not save TikTok"
        defer { isSaving = false }

        let metadata = TikTokMemoryMetadata(
            source: preview.source ?? "tiktok",
            sourceType: preview.sourceType ?? "video",
            originalUrl: preview.originalUrl ?? sourceURL,
            canonicalUrl: preview.canonicalUrl ?? sourceURL,
            platformVideoId: preview.platformVideoId,
            authorName: preview.authorName,
            authorUrl: preview.authorUrl,
            thumbnailUrl: preview.thumbnailUrl,
            embedHtml: preview.embedHtml,
            playerUrl: preview.playerUrl,
            transcriptStatus: preview.transcriptStatus ?? "unavailable"
        )
        let text = [
            preview.title.map { "TikTok caption: \($0)" },
            preview.authorName.map { "Creator: \($0)" },
            (preview.canonicalUrl ?? preview.originalUrl ?? sourceURL).map { "TikTok URL: \($0.absoluteString)" },
            content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : content.trimmingCharacters(in: .whitespacesAndNewlines)
        ].compactMap { $0 }.joined(separator: "\n")

        let savedMemoryId = await memoryStore.create(
            userId: userId,
            title: title.trimmedFallback(preview.title ?? "TikTok video"),
            content: text.trimmedFallback(link),
            category: preview.category ?? category,
            tags: preview.tags ?? ["tiktok", "video"],
            sourceURL: preview.canonicalUrl ?? preview.originalUrl ?? sourceURL,
            sourceUsername: preview.authorName,
            sourceDate: nil,
            type: "tiktok_video",
            tiktok: metadata
        )

        if savedMemoryId != nil {
            resetDraft()
        }
    }

    private func resetDraft() {
        title = ""
        content = ""
        link = ""
        tagText = ""
        xSourceUsername = nil
        xSourceDate = nil
        xLinks = []
        xMedia = []
        xReferencedPosts = []
        tiktokPreview = nil
        tiktokPreviewURL = ""
        selectedType = .note
    }

    private func importXPost() async {
        isImportingXPost = true
        alertTitle = "Could not import X post"
        defer { isImportingXPost = false }

        do {
            let previewURL = Self.xPostURL(from: link)?.absoluteString ?? link
            let response = try await xBackendService.previewPost(url: previewURL)
            guard let post = response.post else { return }

            link = post.url?.absoluteString ?? previewURL
            title = post.title ?? title
            content = post.text ?? content
            category = post.category ?? category
            tagText = (post.tags ?? tagText.nomiTags).joined(separator: ", ")
            xSourceUsername = post.username.map { "@\($0)" }
            xSourceDate = post.postDate
            xLinks = (post.links ?? []).map(NomiMemoryLink.init)
            xMedia = (post.media ?? []).map(NomiMemoryMedia.init)
            xReferencedPosts = (post.referencedPosts ?? []).map(NomiReferencedPost.init)
        } catch {
            memoryStore.errorMessage = error.localizedDescription
        }
    }

    private func scheduleTikTokPreview() {
        tiktokPreviewTask?.cancel()
        guard selectedType == .link, let url = Self.tiktokURL(from: link) else {
            tiktokPreview = nil
            tiktokPreviewURL = ""
            isLoadingTikTokPreview = false
            return
        }

        let urlString = url.absoluteString
        if tiktokPreviewURL == urlString, tiktokPreview != nil { return }
        tiktokPreviewTask = Task {
            try? await Task.sleep(nanoseconds: 550_000_000)
            guard !Task.isCancelled else { return }
            await loadTikTokPreview()
        }
    }

    private func loadTikTokPreview() async {
        guard let previewURL = Self.tiktokURL(from: link)?.absoluteString else { return }
        if tiktokPreviewURL == previewURL, tiktokPreview != nil { return }

        isLoadingTikTokPreview = true
        alertTitle = "Could not preview TikTok"
        defer { isLoadingTikTokPreview = false }

        do {
            let response = try await xBackendService.previewTikTok(url: previewURL)
            tiktokPreview = response.tiktok
            tiktokPreviewURL = previewURL
            title = title.trimmedFallback(response.tiktok.title ?? "TikTok video")
            category = response.tiktok.category ?? category
            if let tags = response.tiktok.tags, !tags.isEmpty {
                tagText = tags.joined(separator: ", ")
            }
            link = response.tiktok.canonicalUrl?.absoluteString ?? response.tiktok.originalUrl?.absoluteString ?? previewURL
        } catch {
            guard let fallbackURL = Self.tiktokURL(from: link) else {
                tiktokPreview = nil
                tiktokPreviewURL = ""
                memoryStore.errorMessage = error.localizedDescription
                return
            }
            tiktokPreview = Self.fallbackTikTokPreview(url: fallbackURL)
            tiktokPreviewURL = fallbackURL.absoluteString
        }
    }

    private func applyPendingSharePayload() {
        guard let payload = pendingSharePayload else { return }

        selectedType = .link
        if let sharedURL = payload.urlString?.trimmingCharacters(in: .whitespacesAndNewlines), !sharedURL.isEmpty {
            link = sharedURL
        } else {
            selectedType = .note
        }

        if let sharedText = payload.text?.trimmingCharacters(in: .whitespacesAndNewlines), !sharedText.isEmpty {
            if sharedText != link {
                content = sharedText
            }
        }

        if let sharedTitle = payload.title?.trimmingCharacters(in: .whitespacesAndNewlines), !sharedTitle.isEmpty {
            title = sharedTitle
        }

        pendingSharePayload = nil
    }

    private static func normalizedWebURL(from value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let url = URL(string: trimmed), url.scheme != nil {
            return url
        }

        return URL(string: "https://\(trimmed)")
    }

    private static func xPostURL(from value: String) -> URL? {
        guard let url = normalizedWebURL(from: value),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = components.host?.lowercased(),
              isXHost(host) else {
            return nil
        }

        let pathParts = components.path
            .split(separator: "/")
            .map(String.init)

        guard let statusIndex = pathParts.firstIndex(where: { $0.lowercased() == "status" }),
              pathParts.indices.contains(statusIndex + 1),
              pathParts[statusIndex + 1].allSatisfy(\.isNumber) else {
            return nil
        }

        return url
    }

    private static func tiktokURL(from value: String) -> URL? {
        guard let url = normalizedWebURL(from: value),
              let host = url.host?.lowercased(),
              isTikTokHost(host) else {
            return nil
        }
        return url
    }

    private static func isTikTokHost(_ host: String) -> Bool {
        host == "tiktok.com" ||
            host.hasSuffix(".tiktok.com") ||
            host == "vm.tiktok.com" ||
            host == "vt.tiktok.com"
    }

    private static func fallbackTikTokPreview(url: URL) -> TikTokPreview {
        TikTokPreview(
            source: "tiktok",
            sourceType: "video",
            originalUrl: url,
            canonicalUrl: url,
            platformVideoId: nil,
            title: "TikTok video",
            authorName: nil,
            authorUrl: nil,
            thumbnailUrl: nil,
            providerName: "TikTok",
            providerUrl: URL(string: "https://www.tiktok.com"),
            embedHtml: nil,
            playerUrl: nil,
            transcriptStatus: "unavailable",
            category: "General",
            tags: ["tiktok", "video"],
            memoryText: "TikTok URL: \(url.absoluteString)",
            unavailable: true
        )
    }

    private static func isXHost(_ host: String) -> Bool {
        host == "x.com" ||
            host.hasSuffix(".x.com") ||
            host == "twitter.com" ||
            host.hasSuffix(".twitter.com")
    }
}

private extension NomiMemoryLink {
    init(_ link: XLink) {
        self.init(url: link.url, displayUrl: link.displayUrl, title: link.title)
    }
}

private extension NomiMemoryMedia {
    init(_ media: XMedia) {
        self.init(
            type: media.type,
            url: media.url,
            previewImageUrl: media.previewImageUrl,
            altText: media.altText,
            width: media.width,
            height: media.height,
            variants: (media.variants ?? []).map(NomiMemoryMediaVariant.init)
        )
    }
}

private extension NomiMemoryMediaVariant {
    init(_ variant: XMediaVariant) {
        self.init(url: variant.url, contentType: variant.contentType, bitRate: variant.bitRate)
    }
}

private extension NomiReferencedPost {
    init(_ post: XReferencedPost) {
        self.init(
            id: post.id,
            referenceType: post.referenceType,
            username: post.username.map { "@\($0)" },
            url: post.url,
            text: post.text,
            postDate: post.postDate,
            links: (post.links ?? []).map(NomiMemoryLink.init),
            media: (post.media ?? []).map(NomiMemoryMedia.init)
        )
    }
}

private extension String {
    func trimmedFallback(_ fallback: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

private enum CaptureType: String, CaseIterable, Identifiable {
    case note
    case link
    case image
    case voice

    var id: String { rawValue }

    var title: String {
        switch self {
        case .note: "Note"
        case .link: "Link"
        case .image: "Image"
        case .voice: "Voice"
        }
    }

    var systemImage: String {
        switch self {
        case .note: "note.text"
        case .link: "link"
        case .image: "photo"
        case .voice: "mic"
        }
    }

    var placeholder: String {
        switch self {
        case .note: "Write a thought, quote, or idea..."
        case .link: "Add context about this link..."
        case .image: "Describe the image you want to remember..."
        case .voice: "Type a voice memo transcript or summary..."
        }
    }

    var memoryType: String {
        switch self {
        case .note: "note"
        case .link: "link"
        case .image: "image"
        case .voice: "voice"
        }
    }
}
