import SwiftUI

struct MemoryDetailView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: NomiMemory
    @State private var tagText: String
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var isConfirmingDelete = false

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

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { memoryStore.errorMessage != nil },
            set: { if !$0 { memoryStore.errorMessage = nil } }
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
}
