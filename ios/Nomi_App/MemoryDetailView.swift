import SwiftUI
import UIKit

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
