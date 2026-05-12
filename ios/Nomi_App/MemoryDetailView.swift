import SwiftUI
import UIKit
import AVKit

struct MemoryDetailView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: NomiMemory
    @State private var tagText: String
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var isConfirmingDelete = false
    @State private var exportedFileURL: URL?
    @State private var isShowingShareSheet = false
    @State private var isShowingMarkdownPreview = false
    @State private var markdownPreview = ""
    @State private var exportMessage: String?
    @State private var exportErrorMessage: String?

    init(memory: NomiMemory) {
        _draft = State(initialValue: memory)
        _tagText = State(initialValue: memory.tags.joined(separator: ", "))
    }

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TextField("Title", text: $draft.title)
                        .font(.title.bold())
                        .nomiTextField()

                    TextEditor(text: $draft.content)
                        .frame(minHeight: 260)
                        .padding(12)
                        .background(.white.opacity(0.92))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Color.black.opacity(0.08), lineWidth: 1)
                        )

                    richPostSection
                    infoSection

                    TextField("Tags, separated by commas", text: $tagText)
                        .textInputAutocapitalization(.never)
                        .nomiTextField()

                    exportSection
                    actions
                }
                .padding(20)
            }
        }
        .navigationTitle("Memory")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete this memory?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete memory", role: .destructive) {
                Task { await deleteMemory() }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Memory error", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(memoryStore.errorMessage ?? "Something went wrong.")
        }
        .alert("Export failed", isPresented: exportErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(exportErrorMessage ?? "Nomi could not create the Markdown file.")
        }
        .sheet(isPresented: $isShowingShareSheet) {
            if let exportedFileURL {
                ShareSheet(activityItems: [exportedFileURL])
            }
        }
        .sheet(isPresented: $isShowingMarkdownPreview) {
            NavigationStack {
                ScrollView {
                    Text(markdownPreview)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(Color.nomiInk)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                .background(NomiBackground())
                .navigationTitle("Markdown Preview")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {
                            isShowingMarkdownPreview = false
                        }
                    }
                }
            }
        }
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabeledContent("Category") {
                TextField("General", text: $draft.category)
                    .multilineTextAlignment(.trailing)
            }

            LabeledContent("Type", value: draft.displayType)
            LabeledContent("Created", value: draft.displayDate)

            if let sourceUsername = draft.sourceUsername {
                LabeledContent("Username", value: sourceUsername)
            }

            if let sourceDate = draft.sourceDate {
                LabeledContent("Source date", value: NomiFormatters.shortDate.string(from: sourceDate))
            }

            if let sourceURL = draft.sourceURL {
                Link("Open source", destination: sourceURL)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.pink)
            }
        }
        .padding(16)
        .background(.white.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private var richPostSection: some View {
        if !draft.media.isEmpty || !draft.links.isEmpty || !draft.referencedPosts.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                if !draft.media.isEmpty {
                    MemoryMediaSection(title: "Media", media: draft.media)
                }

                if !draft.links.isEmpty {
                    MemoryLinksSection(title: "Links", links: draft.links)
                }

                if !draft.referencedPosts.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Related posts")
                            .font(.headline)
                        ForEach(draft.referencedPosts) { post in
                            ReferencedPostCard(post: post)
                        }
                    }
                }
            }
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                Task { await save() }
            } label: {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(isSaving ? "Saving..." : "Save changes")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())
            .disabled(isSaving || isDeleting)

            Button(role: .destructive) {
                isConfirmingDelete = true
            } label: {
                HStack {
                    if isDeleting {
                        ProgressView()
                    }
                    Text(isDeleting ? "Deleting..." : "Delete memory")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiSecondaryButtonStyle())
            .disabled(isSaving || isDeleting)
        }
    }

    private var exportSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Obsidian")
                .font(.headline)
                .foregroundStyle(Color.nomiInk)

            Button {
                exportAsObsidianNote()
            } label: {
                Label("Export as Obsidian Note", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiSecondaryButtonStyle())
            .disabled(isSaving || isDeleting)

            HStack(spacing: 12) {
                Button {
                    copyMarkdown()
                } label: {
                    Label("Copy Markdown", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(NomiSecondaryButtonStyle())

                Button {
                    previewMarkdown()
                } label: {
                    Label("Preview", systemImage: "doc.text.magnifyingglass")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(NomiSecondaryButtonStyle())
            }

            if let exportMessage {
                Text(exportMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.green)
            }
        }
        .padding(16)
        .background(.white.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { memoryStore.errorMessage != nil },
            set: { if !$0 { memoryStore.errorMessage = nil } }
        )
    }

    private var exportErrorBinding: Binding<Bool> {
        Binding(
            get: { exportErrorMessage != nil },
            set: { if !$0 { exportErrorMessage = nil } }
        )
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        draft.tags = tagText.nomiTags
        if await memoryStore.update(draft) {
            dismiss()
        }
    }

    private func deleteMemory() async {
        isDeleting = true
        defer { isDeleting = false }

        if await memoryStore.delete(draft) {
            dismiss()
        }
    }

    private func currentExportMemory() -> NomiMemory {
        var memory = draft
        memory.tags = tagText.nomiTags
        return memory
    }

    private func exportAsObsidianNote() {
        do {
            let memory = currentExportMemory()
            let markdown = MarkdownExporter.makeMarkdown(from: memory)
            let fileURL = try MarkdownExporter.writeMarkdownFile(
                markdown: markdown,
                title: memory.title
            )
            exportedFileURL = fileURL
            exportMessage = "Markdown file ready to share."
            isShowingShareSheet = true
        } catch {
            exportErrorMessage = error.localizedDescription
        }
    }

    private func copyMarkdown() {
        let markdown = MarkdownExporter.makeMarkdown(from: currentExportMemory())
        UIPasteboard.general.string = markdown
        exportMessage = "Markdown copied."
    }

    private func previewMarkdown() {
        markdownPreview = MarkdownExporter.makeMarkdown(from: currentExportMemory())
        isShowingMarkdownPreview = true
    }
}

private struct MemoryMediaSection: View {
    let title: String
    let media: [NomiMemoryMedia]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(media) { item in
                        MemoryMediaCard(item: item)
                    }
                }
            }
        }
    }
}

private struct MemoryMediaCard: View {
    let item: NomiMemoryMedia

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.white.opacity(0.75))

                if let videoURL = item.bestVideoURL,
                   item.type == "video" || item.type == "animated_gif" {
                    VideoPlayer(player: AVPlayer(url: videoURL))
                        .frame(width: 188, height: 132)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                } else if let imageURL = item.bestDisplayURL {
                    AsyncImage(url: imageURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            Image(systemName: "photo")
                                .font(.title2)
                                .foregroundStyle(.secondary)
                        case .empty:
                            ProgressView()
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(width: 188, height: 132)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                } else {
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }

                if item.bestVideoURL == nil && (item.type == "video" || item.type == "animated_gif") {
                    Image(systemName: item.type == "animated_gif" ? "livephoto" : "play.circle.fill")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                        .shadow(radius: 8)
                }
            }
            .frame(width: 188, height: 132)

            HStack(spacing: 6) {
                Text(item.type == "animated_gif" ? "GIF" : item.type.capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                if let videoURL = item.bestVideoURL {
                    Link("Open video", destination: videoURL)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.pink)
                } else if let sourceURL = item.url {
                    Link("Open", destination: sourceURL)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.pink)
                }
            }
        }
        .frame(width: 188, alignment: .leading)
    }
}

private struct MemoryLinksSection: View {
    let title: String
    let links: [NomiMemoryLink]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)

            ForEach(links) { link in
                if let url = link.url {
                    Link(destination: url) {
                        HStack(spacing: 12) {
                            Image(systemName: "link")
                                .font(.headline)
                                .foregroundStyle(.pink)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(link.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? link.title! : (link.displayUrl ?? url.host ?? url.absoluteString))
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Text(link.displayUrl ?? url.absoluteString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                        }
                        .padding(12)
                        .background(.white.opacity(0.86))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
    }
}

private struct ReferencedPostCard: View {
    let post: NomiReferencedPost

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(label)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.pink)
                Spacer()
                if let url = post.url {
                    Link("Open", destination: url)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.pink)
                }
            }

            if let username = post.username {
                Text(username)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(post.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? post.text! : "No post text returned.")
                .font(.body)
                .foregroundStyle(.primary)
                .lineLimit(8)

            if !post.media.isEmpty {
                MemoryMediaSection(title: "Post media", media: post.media)
            }

            if !post.links.isEmpty {
                MemoryLinksSection(title: "Post links", links: post.links)
            }
        }
        .padding(14)
        .background(.white.opacity(0.86))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var label: String {
        switch post.referenceType {
        case "quoted": "Quoted post"
        case "retweeted": "Repost"
        case "replied_to": "Reply"
        default: "Referenced post"
        }
    }
}
