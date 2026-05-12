import SwiftUI

struct QuickCaptureView: View {
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
    @State private var xSourceUsername: String?
    @State private var xSourceDate: Date?
    @State private var xLinks: [NomiMemoryLink] = []
    @State private var xMedia: [NomiMemoryMedia] = []
    @State private var xReferencedPosts: [NomiReferencedPost] = []
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
            .alert(alertTitle, isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(memoryStore.errorMessage ?? "Something went wrong.")
            }
            .onAppear(perform: applyPendingSharePayload)
            .onChange(of: pendingSharePayload) { _, _ in
                applyPendingSharePayload()
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
                    .background(.white.opacity(selectedType == type ? 0.95 : 0.78))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(selectedType == type ? .pink : Color.black.opacity(0.08), lineWidth: 1.5)
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

                if isXPostLink {
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

                saveButton
            }

            TextEditor(text: $content)
                .frame(minHeight: 142)
                .padding(12)
                .background(.white.opacity(0.9))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.black.opacity(0.08), lineWidth: 1)
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
            .background(.white.opacity(0.9))
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
        URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var isXPostLink: Bool {
        let value = link.lowercased()
        return value.contains("x.com/") || value.contains("twitter.com/")
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
        .background(.white.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func save() async {
        guard let userId = appSession.user?.uid else { return }

        isSaving = true
        alertTitle = "Could not save"
        defer { isSaving = false }

        let saved = await memoryStore.create(
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

        if saved {
            title = ""
            content = ""
            link = ""
            tagText = ""
            xSourceUsername = nil
            xSourceDate = nil
            xLinks = []
            xMedia = []
            xReferencedPosts = []
            selectedType = .note
        }
    }

    private func importXPost() async {
        isImportingXPost = true
        alertTitle = "Could not import X post"
        defer { isImportingXPost = false }

        do {
            let response = try await xBackendService.previewPost(url: link)
            guard let post = response.post else { return }

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
