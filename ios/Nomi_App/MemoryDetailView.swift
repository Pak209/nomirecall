import SwiftUI
import UIKit
import AVKit
import WebKit

struct MemoryDetailView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: NomiMemory
    @State private var tagText: String
    @State private var conceptText: String
    @State private var entityText: String
    @State private var summaryText: String
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var isConfirmingDelete = false
    @State private var exportedActivityItems: [URL] = []
    @State private var isShowingShareSheet = false
    @State private var isShowingShareToCircle = false
    @State private var isShowingMarkdownPreview = false
    @State private var markdownPreview = ""
    @State private var exportMessage: String?
    @State private var exportErrorMessage: String?
    @State private var activeSheet: RecallDetailSheet?
    @State private var isOriginalExpanded = false
    @State private var didTikTokPlayerFail = false
    @State private var tiktokPlayerStatus = ""

    init(memory: NomiMemory) {
        _draft = State(initialValue: memory)
        _tagText = State(initialValue: memory.tags.joined(separator: ", "))
        _conceptText = State(initialValue: memory.concepts.joined(separator: ", "))
        _entityText = State(initialValue: memory.entities.joined(separator: ", "))
        _summaryText = State(initialValue: memory.summary ?? "")
    }

    var body: some View {
        ZStack {
            NomiBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    topBar
                    recallSourceIdentityCard
                    originalPostHeroCard
                    if isTikTokMemory {
                        tiktokPlayerCard
                    }
                    nomiTakeawayCard
                    recallQuickActions
                    connectedIdeasPreview
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 108)
            }
        }
        .navigationBarHidden(true)
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
            if !exportedActivityItems.isEmpty {
                ShareSheet(activityItems: exportedActivityItems)
            }
        }
        .sheet(isPresented: $isShowingShareToCircle) {
            ShareToCircleSheet(memoryId: draft.id)
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
        .sheet(item: $activeSheet) { sheet in
            recallSheet(for: sheet)
                .presentationDetents(sheet.detents)
                .presentationDragIndicator(.visible)
        }
        .task {
            if intelligenceStore.projects.isEmpty {
                await intelligenceStore.loadProjects()
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .frame(width: 44, height: 44)
                    .background(Color.nomiCardStrong, in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Spacer()

            Text("Recall")
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            Spacer()

            NavigationLink {
                ConnectedIdeasGraphView(centerMemory: draft, showsBackButton: true)
            } label: {
                Image(systemName: "point.3.connected.trianglepath.dotted")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiPink)
                    .frame(width: 44, height: 44)
                    .background(Color.nomiCardStrong, in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Menu {
                NavigationLink {
                    ConnectedIdeasGraphView(centerMemory: draft, showsBackButton: true)
                } label: {
                    Label("Open idea graph", systemImage: "point.3.connected.trianglepath.dotted")
                }

                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Label(draft.isFavorite ? "Unfavorite" : "Favorite", systemImage: draft.isFavorite ? "heart.slash" : "heart")
                }

                Button {
                    Task { await toggleArchive() }
                } label: {
                    Label(draft.isArchived ? "Unarchive" : "Archive", systemImage: draft.isArchived ? "archivebox.fill" : "archivebox")
                }

                Button {
                    isShowingShareToCircle = true
                } label: {
                    Label("Share to Circle", systemImage: "person.2")
                }

                Button {
                    Task { await save() }
                } label: {
                    Label("Save changes", systemImage: "checkmark")
                }

                Button(role: .destructive) {
                    isConfirmingDelete = true
                } label: {
                    Label("Delete memory", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .frame(width: 44, height: 44)
                    .background(Color.nomiCardStrong, in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private var recallSourceIdentityCard: some View {
        HStack(spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                sourceAvatar
                    .frame(width: 58, height: 58)

                Image(systemName: draft.isFavorite ? "heart.fill" : "heart")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(draft.isFavorite ? Color.nomiPink : Color.nomiMuted, in: Circle())
                    .overlay(Circle().stroke(Color.nomiCardStrong, lineWidth: 2))
                    .offset(x: 3, y: 3)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(sourceHeading)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Text("\(sourceTypeLabel) • Saved \(NomiFormatters.shortDate.string(from: draft.capturedAt))")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }

            Spacer(minLength: 8)

            Button {
                Task { await toggleFavorite() }
            } label: {
                Image(systemName: draft.isFavorite ? "heart.fill" : "heart")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.nomiCoral)
                    .frame(width: 58, height: 58)
                    .background(Color.nomiField, in: Circle())
                    .overlay(Circle().stroke(Color.nomiPink.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .recallCard(cornerRadius: 24)
    }

    private var originalPostHeroCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: sourceIcon)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 9, style: .continuous))

                Text("Original Post")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)

                Spacer()
            }

            Text(originalText)
                .font(.system(size: 30, weight: .regular, design: .rounded))
                .foregroundStyle(Color.nomiInk)
                .lineSpacing(4)
                .lineLimit(isOriginalExpanded ? nil : 6)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            if originalText.count > 220 {
                Button(isOriginalExpanded ? "Show less" : "Read more") {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        isOriginalExpanded.toggle()
                    }
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiPink)
            }

            HStack(alignment: .center) {
                Text(sourceDateLabel)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 12)

                if let sourceURL = draft.sourceURL {
                    Link(destination: sourceURL) {
                        Label("Open Original", systemImage: "arrow.up.right.square")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.nomiPink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .padding(.vertical, 11)
                            .padding(.horizontal, 14)
                            .background(Color.nomiPink.opacity(0.06), in: Capsule())
                            .overlay(Capsule().stroke(Color.nomiPink.opacity(0.22), lineWidth: 1))
                    }
                }
            }
        }
        .padding(16)
        .recallCard(cornerRadius: 24)
    }

    private var tiktokPlayerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "play.rectangle.fill")
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 9, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text("TikTok Player")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                    if let authorName = draft.authorName ?? draft.sourceUsername {
                        Text(authorName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.nomiMuted)
                    }
                    Text(tiktokPlaybackDiagnostic)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                }

                Spacer()
            }

            if let playbackUrl = tiktokPlaybackURL, !didTikTokPlayerFail {
                TikTokPlayerWebView(url: playbackUrl) { status in
                    tiktokPlayerStatus = status
                } onFailure: { status in
                    tiktokPlayerStatus = status
                    didTikTokPlayerFail = true
                }
                .frame(height: 560)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.nomiStroke, lineWidth: 1)
                )
            } else {
                tiktokFallbackPreview
            }

            if !tiktokPlayerStatus.isEmpty {
                Text(tiktokPlayerStatus)
                    .font(.caption)
                    .foregroundStyle(Color.nomiMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                if let canonicalUrl = draft.canonicalUrl ?? draft.sourceURL ?? draft.sourceUrl {
                    Link(destination: canonicalUrl) {
                        Label("Open in TikTok", systemImage: "music.note")
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiSecondaryButtonStyle())
                }

                if let browserUrl = draft.originalUrl ?? draft.canonicalUrl ?? draft.sourceURL ?? draft.sourceUrl {
                    Link(destination: browserUrl) {
                        Label("Open in Browser", systemImage: "safari")
                            .font(.caption.bold())
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiSecondaryButtonStyle())
                }
            }
        }
        .padding(14)
        .recallCard(cornerRadius: 24)
    }

    private var tiktokFallbackPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let thumbnailUrl = draft.thumbnailUrl {
                AsyncImage(url: thumbnailUrl) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        ZStack {
                            Color.black.opacity(0.06)
                            Image(systemName: "play.rectangle.fill")
                                .font(.system(size: 40, weight: .semibold))
                                .foregroundStyle(Color.nomiPink)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }

            Text("This TikTok is unavailable here.")
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.nomiInk)
            Text("It may be private, removed, region-limited, or blocked from embedded playback.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
        }
    }

    private var nomiTakeawayCard: some View {
        Group {
            if let takeaway = meaningfulTakeawayText {
                VStack(alignment: .leading, spacing: 14) {
                    Label("Nomi Takeaway", systemImage: "sparkles")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.nomiPink)

                    Text(takeaway)
                        .font(.body)
                        .foregroundStyle(Color.nomiInk)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)

                    if !takeawayChips.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(takeawayChips, id: \.self) { chip in
                                    Text("#\(chip)")
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(Color.nomiPink)
                                        .padding(.vertical, 9)
                                        .padding(.horizontal, 15)
                                        .background(Color.nomiPink.opacity(0.06), in: Capsule())
                                        .overlay(Capsule().stroke(Color.nomiPink.opacity(0.20), lineWidth: 1))
                                }
                            }
                        }
                        .scrollClipDisabled()
                    }
                }
                .padding(16)
                .recallCard(cornerRadius: 24)
            }
        }
    }

    private var recallQuickActions: some View {
        HStack(spacing: 12) {
            quickAction("Summary", systemImage: "doc.text") { activeSheet = .summary }
            quickAction("Tags", systemImage: "tag") { activeSheet = .tags }
            quickAction("Source", systemImage: "info.circle") { activeSheet = .source }
            quickAction("Related", systemImage: "point.3.connected.trianglepath.dotted") { activeSheet = .related }
            quickAction("Project", systemImage: "folder") { activeSheet = .project }
        }
    }

    private var connectedIdeasPreview: some View {
        let related = Array(memoryStore.relatedMemories(for: draft).prefix(2))

        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Connected ideas", systemImage: "point.3.connected.trianglepath.dotted")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Button("View all") {
                    activeSheet = .related
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.nomiPink)
            }

            if related.isEmpty {
                Text("Nomi will surface related memories here as your saves overlap by tag, source, concept, or author.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(related.enumerated()), id: \.element.id) { index, result in
                        NavigationLink(value: result.memory) {
                            ConnectedIdeaPreviewRow(result: result)
                                .padding(.vertical, 11)
                        }
                        .buttonStyle(.plain)

                        if index < related.count - 1 {
                            Divider().padding(.leading, 66)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.nomiStroke, lineWidth: 1)
                )
            }
        }
        .padding(16)
        .recallCard(cornerRadius: 24)
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                recallChip("Trending", systemImage: "chart.line.uptrend.xyaxis", isSelected: true)
                recallChip(draft.displayType, systemImage: sourceIcon)
                recallChip(draft.category, systemImage: "cpu")
                if let firstTag = draft.tags.first {
                    recallChip(firstTag.capitalized, systemImage: "sparkles")
                } else {
                    recallChip("Momentum", systemImage: "rocket")
                }
            }
        }
        .scrollClipDisabled()
    }

    private var recallSummaryCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    Image(systemName: sourceIcon)
                        .font(.system(size: 25, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 50, height: 50)
                        .background(Color.black, in: Circle())

                    Image(systemName: draft.isFavorite ? "heart.fill" : "heart")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(draft.isFavorite ? Color.nomiPink : Color.nomiMuted, in: Circle())
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(sourceHeading)
                        .font(.headline.bold())
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)

                    Text(draft.title)
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(2)
                }

                Spacer()

                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Image(systemName: draft.isFavorite ? "heart.fill" : "heart")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(Color.nomiCoral)
                        .frame(width: 42, height: 42)
                        .background(Color.nomiField, in: Circle())
                        .overlay(Circle().stroke(Color.nomiCoral.opacity(0.18), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(draft.isFavorite ? "Unfavorite memory" : "Favorite memory")
            }

            if let takeaway = meaningfulTakeawayText {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Nomi Takeaway", systemImage: "sparkles")
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.nomiPink)

                    Text(takeaway)
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .stroke(Color.nomiPink.opacity(0.22), lineWidth: 1)
                )
            }

            HStack(spacing: 14) {
                Label("Saved \(NomiFormatters.shortDate.string(from: draft.createdAt))", systemImage: "calendar")
                if let sourceDate = draft.sourceDate {
                    Label("Source \(NomiFormatters.shortDate.string(from: sourceDate))", systemImage: "clock")
                }
            }
            .font(.caption)
            .foregroundStyle(Color.nomiMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.74)
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var editableFieldsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Memory", systemImage: "square.and.pencil")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Label("Save", systemImage: "checkmark")
                            .font(.caption.weight(.bold))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.nomiPink)
                .disabled(isSaving || isDeleting)
            }

            editableTextField("Title", text: $draft.title)
            editableTextField("Summary", text: $summaryText, axis: .vertical)
            editableTextField("Category", text: $draft.category)
            editableTextField("Tags", text: $tagText)
            editableTextField("Concepts", text: $conceptText)
            editableTextField("Entities", text: $entityText)
            editableTextField("Intent", text: $draft.intent)
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private func editableTextField(_ label: String, text: Binding<String>, axis: Axis = .horizontal) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)

            TextField(label, text: text, axis: axis)
                .font(.subheadline)
                .foregroundStyle(Color.nomiInk)
                .lineLimit(axis == .vertical ? 2...5 : 1...1)
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.nomiStroke, lineWidth: 1)
                )
        }
    }

    private var projectLinksCard: some View {
        let linkedIds = Set(draft.projectIds)
        let linkedProjects = intelligenceStore.projects.filter { linkedIds.contains($0.id) }
        let availableProjects = intelligenceStore.projects.filter { !linkedIds.contains($0.id) }

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Projects", systemImage: "folder.fill")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Menu {
                    if availableProjects.isEmpty {
                        Text("No available projects")
                    } else {
                        ForEach(availableProjects) { project in
                            Button(project.name) {
                                Task {
                                    if await intelligenceStore.assign(memory: draft, to: project) {
                                        draft.projectIds = Array(Set(draft.projectIds + [project.id]))
                                    }
                                }
                            }
                        }
                    }
                } label: {
                    Label("Add", systemImage: "plus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.nomiPink)
                }
            }

            if linkedProjects.isEmpty {
                Text("Add this memory to a project to keep launches, research, and builds organized.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                ForEach(linkedProjects) { project in
                    HStack {
                        Text(project.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(Color.nomiInk)
                        Spacer()
                        Button {
                            Task {
                                if await intelligenceStore.remove(memory: draft, from: project) {
                                    draft.projectIds.removeAll { $0 == project.id }
                                }
                            }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.nomiMuted)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)
                    .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var originalSourceCard: some View {
        if hasSourceContext {
            HStack(spacing: 12) {
                sourcePreview

                VStack(alignment: .leading, spacing: 3) {
                    Text(sourceTitle)
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Text(sourceSubtitle)
                        .font(.caption)
                        .foregroundStyle(Color.nomiPink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }

                Spacer(minLength: 8)

                if let sourceURL = draft.sourceURL {
                    Link(destination: sourceURL) {
                        Label("Open Original", systemImage: "arrow.up.right.square")
                            .font(.caption.bold())
                            .foregroundStyle(Color.nomiPink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 12)
                            .background(Color.nomiField, in: Capsule())
                            .overlay(Capsule().stroke(Color.nomiPink.opacity(0.18), lineWidth: 1))
                    }
                }
            }
            .padding(12)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
        }
    }

    private var sourceMetadataCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Source details", systemImage: "info.circle")
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            detailRow("Source type", draft.sourceType.isEmpty ? "unknown" : draft.sourceType)
            detailRow("Category", draft.category.isEmpty ? "General" : draft.category)
            detailRow("Captured", NomiFormatters.shortDateTime.string(from: draft.capturedAt))
            detailRow("Created", NomiFormatters.shortDateTime.string(from: draft.createdAt))

            if let updatedAt = draft.updatedAt {
                detailRow("Updated", NomiFormatters.shortDateTime.string(from: updatedAt))
            }

            if let sourceUsername = draft.sourceUsername ?? draft.author?.username {
                detailRow("Author", sourceUsername.hasPrefix("@") ? sourceUsername : "@\(sourceUsername)")
            } else if let displayName = draft.author?.displayName {
                detailRow("Author", displayName)
            }

            if let sourceId = draft.sourceId, !sourceId.isEmpty {
                detailRow("Source ID", sourceId)
            }

            if isTikTokMemory {
                if let platformVideoId = draft.platformVideoId {
                    detailRow("TikTok video ID", platformVideoId)
                }
                if let transcriptStatus = draft.transcriptStatus {
                    detailRow("Transcript", transcriptStatus)
                }
            }

            chipGroup("Tags", values: draft.tags)
            chipGroup("Concepts", values: draft.concepts)
            chipGroup("Entities", values: draft.entities)
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var postContentCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: sourceIcon)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 7, style: .continuous))

                Text("Original text")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Label("Scroll", systemImage: "arrow.up.and.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiPink)
            }

            ScrollView {
                Text(originalText)
                    .font(.body)
                    .foregroundStyle(Color.nomiInk)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 6)
            }
            .frame(minHeight: 180, maxHeight: 245)
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var relatedMemoriesSection: some View {
        let related = memoryStore.relatedMemories(for: draft)

        return VStack(alignment: .leading, spacing: 12) {
            Label("Connected ideas", systemImage: "point.3.connected.trianglepath.dotted")
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            if related.isEmpty {
                Text("No related memories yet. Shared tags, concepts, entities, authors, categories, and source types will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                ForEach(related) { result in
                    NavigationLink(value: result.memory) {
                        RelatedMemoryRow(result: result)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var aiMetadataCard: some View {
        if let ai = draft.ai,
           ai.modelUsed?.isEmpty == false || ai.processingVersion?.isEmpty == false || ai.processingStatus?.isEmpty == false {
            VStack(alignment: .leading, spacing: 9) {
                Label("AI metadata", systemImage: "cpu")
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.nomiMuted)

                if let modelUsed = ai.modelUsed {
                    detailRow("Model", modelUsed)
                }

                if let processingVersion = ai.processingVersion {
                    detailRow("Version", processingVersion)
                }

                if let processingStatus = ai.processingStatus {
                    detailRow("Status", processingStatus)
                }
            }
            .padding(14)
            .background(Color.nomiCardStrong.opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.nomiStroke.opacity(0.8), lineWidth: 1)
            )
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)

            Spacer(minLength: 12)

            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiInk)
                .multilineTextAlignment(.trailing)
        }
    }

    @ViewBuilder
    private func chipGroup(_ title: String, values: [String]) -> some View {
        if !values.isEmpty {
            VStack(alignment: .leading, spacing: 7) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(values, id: \.self) { value in
                        Text(title == "Tags" ? "#\(value)" : value)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.nomiInk)
                            .lineLimit(1)
                            .padding(.vertical, 7)
                            .padding(.horizontal, 10)
                            .background(Color.nomiField, in: Capsule())
                            .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
                    }
                }
            }
        }
    }

    private var bottomActionRow: some View {
        HStack(spacing: 8) {
            detailActionButton("Copy", systemImage: "doc.on.doc") {
                copyMarkdown()
            }

            detailActionButton("Export", systemImage: "square.and.arrow.up", tint: Color.nomiOrange) {
                exportAsObsidianNote()
            }

            detailActionButton("Preview", systemImage: "doc.text.magnifyingglass") {
                previewMarkdown()
            }

            if let sourceURL = draft.sourceURL {
                Link(destination: sourceURL) {
                    Label("Open", systemImage: "arrow.up.right")
                        .detailActionLabel(tint: Color.nomiPink)
                }
            } else {
                detailActionButton("Open", systemImage: "arrow.up.right") {}
                    .disabled(true)
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
        }
        .padding(16)
        .background(Color.nomiCardStrong)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private var sourceContextSection: some View {
        if hasSourceContext {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Label(sourceTitle, systemImage: sourceIcon)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Spacer()

                    if let sourceURL = draft.sourceURL {
                        Link("Open", destination: sourceURL)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.pink)
                    }
                }

                if !draft.media.isEmpty {
                    InlineMediaStrip(media: draft.media)
                }

                if !draft.links.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(draft.links) { link in
                            CompactLinkRow(link: link)
                        }
                    }
                }

                if !draft.referencedPosts.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(draft.referencedPosts) { post in
                            CompactReferencedPostCard(post: post)
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.nomiCardStrong)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
        }
    }

    private var hasSourceContext: Bool {
        draft.sourceURL != nil ||
            isTikTokMemory ||
            draft.sourceUsername?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ||
            !draft.media.isEmpty ||
            !draft.links.isEmpty ||
            !draft.referencedPosts.isEmpty
    }

    private var sourceHeading: String {
        if isTikTokMemory {
            return draft.authorName ?? draft.sourceUsername ?? "TikTok video"
        }

        if sourceTitle.hasPrefix("@") {
            return "\(sourceTitle) on X"
        }

        return sourceTitle
    }

    private var sourceTitle: String {
        if isTikTokMemory {
            return draft.authorName ?? "TikTok"
        }

        if let sourceUsername = draft.sourceUsername?.trimmingCharacters(in: .whitespacesAndNewlines),
           !sourceUsername.isEmpty {
            return sourceUsername.hasPrefix("@") ? sourceUsername : "@\(sourceUsername)"
        }

        if let host = draft.sourceURL?.host?.replacingOccurrences(of: "www.", with: "") {
            return host
        }

        return "Saved source"
    }

    private var sourceSubtitle: String {
        if isTikTokMemory {
            return (draft.canonicalUrl ?? draft.originalUrl ?? draft.sourceURL)?.absoluteString
                .replacingOccurrences(of: "https://", with: "")
                .replacingOccurrences(of: "http://", with: "") ?? "tiktok.com"
        }

        if let sourceURL = draft.sourceURL {
            return sourceURL.absoluteString
                .replacingOccurrences(of: "https://", with: "")
                .replacingOccurrences(of: "http://", with: "")
        }

        return draft.displayType
    }

    private var meaningfulTakeawayText: String? {
        let candidates = [
            summaryText,
            draft.summary ?? "",
            draft.ai?.summary ?? ""
        ]

        return candidates
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && isDistinctTakeaway($0) }
    }

    private func isDistinctTakeaway(_ value: String) -> Bool {
        let candidate = normalizedTakeawayComparison(value)
        guard candidate.count >= 24 else { return false }

        let sourceValues = [
            draft.title,
            draft.rawText,
            draft.cleanText ?? "",
            draft.content
        ].map(normalizedTakeawayComparison)
            .filter { !$0.isEmpty }

        return !sourceValues.contains { source in
            candidate == source ||
                source.hasPrefix(candidate) ||
                candidate.hasPrefix(source)
        }
    }

    private func normalizedTakeawayComparison(_ value: String) -> String {
        value
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
            .map(String.init)
            .joined()
    }

    private var originalText: String {
        let raw = draft.rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.isEmpty { return raw }

        let content = draft.content.trimmingCharacters(in: .whitespacesAndNewlines)
        if !content.isEmpty { return content }

        return "No original text saved for this memory."
    }

    private var isTikTokMemory: Bool {
        draft.source?.lowercased() == "tiktok" ||
            draft.type.lowercased() == "tiktok_video" ||
            (draft.sourceType.lowercased() == "video" && tiktokPlaybackURL != nil)
    }

    private var tiktokPlaybackURL: URL? {
        draft.playerUrl ??
            draft.canonicalUrl ??
            draft.originalUrl ??
            draft.sourceURL ??
            draft.sourceUrl
    }

    private var tiktokPlaybackDiagnostic: String {
        if draft.playerUrl != nil {
            return "Official TikTok player URL available"
        }
        if draft.platformVideoId != nil {
            return "Video ID saved, trying TikTok page"
        }
        return "No video ID yet, trying saved TikTok link"
    }

    private var sourceIcon: String {
        if isTikTokMemory {
            return "play.rectangle.fill"
        }

        switch draft.type.lowercased() {
        case "x_post", "x-post", "xpost", "tweet":
            return "quote.bubble.fill"
        case "link", "url":
            return "link"
        default:
            return "tray.and.arrow.down.fill"
        }
    }

    private var sourcePreview: some View {
        Group {
            if let firstMedia = draft.media.first {
                InlineMediaItem(item: firstMedia)
                    .frame(width: 82, height: 54)
                    .clipped()
            } else {
                Image(systemName: sourceIcon)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
        }
    }

    private var sourceAvatar: some View {
        Group {
            if let avatarUrl = draft.author?.avatarUrl {
                AsyncImage(url: avatarUrl) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        Image(systemName: sourceIcon)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                    @unknown default:
                        Image(systemName: sourceIcon)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                    }
                }
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                Image(systemName: sourceIcon)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private var sourceTypeLabel: String {
        if isTikTokMemory {
            return "TikTok Video"
        }

        switch draft.sourceType.lowercased() {
        case "x_bookmark": return "X Bookmark"
        case "manual_note": return "Manual Note"
        case "link": return "Link"
        case "image": return "Image"
        case "voice": return "Voice"
        default: return draft.displayType
        }
    }

    private var sourceDateLabel: String {
        let date = draft.sourceDate ?? draft.capturedAt
        return NomiFormatters.shortDateTime.string(from: date)
    }

    private var takeawayChips: [String] {
        let values = draft.tags + draft.concepts + [draft.sourceType.replacingOccurrences(of: "_", with: "")]
        var seen = Set<String>()
        return Array(values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(of: " ", with: "") }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .prefix(5))
            .map { String($0) }
    }

    private func quickAction(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
                    .frame(height: 24)

                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 86)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.035), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }

    private func recallChip(_ title: String, systemImage: String, isSelected: Bool = false) -> some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.bold))
            .foregroundStyle(isSelected ? Color.nomiPink : Color.nomiInk)
            .lineLimit(1)
            .padding(.vertical, 9)
            .padding(.horizontal, 12)
            .background((isSelected ? Color.nomiPink.opacity(0.12) : Color.nomiCardStrong), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.nomiPink.opacity(0.30) : Color.nomiStroke, lineWidth: 1)
            )
    }

    private func detailActionButton(
        _ title: String,
        systemImage: String,
        tint: Color = Color.nomiPink,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .detailActionLabel(tint: tint)
        }
        .buttonStyle(.plain)
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
        .background(Color.nomiCardStrong)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private func recallSheet(for sheet: RecallDetailSheet) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    switch sheet {
                    case .summary:
                        summarySheetContent
                    case .tags:
                        tagsSheetContent
                    case .source:
                        sourceSheetContent
                    case .related:
                        relatedSheetContent
                    case .project:
                        projectSheetContent
                    }
                }
                .padding(18)
                .padding(.bottom, 28)
            }
            .background(NomiBackground())
            .navigationTitle(sheet.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        activeSheet = nil
                    }
                    .foregroundStyle(Color.nomiPink)
                }
            }
        }
    }

    private var summarySheetContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            editableTextField("Title", text: $draft.title)
            editableTextField("Summary", text: $summaryText, axis: .vertical)
            editableTextField("Category", text: $draft.category)
            editableTextField("Intent", text: $draft.intent)

            Button {
                Task { await save() }
            } label: {
                if isSaving {
                    HStack {
                        ProgressView()
                        Text("Saving")
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Label("Save changes", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(NomiPrimaryButtonStyle())
            .disabled(isSaving || isDeleting)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    detailActionButton("Copy Markdown", systemImage: "doc.on.doc") { copyMarkdown() }
                    detailActionButton("Preview", systemImage: "doc.text.magnifyingglass") { previewMarkdown() }
                    detailActionButton("Export", systemImage: "square.and.arrow.up", tint: Color.nomiOrange) { exportAsObsidianNote() }
                }

                VStack(spacing: 10) {
                    detailActionButton("Copy Markdown", systemImage: "doc.on.doc") { copyMarkdown() }
                    detailActionButton("Preview", systemImage: "doc.text.magnifyingglass") { previewMarkdown() }
                    detailActionButton("Export", systemImage: "square.and.arrow.up", tint: Color.nomiOrange) { exportAsObsidianNote() }
                }
            }

            if let exportMessage {
                Text(exportMessage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            }

            Button(role: .destructive) {
                isConfirmingDelete = true
            } label: {
                Label(isDeleting ? "Deleting" : "Delete memory", systemImage: "trash")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiSecondaryButtonStyle())
            .disabled(isSaving || isDeleting)
        }
        .padding(14)
        .recallCard(cornerRadius: 20)
    }

    private var tagsSheetContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            editableTextField("Tags", text: $tagText)
            editableTextField("Concepts", text: $conceptText)
            editableTextField("Entities", text: $entityText)

            chipGroup("Tags", values: tagText.nomiTags)
            chipGroup("Concepts", values: conceptText.nomiTags)
            chipGroup("Entities", values: entityText.nomiTags)

            Button {
                Task { await save() }
            } label: {
                Label("Save tags", systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())
            .disabled(isSaving || isDeleting)
        }
        .padding(14)
        .recallCard(cornerRadius: 20)
    }

    private var sourceSheetContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if hasSourceContext {
                originalSourceCard
            }

            sourceMetadataCard

            if !draft.media.isEmpty {
                sectionCard(title: "Media", systemImage: "photo") {
                    InlineMediaStrip(media: draft.media)
                }
            }

            if !draft.links.isEmpty {
                sectionCard(title: "Links", systemImage: "link") {
                    VStack(spacing: 8) {
                        ForEach(draft.links) { link in
                            CompactLinkRow(link: link)
                        }
                    }
                }
            }

            if !draft.referencedPosts.isEmpty {
                sectionCard(title: "Referenced posts", systemImage: "quote.bubble") {
                    VStack(spacing: 8) {
                        ForEach(draft.referencedPosts) { post in
                            CompactReferencedPostCard(post: post)
                        }
                    }
                }
            }

            aiMetadataCard
        }
    }

    private var relatedSheetContent: some View {
        let related = memoryStore.relatedMemories(for: draft)

        return VStack(alignment: .leading, spacing: 12) {
            if related.isEmpty {
                Text("No connected ideas yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .padding(14)
                    .recallCard(cornerRadius: 20)
            } else {
                ForEach(related) { result in
                    NavigationLink(value: result.memory) {
                        RelatedMemoryRow(result: result)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var projectSheetContent: some View {
        projectLinksCard
    }

    private func sectionCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            content()
        }
        .padding(14)
        .recallCard(cornerRadius: 20)
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
        draft.concepts = conceptText.nomiTags
        draft.entities = entityText.nomiTags
        draft.summary = summaryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : summaryText.trimmingCharacters(in: .whitespacesAndNewlines)
        if await memoryStore.update(draft) {
            exportMessage = "Memory updated."
        }
    }

    private func toggleFavorite() async {
        draft.isFavorite.toggle()
        _ = await memoryStore.update(draft)
    }

    private func toggleArchive() async {
        draft.isArchived.toggle()
        _ = await memoryStore.update(draft)
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
        memory.concepts = conceptText.nomiTags
        memory.entities = entityText.nomiTags
        memory.summary = summaryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? draft.summary : summaryText.trimmingCharacters(in: .whitespacesAndNewlines)
        return memory
    }

    private func exportAsObsidianNote() {
        do {
            let memory = currentExportMemory()
            let exportPackage = try MarkdownExporter.writeExportPackage(
                for: memory,
                relatedMemories: memoryStore.memories
            )
            exportedActivityItems = exportPackage.activityItems
            exportMessage = "Obsidian graph export ready to share."
            isShowingShareSheet = true
        } catch {
            exportErrorMessage = error.localizedDescription
        }
    }

    private func copyMarkdown() {
        let markdown = MarkdownExporter.makeMarkdown(
            from: currentExportMemory(),
            relatedMemories: memoryStore.memories
        )
        UIPasteboard.general.string = markdown
        exportMessage = "Markdown copied."
    }

    private func previewMarkdown() {
        markdownPreview = MarkdownExporter.makeMarkdown(
            from: currentExportMemory(),
            relatedMemories: memoryStore.memories
        )
        isShowingMarkdownPreview = true
    }
}

private enum RecallDetailSheet: String, Identifiable {
    case summary
    case tags
    case source
    case related
    case project

    var id: String { rawValue }

    var title: String {
        switch self {
        case .summary: "Memory Summary"
        case .tags: "Tags & Concepts"
        case .source: "Source Details"
        case .related: "Connected Ideas"
        case .project: "Projects"
        }
    }

    var detents: Set<PresentationDetent> {
        switch self {
        case .summary, .source, .related:
            return [.medium, .large]
        case .tags, .project:
            return [.medium]
        }
    }
}

private struct ConnectedIdeaPreviewRow: View {
    let result: RelatedMemoryResult

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Text(snippet)
                    .font(.caption)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Text("\(result.score)")
                .font(.subheadline.weight(.black))
                .foregroundStyle(Color.nomiPink)
                .frame(width: 34, height: 34)
                .background(Color.nomiPink.opacity(0.14), in: Circle())
        }
    }

    private var title: String {
        if let username = result.memory.sourceUsername ?? result.memory.author?.username,
           !username.isEmpty {
            return "\(username.hasPrefix("@") ? username : "@\(username)") on X"
        }

        return result.memory.title.isEmpty ? "Untitled memory" : result.memory.title
    }

    private var snippet: String {
        let text = (result.memory.summary ?? result.memory.previewText).trimmingCharacters(in: .whitespacesAndNewlines)
        if let reason = result.reasons.first, !reason.isEmpty {
            return "\(reason) • \(text)"
        }
        return text
    }

    private var icon: String {
        switch result.memory.sourceType.lowercased() {
        case "x_bookmark": "quote.bubble.fill"
        case "link": "link"
        default: "tray.and.arrow.down.fill"
        }
    }
}

private struct RelatedMemoryRow: View {
    let result: RelatedMemoryResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(result.memory.title.isEmpty ? "Untitled memory" : result.memory.title)
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(2)

                Spacer(minLength: 10)

                Text("\(result.score)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(Color.nomiPink)
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(Color.nomiPink.opacity(0.12), in: Capsule())
            }

            let snippet = (result.memory.summary ?? result.memory.previewText).trimmingCharacters(in: .whitespacesAndNewlines)
            if !snippet.isEmpty {
                Text(snippet)
                    .font(.caption)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
            }

            if let reason = result.reasons.first {
                Label(reason, systemImage: "link")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.nomiPink)
                    .lineLimit(1)
            }
        }
        .padding(12)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }
}

private struct InlineMediaStrip: View {
    let media: [NomiMemoryMedia]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(media) { item in
                    InlineMediaItem(item: item)
                }
            }
        }
    }
}

private extension View {
    func recallCard(cornerRadius: CGFloat = 18) -> some View {
        self
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.045), radius: 14, y: 7)
    }

    func detailActionLabel(tint: Color) -> some View {
        self
            .font(.caption.weight(.bold))
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 10)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .stroke(tint.opacity(0.18), lineWidth: 1)
            )
    }
}

private struct InlineMediaItem: View {
    let item: NomiMemoryMedia

    var body: some View {
        Group {
            if let imageURL = displayableImageURL {
                mediaPreview(url: imageURL)
            } else if let openURL {
                Link(destination: openURL) {
                    fallbackMediaLabel
                }
            } else {
                fallbackMediaLabel
            }
        }
    }

    private func mediaPreview(url: URL) -> some View {
        Link(destination: openURL ?? url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    fallbackMediaLabel
                case .empty:
                    ProgressView()
                @unknown default:
                    fallbackMediaLabel
                }
            }
            .frame(width: 104, height: 82)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var fallbackMediaLabel: some View {
        HStack(spacing: 8) {
            Image(systemName: item.type == "video" || item.type == "animated_gif" ? "play.circle.fill" : "photo")
                .font(.headline)
                .foregroundStyle(.pink)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.type == "animated_gif" ? "GIF" : item.type.capitalized)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                Text("Open media")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(height: 58)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var displayableImageURL: URL? {
        guard let url = item.bestDisplayURL else { return nil }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()

        if host.contains("pbs.twimg.com") || host.contains("twimg.com") {
            return url
        }

        if path.hasSuffix(".jpg") ||
            path.hasSuffix(".jpeg") ||
            path.hasSuffix(".png") ||
            path.hasSuffix(".gif") ||
            path.hasSuffix(".webp") {
            return url
        }

        return nil
    }

    private var openURL: URL? {
        item.bestVideoURL ?? item.url ?? item.previewImageUrl ?? item.bestDisplayURL
    }
}

private struct CompactLinkRow: View {
    let link: NomiMemoryLink

    var body: some View {
        if let url = link.url {
            Link(destination: url) {
                HStack(spacing: 10) {
                    Image(systemName: "link")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.pink)
                        .frame(width: 30, height: 30)
                        .background(.pink.opacity(0.08), in: Circle())

                    VStack(alignment: .leading, spacing: 1) {
                        Text(primaryText(for: url))
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.nomiInk)
                            .lineLimit(1)
                        Text(link.displayUrl ?? url.host ?? url.absoluteString)
                            .font(.caption)
                            .foregroundStyle(Color.nomiMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                }
                .padding(.vertical, 9)
                .padding(.horizontal, 10)
                .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
        }
    }

    private func primaryText(for url: URL) -> String {
        if let title = link.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
            return title
        }

        return link.displayUrl ?? url.host ?? url.absoluteString
    }
}

private struct TikTokPlayerWebView: UIViewRepresentable {
    let url: URL
    let onStatus: (String) -> Void
    let onFailure: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onStatus: onStatus, onFailure: onFailure)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = true
        webView.scrollView.backgroundColor = .clear
        webView.isOpaque = false
        webView.backgroundColor = .clear
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            onStatus("Loading TikTok inside Nomi...")
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let onStatus: (String) -> Void
        private let onFailure: (String) -> Void

        init(onStatus: @escaping (String) -> Void, onFailure: @escaping (String) -> Void) {
            self.onStatus = onStatus
            self.onFailure = onFailure
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            let script = """
            (() => {
              const hasVideo = !!document.querySelector('video');
              const hasIframe = !!document.querySelector('iframe');
              const hasPlayer = location.href.includes('/player/') || !!document.querySelector('[data-e2e], blockquote');
              return JSON.stringify({ title: document.title || '', href: location.href, hasVideo, hasIframe, hasPlayer });
            })();
            """
            webView.evaluateJavaScript(script) { result, _ in
                let message = Self.statusMessage(from: result)
                DispatchQueue.main.async {
                    self.onStatus(message)
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            guard !Self.isRedirectCancellation(error) else { return }
            onFailure(Self.failureMessage(error))
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard !Self.isRedirectCancellation(error) else { return }
            onFailure(Self.failureMessage(error))
        }

        private static func isRedirectCancellation(_ error: Error) -> Bool {
            let nsError = error as NSError
            return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
        }

        private static func failureMessage(_ error: Error) -> String {
            "TikTok blocked embedded playback here: \((error as NSError).localizedDescription)"
        }

        private static func statusMessage(from result: Any?) -> String {
            guard
                let string = result as? String,
                let data = string.data(using: .utf8),
                let row = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                return "TikTok loaded, but Nomi could not inspect whether a player was available."
            }

            let hasVideo = row["hasVideo"] as? Bool ?? false
            let hasIframe = row["hasIframe"] as? Bool ?? false
            let hasPlayer = row["hasPlayer"] as? Bool ?? false
            if hasVideo || hasIframe || hasPlayer {
                return "TikTok allowed an embedded player surface in Nomi."
            }

            let href = row["href"] as? String ?? ""
            if href.contains("login") || href.contains("captcha") {
                return "TikTok loaded a gate instead of the video, so playback is not permitted in Nomi for this link."
            }

            return "TikTok loaded, but no playable video surface was detected. Use Open in TikTok or Open in Browser for this one."
        }
    }
}

private struct CompactReferencedPostCard: View {
    let post: NomiReferencedPost

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
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
                    .foregroundStyle(Color.nomiMuted)
            }

            Text(post.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? post.text! : "No post text returned.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiInk)
                .lineLimit(4)

            if !post.links.isEmpty {
                ForEach(post.links.prefix(2)) { link in
                    CompactLinkRow(link: link)
                }
            }
        }
        .padding(12)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
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
