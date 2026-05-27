import SwiftUI

struct ProjectsView: View {
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.dismiss) private var dismiss
    @State private var isCreating = false
    var showsCloseButton = false

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                Group {
                    if intelligenceStore.isLoadingProjects && intelligenceStore.projects.isEmpty {
                        ProgressView()
                    } else if intelligenceStore.projects.isEmpty {
                        EmptyStateView(
                            title: "No projects yet",
                            message: "Create a project to gather memories around a launch, research thread, or idea."
                        )
                        .padding()
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(intelligenceStore.projects) { project in
                                    NavigationLink(value: project) {
                                        ProjectCard(project: project)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(18)
                            .padding(.bottom, 96)
                        }
                    }
                }
            }
            .navigationTitle("Projects")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if showsCloseButton {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.headline.weight(.bold))
                        }
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isCreating = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $isCreating) {
                ProjectEditorView(project: nil)
                    .environmentObject(intelligenceStore)
            }
            .navigationDestination(for: NomiProject.self) { project in
                ProjectDetailView(project: project)
            }
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
            .task {
                await intelligenceStore.loadProjects()
            }
            .refreshable {
                await intelligenceStore.loadProjects()
            }
        }
    }
}

private struct ProjectCard: View {
    let project: NomiProject

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label(project.name, systemImage: project.icon ?? "folder.fill")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)
                Spacer()
                Text(project.status.capitalized)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiPink)
            }

            if let description = project.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
            }

            Text("\(project.memoryIds?.count ?? 0) linked memories")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
        }
        .padding(16)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

struct ProjectEditorView: View {
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.dismiss) private var dismiss
    let project: NomiProject?

    @State private var name: String
    @State private var description: String
    @State private var tags: String
    @State private var concepts: String
    @State private var isSaving = false

    init(project: NomiProject?) {
        self.project = project
        _name = State(initialValue: project?.name ?? "")
        _description = State(initialValue: project?.description ?? "")
        _tags = State(initialValue: (project?.tags ?? []).joined(separator: ", "))
        _concepts = State(initialValue: (project?.concepts ?? []).joined(separator: ", "))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Name", text: $name)
                    TextField("Description", text: $description, axis: .vertical)
                    TextField("Tags", text: $tags)
                    TextField("Concepts", text: $concepts)
                }
            }
            .navigationTitle(project == nil ? "New Project" : "Edit Project")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isSaving ? "Saving" : "Save") {
                        Task { await save() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let tagValues = tags.nomiTags
        let conceptValues = concepts.nomiTags
        let ok: Bool
        if let project {
            ok = await intelligenceStore.updateProject(
                project,
                name: name,
                description: description,
                status: nil,
                tags: tagValues,
                concepts: conceptValues
            )
        } else {
            ok = await intelligenceStore.createProject(name: name, description: description, tags: tagValues, concepts: conceptValues)
        }
        if ok { dismiss() }
    }
}

struct ProjectDetailView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.dismiss) private var dismiss
    @State private var project: NomiProject
    @State private var isEditing = false
    @State private var isConfirmingArchive = false
    @State private var isShowingAskNomi = false

    init(project: NomiProject) {
        _project = State(initialValue: project)
    }

    private var linkedMemories: [NomiMemory] {
        let ids = Set(project.memoryIds ?? [])
        return memoryStore.memories.filter { ids.contains($0.id) }
    }

    private var suggestedMemories: [NomiMemory] {
        let linkedIds = Set(project.memoryIds ?? [])
        let tagKeys = Set((project.tags ?? []).map { $0.lowercased() })
        let conceptKeys = Set((project.concepts ?? []).map { $0.lowercased() })
        return memoryStore.memories
            .filter { !linkedIds.contains($0.id) && !$0.isArchived }
            .filter { memory in
                memory.tags.contains { tagKeys.contains($0.lowercased()) } ||
                    memory.concepts.contains { conceptKeys.contains($0.lowercased()) } ||
                    memory.entities.contains { $0.caseInsensitiveCompare(project.name) == .orderedSame } ||
                    memory.ai?.suggestedProjects.contains { $0.caseInsensitiveCompare(project.name) == .orderedSame } == true
            }
            .prefix(8)
            .map { $0 }
    }

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    headerCard
                    aiSection
                    memoriesSection
                    suggestionsSection
                }
                .padding(18)
                .padding(.bottom, 96)
            }
        }
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        isShowingAskNomi = true
                    } label: {
                        Label("Ask Nomi", systemImage: "sparkles")
                    }
                    Button("Edit") { isEditing = true }
                    Button("Generate summary") {
                        Task {
                            if let updated = await intelligenceStore.generateSummary(for: project, forceRegenerate: true) {
                                project = updated
                            }
                        }
                    }
                    Button("Archive", role: .destructive) { isConfirmingArchive = true }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $isEditing) {
            ProjectEditorView(project: project)
                .environmentObject(intelligenceStore)
        }
        .sheet(isPresented: $isShowingAskNomi) {
            AskNomiSheet(project: project)
                .environmentObject(memoryStore)
        }
        .confirmationDialog("Archive this project?", isPresented: $isConfirmingArchive) {
            Button("Archive project", role: .destructive) {
                Task {
                    if await intelligenceStore.archiveProject(project) {
                        dismiss()
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.name)
                .font(.system(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)
            if let description = project.description, !description.isEmpty {
                Text(description)
                    .foregroundStyle(Color.nomiMuted)
            }
            Text("\(linkedMemories.count) linked memories")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiPink)
        }
        .projectCard()
    }

    private var aiSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Project summary")
                .font(.headline.bold())
            Text(project.ai?.summary ?? project.summary ?? "Generate a summary after linking a few memories.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
            ForEach(project.ai?.nextActions ?? [], id: \.self) { action in
                Label(action, systemImage: "checkmark.circle")
                    .font(.caption)
            }
        }
        .projectCard()
    }

    private var memoriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Linked memories")
                .font(.headline.bold())
            if linkedMemories.isEmpty {
                Text("No memories linked yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                ForEach(linkedMemories) { memory in
                    NavigationLink(value: memory) {
                        MemoryCardView(memory: memory)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Suggested memories")
                .font(.headline.bold())
            if suggestedMemories.isEmpty {
                Text("Suggestions appear when tags, concepts, entities, or AI suggested projects overlap.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                ForEach(suggestedMemories) { memory in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(memory.title)
                                .font(.subheadline.bold())
                            Text(memory.previewText)
                                .font(.caption)
                                .foregroundStyle(Color.nomiMuted)
                                .lineLimit(2)
                        }
                        Spacer()
                        Button("Add") {
                            Task {
                                if await intelligenceStore.assign(memory: memory, to: project) {
                                    project = intelligenceStore.projects.first(where: { $0.id == project.id }) ?? project
                                }
                            }
                        }
                        .font(.caption.bold())
                    }
                    .padding(12)
                    .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
            }
        }
        .projectCard()
    }
}

private extension View {
    func projectCard() -> some View {
        self
            .padding(14)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}
