import SwiftUI

struct QuickCaptureView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

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

    private let categories = ["General", "Work", "Personal", "AI & Tech", "Finance", "Health", "Ideas"]
    private let xBackendService = XBackendService()

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        typePicker
                        captureFields
                        categoryPicker
                        saveButton
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 36)
                }
            }
            .navigationTitle("Quick Capture")
            .alert("Could not save", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(memoryStore.errorMessage ?? "Something went wrong.")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Save anything")
                .font(.largeTitle.bold())

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
                            .font(.title2)
                        Text(type.title)
                            .font(.caption.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 82)
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
                }
            }

            TextEditor(text: $content)
                .frame(minHeight: 170)
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
                .font(.headline)

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

    private func save() async {
        guard let userId = appSession.user?.uid else { return }

        isSaving = true
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
            type: selectedType.memoryType
        )

        if saved {
            title = ""
            content = ""
            link = ""
            tagText = ""
            xSourceUsername = nil
            xSourceDate = nil
            selectedType = .note
        }
    }

    private func importXPost() async {
        isImportingXPost = true
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
        } catch {
            memoryStore.errorMessage = error.localizedDescription
        }
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
