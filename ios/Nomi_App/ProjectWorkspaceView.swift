import SwiftUI

// MARK: - Project Workspace
//
// A project opens into an AI-assisted thinking space, not a static page:
// Pulse (state + next step + resume) → section rail (Vision / Inbox / Ideas /
// Questions / Decisions / Experiments / Tasks / Memories) → Brainstorm.
//
// Architecture notes (deliberate reuse, no new backend):
// - Workspace objects (Idea/Question/Decision/Experiment/Task) ARE memories,
//   tagged with a kind tag and linked to the project — they flow through the
//   existing capture/retrieval/AI pipeline like everything else in Nomi.
// - Brainstorm answers come from the existing project-scoped brain query
//   (`askMemories(question:projectId:)`); the THREAD persists locally per
//   project, while anything saved from it becomes a permanent memory object.
// - AI intelligence reuses NomiProjectAI (summary/mainThemes/openQuestions/
//   nextActions/suggestedMemoryIds) from the existing generateSummary flow.

// MARK: Object kinds

enum WorkspaceObjectKind: String, CaseIterable, Identifiable {
    case idea
    case question
    case decision
    case experiment
    case task

    var id: String { rawValue }

    var title: String {
        switch self {
        case .idea: "Idea"
        case .question: "Question"
        case .decision: "Decision"
        case .experiment: "Experiment"
        case .task: "Task"
        }
    }

    var plural: String {
        switch self {
        case .idea: "Ideas"
        case .question: "Questions"
        case .decision: "Decisions"
        case .experiment: "Experiments"
        case .task: "Tasks"
        }
    }

    var icon: String {
        switch self {
        case .idea: "lightbulb"
        case .question: "questionmark.circle"
        case .decision: "checkmark.seal"
        case .experiment: "testtube.2"
        case .task: "circle.inset.filled"
        }
    }

    /// The tag that marks a linked memory as this kind of workspace object.
    var tag: String { rawValue }

    static func kind(of memory: NomiMemory) -> WorkspaceObjectKind? {
        let tags = Set(memory.tags.map { $0.lowercased() })
        return WorkspaceObjectKind.allCases.first { tags.contains($0.tag) }
    }
}

// MARK: Sections

enum WorkspaceSection: String, CaseIterable, Identifiable {
    case vision
    case inbox
    case ideas
    case questions
    case decisions
    case experiments
    case tasks
    case memories

    var id: String { rawValue }

    var title: String {
        switch self {
        case .vision: "Vision"
        case .inbox: "Inbox"
        case .ideas: "Ideas"
        case .questions: "Questions"
        case .decisions: "Decisions"
        case .experiments: "Experiments"
        case .tasks: "Tasks"
        case .memories: "Memories"
        }
    }

    var icon: String {
        switch self {
        case .vision: "scope"
        case .inbox: "tray.and.arrow.down"
        case .ideas: "lightbulb"
        case .questions: "questionmark.circle"
        case .decisions: "checkmark.seal"
        case .experiments: "testtube.2"
        case .tasks: "checklist"
        case .memories: "square.on.square"
        }
    }

    var objectKind: WorkspaceObjectKind? {
        switch self {
        case .ideas: .idea
        case .questions: .question
        case .decisions: .decision
        case .experiments: .experiment
        case .tasks: .task
        default: nil
        }
    }
}

// MARK: Brainstorm persistence (thread is local; saved objects are memories)

struct BrainstormMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable { case user, nomi }
    let id: UUID
    let role: Role
    let text: String
    let date: Date
    var savedAsKind: String?
}

@MainActor
final class BrainstormStore: ObservableObject {
    @Published private(set) var messages: [BrainstormMessage] = []
    private let projectId: String

    init(projectId: String) {
        self.projectId = projectId
        messages = (try? JSONDecoder().decode([BrainstormMessage].self, from: Data(contentsOf: fileURL))) ?? []
    }

    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NomiBrainstorm", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(projectId).json")
    }

    func append(_ message: BrainstormMessage) {
        messages.append(message)
        persist()
    }

    func markSaved(_ id: UUID, kind: WorkspaceObjectKind) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        messages[index].savedAsKind = kind.rawValue
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(messages) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}

// MARK: - Workspace screen

struct ProjectWorkspaceView: View {
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @EnvironmentObject private var appSession: AppSession

    @State private var project: NomiProject
    @State private var section: WorkspaceSection = .vision
    @State private var isShowingBrainstorm = false
    @State private var isShowingResume = false
    @State private var isEditing = false
    @State private var composerKind: WorkspaceObjectKind?
    @State private var openedMemory: NomiMemory?
    @State private var dismissedSuggestionIds: Set<String> = []
    @State private var isGeneratingInsights = false

    init(project: NomiProject) {
        _project = State(initialValue: project)
    }

    // MARK: Derived data

    private var linkedMemories: [NomiMemory] {
        let ids = Set(project.memoryIds ?? [])
        return memoryStore.memories
            .filter { ids.contains($0.id) }
            .sorted { $0.capturedAt > $1.capturedAt }
    }

    private func objects(of kind: WorkspaceObjectKind) -> [NomiMemory] {
        linkedMemories.filter { WorkspaceObjectKind.kind(of: $0) == kind }
    }

    private var plainMemories: [NomiMemory] {
        linkedMemories.filter { WorkspaceObjectKind.kind(of: $0) == nil }
    }

    /// Suggested memories with the REASON they were suggested — shared tags,
    /// shared concepts, an entity naming the project, or the AI's own pick.
    private var inboxSuggestions: [(memory: NomiMemory, why: String)] {
        let linkedIds = Set(project.memoryIds ?? [])
        let tagKeys = Set((project.tags ?? []).map { $0.lowercased() })
        let conceptKeys = Set((project.concepts ?? []).map { $0.lowercased() })
        let aiPicks = Set(project.ai?.suggestedMemoryIds ?? [])

        return memoryStore.memories
            .filter { !linkedIds.contains($0.id) && !$0.isArchived && !dismissedSuggestionIds.contains($0.id) }
            .compactMap { memory in
                var reasons: [String] = []
                let sharedTags = memory.tags.filter { tagKeys.contains($0.lowercased()) }
                if !sharedTags.isEmpty { reasons.append("shares #\(sharedTags[0])") }
                let sharedConcepts = memory.concepts.filter { conceptKeys.contains($0.lowercased()) }
                if !sharedConcepts.isEmpty { reasons.append("mentions \(sharedConcepts[0])") }
                if memory.entities.contains(where: { $0.caseInsensitiveCompare(project.name) == .orderedSame }) {
                    reasons.append("names \(project.name)")
                }
                if memory.ai?.suggestedProjects.contains(where: { $0.caseInsensitiveCompare(project.name) == .orderedSame }) == true {
                    reasons.append("Nomi filed it under \(project.name)")
                }
                if aiPicks.contains(memory.id) {
                    reasons.append("picked by Nomi's project summary")
                }
                guard !reasons.isEmpty else { return nil }
                return (memory, "Suggested because it \(reasons.prefix(2).joined(separator: " and "))")
            }
            .prefix(8)
            .map { $0 }
    }

    private var lastActivity: Date? { linkedMemories.first?.capturedAt }

    private var nextStep: String? {
        project.ai?.nextActions?.first
            ?? (objects(of: .question).first.map { "Answer the open question: \($0.title)" })
    }

    // MARK: Body

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    pulseCard
                    sectionRail
                    sectionContent
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
                    Button { isShowingBrainstorm = true } label: {
                        Label("Brainstorm with Nomi", systemImage: "bubble.left.and.sparkles")
                    }
                    Button { isEditing = true } label: {
                        Label("Edit Project", systemImage: "pencil")
                    }
                    Button {
                        Task { await generateInsights(force: true) }
                    } label: {
                        Label("Refresh Insights", systemImage: "sparkles")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $isShowingBrainstorm) {
            BrainstormSheet(project: project) { savedKind in
                // Saved objects land as linked memories; jump to their section.
                if let target = WorkspaceSection.allCases.first(where: { $0.objectKind == savedKind }) {
                    section = target
                }
            }
        }
        .sheet(isPresented: $isShowingResume) {
            ResumeSheet(
                project: project,
                linkedMemories: linkedMemories,
                openQuestions: project.ai?.openQuestions ?? [],
                questionObjects: objects(of: .question),
                nextStep: nextStep,
                onBrainstorm: {
                    isShowingResume = false
                    isShowingBrainstorm = true
                }
            )
        }
        .sheet(isPresented: $isEditing) {
            ProjectEditorView(project: project)
        }
        .sheet(item: $composerKind) { kind in
            WorkspaceComposerSheet(project: project, kind: kind)
        }
        .navigationDestination(item: $openedMemory) { memory in
            MemoryDetailView(memory: memory)
        }
        .task {
            if intelligenceStore.projects.isEmpty { await intelligenceStore.loadProjects() }
            // Keep the local copy fresh (memoryIds move as things get assigned).
            if let fresh = intelligenceStore.projects.first(where: { $0.id == project.id }) {
                project = fresh
            }
            await generateInsights(force: false)
        }
        .onChange(of: intelligenceStore.projects) { _, updated in
            if let fresh = updated.first(where: { $0.id == project.id }) {
                project = fresh
            }
        }
    }

    private func generateInsights(force: Bool) async {
        guard force || project.ai?.summary == nil else { return }
        isGeneratingInsights = true
        defer { isGeneratingInsights = false }
        if let updated = await intelligenceStore.generateSummary(for: project, forceRegenerate: force) {
            project = updated
        }
    }

    // MARK: Pulse

    private var pulseCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Project Pulse", systemImage: "waveform.path.ecg")
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(Color.nomiPurple)
                Spacer()
                Text(project.status.capitalized)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(Color.nomiPurple)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 9)
                    .background(Color.nomiPurple.opacity(0.14), in: Capsule())
            }

            if let objective = project.description, !objective.isEmpty {
                Text(objective)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(3)
            } else {
                Text("No objective yet — describe what this project is trying to become.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            }

            HStack(spacing: 14) {
                pulseStat("\(linkedMemories.count)", "linked")
                pulseStat("\(objects(of: .task).count)", "tasks")
                pulseStat("\(objects(of: .question).count)", "open Qs")
                if let lastActivity {
                    pulseStat(lastActivity.formatted(.relative(presentation: .named)), "last activity")
                }
            }

            if let nextStep {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.caption.weight(.black))
                        .foregroundStyle(Color.nomiOrange)
                        .padding(.top, 2)
                    Text(nextStep)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(3)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.nomiOrange.opacity(colorScheme == .dark ? 0.10 : 0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else if isGeneratingInsights {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Nomi is reading the project…")
                        .font(.footnote)
                        .foregroundStyle(Color.nomiMuted)
                }
            }

            HStack(spacing: 10) {
                Button {
                    isShowingResume = true
                } label: {
                    Label("Continue", systemImage: "arrow.forward.circle.fill")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(Color.nomiPurple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button {
                    isShowingBrainstorm = true
                } label: {
                    Label("Brainstorm", systemImage: "bubble.left.and.sparkles")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(Color.nomiPurple.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(Color.nomiPurple)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func pulseStat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.nomiInk)
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.nomiMuted)
        }
    }

    // MARK: Section rail

    private var sectionRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(WorkspaceSection.allCases) { candidate in
                    let count = badgeCount(for: candidate)
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) { section = candidate }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: candidate.icon)
                                .font(.caption.weight(.bold))
                            Text(candidate.title)
                                .font(.caption.weight(.black))
                            if count > 0 {
                                Text("\(count)")
                                    .font(.caption2.weight(.black))
                                    .foregroundStyle(section == candidate ? Color.nomiPurple : .white)
                                    .padding(.vertical, 1)
                                    .padding(.horizontal, 5)
                                    .background(section == candidate ? .white : Color.nomiPurple.opacity(0.55), in: Capsule())
                            }
                        }
                        .foregroundStyle(section == candidate ? .white : Color.nomiInk)
                        .padding(.vertical, 9)
                        .padding(.horizontal, 12)
                        .background(section == candidate ? Color.nomiPurple : Color.nomiCard, in: Capsule())
                        .overlay(Capsule().stroke(section == candidate ? Color.clear : Color.nomiStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func badgeCount(for section: WorkspaceSection) -> Int {
        switch section {
        case .vision: 0
        case .inbox: inboxSuggestions.count
        case .memories: plainMemories.count
        default: section.objectKind.map { objects(of: $0).count } ?? 0
        }
    }

    // MARK: Section content

    @ViewBuilder
    private var sectionContent: some View {
        switch section {
        case .vision: visionSection
        case .inbox: inboxSection
        case .memories: memoriesSection
        default:
            if let kind = section.objectKind {
                objectSection(kind)
            }
        }
    }

    private var visionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let summary = project.ai?.summary, !summary.isEmpty {
                workspaceCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Nomi's read", systemImage: "sparkles")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.nomiPurple)
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(Color.nomiInk)
                    }
                }
            }

            if let themes = project.ai?.mainThemes, !themes.isEmpty {
                workspaceCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Main themes")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.nomiMuted)
                        FlowLayout(items: themes) { theme in
                            Text(theme)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.nomiPurple)
                                .padding(.vertical, 5)
                                .padding(.horizontal, 10)
                                .background(Color.nomiPurple.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }

            if let questions = project.ai?.openQuestions, !questions.isEmpty {
                workspaceCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Open questions from Nomi")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.nomiMuted)
                        ForEach(questions.prefix(4), id: \.self) { question in
                            HStack(alignment: .top, spacing: 7) {
                                Image(systemName: "questionmark.circle")
                                    .font(.caption)
                                    .foregroundStyle(Color.nomiOrange)
                                    .padding(.top, 2)
                                Text(question)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.nomiInk)
                            }
                        }
                    }
                }
            }

            if project.ai?.summary == nil {
                Button {
                    Task { await generateInsights(force: true) }
                } label: {
                    Label(isGeneratingInsights ? "Reading the project…" : "Generate Nomi's read", systemImage: "sparkles")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.nomiPurple.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(Color.nomiPurple)
                }
                .buttonStyle(.plain)
                .disabled(isGeneratingInsights)
            }
        }
    }

    private var inboxSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if inboxSuggestions.isEmpty {
                emptySection("Inbox zero", "Nomi will drop related memories here as you capture more.")
            } else {
                ForEach(inboxSuggestions, id: \.memory.id) { suggestion in
                    workspaceCard {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(suggestion.memory.title)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Color.nomiInk)
                                    .lineLimit(2)
                                Spacer()
                                Text(suggestion.memory.displayDate)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(Color.nomiMuted)
                            }

                            Text(suggestion.why)
                                .font(.caption)
                                .foregroundStyle(Color.nomiPurple)

                            HStack(spacing: 10) {
                                Button {
                                    Task { _ = await intelligenceStore.assign(memory: suggestion.memory, to: project) }
                                } label: {
                                    Label("Add", systemImage: "plus.circle.fill")
                                        .font(.caption.weight(.black))
                                        .foregroundStyle(Color.nomiPurple)
                                }
                                Button {
                                    dismissedSuggestionIds.insert(suggestion.memory.id)
                                } label: {
                                    Text("Not now")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(Color.nomiMuted)
                                }
                                Spacer()
                                Button {
                                    openedMemory = suggestion.memory
                                } label: {
                                    Image(systemName: "arrow.up.right")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(Color.nomiMuted)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func objectSection(_ kind: WorkspaceObjectKind) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                composerKind = kind
            } label: {
                Label("New \(kind.title.lowercased())", systemImage: "plus")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiPurple)
            }
            .buttonStyle(.plain)
            .padding(.leading, 2)

            let items = objects(of: kind)
            if items.isEmpty {
                emptySection("No \(kind.plural.lowercased()) yet", "Capture one here, or save one from a Brainstorm.")
            } else {
                ForEach(items) { memory in
                    workspaceCard {
                        HStack(alignment: .top, spacing: 10) {
                            if kind == .task {
                                Button {
                                    Task { await toggleDone(memory) }
                                } label: {
                                    Image(systemName: isDone(memory) ? "checkmark.circle.fill" : "circle")
                                        .font(.title3)
                                        .foregroundStyle(isDone(memory) ? Color.nomiPurple : Color.nomiMuted)
                                }
                                .buttonStyle(.plain)
                            } else {
                                Image(systemName: kind.icon)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Color.nomiPurple)
                                    .padding(.top, 2)
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text(memory.title)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Color.nomiInk)
                                    .strikethrough(kind == .task && isDone(memory), color: Color.nomiMuted)
                                if !memory.previewText.isEmpty {
                                    Text(memory.previewText)
                                        .font(.caption)
                                        .foregroundStyle(Color.nomiMuted)
                                        .lineLimit(2)
                                }
                            }

                            Spacer()

                            Button {
                                openedMemory = memory
                            } label: {
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.black))
                                    .foregroundStyle(Color.nomiMuted)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var memoriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if plainMemories.isEmpty {
                emptySection("Nothing linked yet", "Add memories from the Inbox or any memory's ⋯ menu.")
            } else {
                ForEach(plainMemories) { memory in
                    Button {
                        openedMemory = memory
                    } label: {
                        workspaceCard {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(memory.title)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Color.nomiInk)
                                        .lineLimit(2)
                                    if !memory.previewText.isEmpty {
                                        Text(memory.previewText)
                                            .font(.caption)
                                            .foregroundStyle(Color.nomiMuted)
                                            .lineLimit(2)
                                    }
                                }
                                Spacer()
                                Text(memory.displayDate)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(Color.nomiMuted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: Task done-toggle (a "done" tag, so state survives in the memory)

    private func isDone(_ memory: NomiMemory) -> Bool {
        memory.tags.contains { $0.lowercased() == "done" }
    }

    private func toggleDone(_ memory: NomiMemory) async {
        _ = await memoryStore.updateMemory(memory) { draft in
            if isDone(draft) {
                draft.tags.removeAll { $0.lowercased() == "done" }
            } else {
                draft.tags.append("done")
            }
        }
    }

    // MARK: Small helpers

    private func workspaceCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func emptySection(_ title: String, _ message: String) -> some View {
        EmptyStateView(title: title, message: message)
    }
}

// MARK: - Composer (new workspace object)

private struct WorkspaceComposerSheet: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @EnvironmentObject private var appSession: AppSession
    @Environment(\.dismiss) private var dismiss

    let project: NomiProject
    let kind: WorkspaceObjectKind

    @State private var text = ""
    @State private var isSaving = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                TextField("Describe the \(kind.title.lowercased())…", text: $text, axis: .vertical)
                    .lineLimit(4...10)
                    .nomiTextField()
                Spacer()
            }
            .padding(18)
            .background(NomiBackground())
            .navigationTitle("New \(kind.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isSaving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .alert("Could not save", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorText ?? "Something went wrong.")
            }
        }
    }

    private func save() async {
        guard let userId = appSession.user?.uid else { return }
        isSaving = true
        defer { isSaving = false }
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = body.components(separatedBy: .newlines).first.map { String($0.prefix(80)) } ?? kind.title
        guard let memoryId = await memoryStore.create(
            userId: userId,
            title: title,
            content: body,
            category: "Projects",
            tags: [kind.tag, project.name],
            sourceURL: nil,
            type: "note"
        ) else {
            errorText = memoryStore.errorMessage ?? "Nomi could not reach the backend."
            return
        }
        let assigned = await intelligenceStore.assign(memoryId: memoryId, to: project)
        if assigned { dismiss() } else {
            errorText = intelligenceStore.errorMessage ?? "Saved the \(kind.title.lowercased()) but could not link it — find it in Recall."
        }
    }
}

// MARK: - Brainstorm

private struct BrainstormSheet: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @EnvironmentObject private var appSession: AppSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let project: NomiProject
    var onSaved: (WorkspaceObjectKind) -> Void = { _ in }

    @StateObject private var thread: BrainstormStore
    @State private var draft = ""
    @State private var isThinking = false
    @State private var saveNotice: String?

    private let backendService = XBackendService()

    init(project: NomiProject, onSaved: @escaping (WorkspaceObjectKind) -> Void = { _ in }) {
        self.project = project
        self.onSaved = onSaved
        _thread = StateObject(wrappedValue: BrainstormStore(projectId: project.id))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 0) {
                    ScrollViewReader { proxy in
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 12) {
                                if thread.messages.isEmpty {
                                    EmptyStateView(
                                        title: "Think out loud with Nomi",
                                        message: "Nomi answers from this project's memories. Save the good parts as ideas, decisions, questions, experiments, or tasks — they become part of the project, not chat history."
                                    )
                                    .padding(.top, 24)
                                }
                                ForEach(thread.messages) { message in
                                    messageBubble(message)
                                        .id(message.id)
                                }
                                if isThinking {
                                    HStack {
                                        ProgressView().controlSize(.small)
                                        Text("Nomi is thinking…")
                                            .font(.caption)
                                            .foregroundStyle(Color.nomiMuted)
                                        Spacer()
                                    }
                                    .padding(.horizontal, 4)
                                }
                            }
                            .padding(16)
                        }
                        .onChange(of: thread.messages) { _, messages in
                            if let last = messages.last {
                                withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                            }
                        }
                    }

                    composer
                }
            }
            .navigationTitle("Brainstorm")
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
                }
            }
            .presentationDragIndicator(.visible)
            .overlay(alignment: .top) {
                if let saveNotice {
                    Text(saveNotice)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 14)
                        .background(Color.nomiPurple, in: Capsule())
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }

    private func messageBubble(_ message: BrainstormMessage) -> some View {
        VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
            Text(message.text)
                .font(.subheadline)
                .foregroundStyle(message.role == .user ? .white : Color.nomiInk)
                .padding(12)
                .background(
                    message.role == .user ? Color.nomiPurple : Color.nomiCardStrong,
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(message.role == .user ? Color.clear : Color.nomiStroke, lineWidth: 1)
                )

            if message.role == .nomi {
                if let saved = message.savedAsKind, let kind = WorkspaceObjectKind(rawValue: saved) {
                    Label("Saved as \(kind.title)", systemImage: "checkmark.circle.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.nomiPurple)
                } else {
                    Menu {
                        ForEach(WorkspaceObjectKind.allCases) { kind in
                            Button {
                                Task { await saveMessage(message, as: kind) }
                            } label: {
                                Label(kind.title, systemImage: kind.icon)
                            }
                        }
                    } label: {
                        Label("Save as…", systemImage: "tray.and.arrow.down")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.nomiPurple)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Ask or think out loud…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .nomiTextField()

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.nomiMuted : Color.nomiPurple)
            }
            .buttonStyle(.plain)
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isThinking)
        }
        .padding(12)
        .background(.thinMaterial)
    }

    private func send() async {
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        draft = ""
        thread.append(BrainstormMessage(id: UUID(), role: .user, text: question, date: .now, savedAsKind: nil))
        isThinking = true
        defer { isThinking = false }
        do {
            let response = try await backendService.askMemories(question: question, projectId: project.id, allowGlobalFallback: true)
            thread.append(BrainstormMessage(id: UUID(), role: .nomi, text: response.answer, date: .now, savedAsKind: nil))
        } catch {
            thread.append(BrainstormMessage(id: UUID(), role: .nomi, text: "I couldn't reach the backend just now — try again in a moment. (\(error.localizedDescription))", date: .now, savedAsKind: nil))
        }
    }

    private func saveMessage(_ message: BrainstormMessage, as kind: WorkspaceObjectKind) async {
        guard let userId = appSession.user?.uid else { return }
        let title = message.text.components(separatedBy: .newlines).first.map { String($0.prefix(80)) } ?? kind.title
        guard let memoryId = await memoryStore.create(
            userId: userId,
            title: title,
            content: message.text,
            category: "Projects",
            tags: [kind.tag, "brainstorm", project.name],
            sourceURL: nil,
            type: "note"
        ) else { return }
        let assigned = await intelligenceStore.assign(memoryId: memoryId, to: project)
        if assigned {
            thread.markSaved(message.id, kind: kind)
            onSaved(kind)
            withAnimation { saveNotice = "Saved as \(kind.title)" }
            try? await Task.sleep(for: .seconds(2))
            withAnimation { saveNotice = nil }
        }
    }
}

// MARK: - Resume ("continue where you left off")

private struct ResumeSheet: View {
    @Environment(\.dismiss) private var dismiss

    let project: NomiProject
    let linkedMemories: [NomiMemory]
    let openQuestions: [String]
    let questionObjects: [NomiMemory]
    let nextStep: String?
    var onBrainstorm: () -> Void = {}

    @AppStorage private var lastVisitTimestamp: Double

    init(
        project: NomiProject,
        linkedMemories: [NomiMemory],
        openQuestions: [String],
        questionObjects: [NomiMemory],
        nextStep: String?,
        onBrainstorm: @escaping () -> Void = {}
    ) {
        self.project = project
        self.linkedMemories = linkedMemories
        self.openQuestions = openQuestions
        self.questionObjects = questionObjects
        self.nextStep = nextStep
        self.onBrainstorm = onBrainstorm
        _lastVisitTimestamp = AppStorage(wrappedValue: 0, "nomi.projectLastVisit.\(project.id)")
    }

    private var lastVisit: Date? {
        lastVisitTimestamp > 0 ? Date(timeIntervalSince1970: lastVisitTimestamp) : nil
    }

    private var newSinceLastVisit: [NomiMemory] {
        guard let lastVisit else { return [] }
        return linkedMemories.filter { $0.capturedAt > lastVisit }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        // What changed
                        resumeCard("What changed", icon: "clock.arrow.circlepath") {
                            if let lastVisit {
                                if newSinceLastVisit.isEmpty {
                                    Text("Nothing new since \(lastVisit.formatted(.relative(presentation: .named))). Pick up where you stopped.")
                                } else {
                                    Text("\(newSinceLastVisit.count) new \(newSinceLastVisit.count == 1 ? "memory" : "memories") linked since \(lastVisit.formatted(.relative(presentation: .named))):")
                                    ForEach(newSinceLastVisit.prefix(3)) { memory in
                                        Text("• \(memory.title)").lineLimit(1)
                                    }
                                }
                            } else {
                                Text("First session in this workspace — Nomi will track changes from here.")
                            }
                        }

                        // Recent memories
                        if !linkedMemories.isEmpty {
                            resumeCard("Recent in this project", icon: "square.on.square") {
                                ForEach(linkedMemories.prefix(3)) { memory in
                                    HStack {
                                        Text(memory.title).lineLimit(1)
                                        Spacer()
                                        Text(memory.displayDate)
                                            .foregroundStyle(Color.nomiMuted)
                                    }
                                }
                            }
                        }

                        // Unfinished questions
                        if !openQuestions.isEmpty || !questionObjects.isEmpty {
                            resumeCard("Unfinished questions", icon: "questionmark.circle") {
                                ForEach(questionObjects.prefix(2)) { question in
                                    Text("• \(question.title)").lineLimit(2)
                                }
                                ForEach(openQuestions.prefix(2), id: \.self) { question in
                                    Text("• \(question)").lineLimit(2)
                                }
                            }
                        }

                        // Recommended next action
                        if let nextStep {
                            resumeCard("Recommended next step", icon: "sparkles") {
                                Text(nextStep)
                            }
                        }

                        Button {
                            dismiss()
                            onBrainstorm()
                        } label: {
                            Label("Pick it up in a Brainstorm", systemImage: "bubble.left.and.sparkles")
                                .font(.subheadline.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 13)
                                .background(Color.nomiPurple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Continue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .presentationDragIndicator(.visible)
            .onDisappear {
                lastVisitTimestamp = Date.now.timeIntervalSince1970
            }
        }
    }

    private func resumeCard<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.nomiPurple)
            content()
                .font(.subheadline)
                .foregroundStyle(Color.nomiInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}
