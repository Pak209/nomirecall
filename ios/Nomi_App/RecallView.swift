import SwiftUI

struct RecallView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    @State private var options = NomiMemorySearchOptions()
    @State private var isShowingFilters = false
    @State private var askQuestion = ""
    @State private var askResponse: BrainQueryResponse?
    @State private var askErrorMessage: String?
    @State private var isAskingNomi = false
    @State private var openingSourceMemoryId: String?
    @State private var sourceOpenErrorMessage: String?
    @State private var openedSourceMemory: NomiMemory?

    private let backendService = XBackendService()

    private var filteredMemories: [NomiMemory] {
        memoryStore.search(options: options)
    }

    private var hasActiveFilters: Bool {
        !options.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            options.category != nil ||
            options.tag != nil ||
            options.sourceType != nil ||
            options.dateRange != .all ||
            options.favoritesOnly ||
            options.archivedOnly ||
            options.sortBy != .newest
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(alignment: .leading, spacing: 14) {
                    header
                    searchBar
                    askNomiCard
                    quickFilters
                    content
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $isShowingFilters) {
                RecallFilterSheet(
                    options: $options,
                    categories: memoryStore.categories,
                    tags: memoryStore.filterTags(archivedOnly: options.archivedOnly),
                    sourceTypes: memoryStore.sourceTypes
                )
            }
            .alert("Recall error", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(memoryStore.errorMessage ?? "Something went wrong.")
            }
            .alert("Source unavailable", isPresented: sourceOpenErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(sourceOpenErrorMessage ?? "Nomi couldn’t open that memory. It may have been deleted or is no longer available.")
            }
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
            .navigationDestination(item: $openedSourceMemory) { memory in
                MemoryDetailView(memory: memory)
            }
            .task {
                await loadMemories()
            }
            .refreshable {
                await loadMemories()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                NavigationLink {
                    DiscoverView()
                } label: {
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .frame(width: 48, height: 48)
                        .background(Color.nomiCardStrong, in: Circle())
                        .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)

                NavigationLink {
                    ProjectsView()
                } label: {
                    Image(systemName: "folder.fill")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .frame(width: 48, height: 48)
                        .background(Color.nomiCardStrong, in: Circle())
                        .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)

                Spacer()

                Button {
                    isShowingFilters = true
                } label: {
                    Image(systemName: hasActiveFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(hasActiveFilters ? Color.nomiPink : Color.nomiInk)
                        .frame(width: 48, height: 48)
                        .background(Color.nomiCardStrong, in: Circle())
                        .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            HStack(alignment: .lastTextBaseline) {
                Text("Recall")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                Text("\(filteredMemories.count)")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.nomiMuted)

            TextField("Search title, text, tags, concepts", text: $options.query)
                .textInputAutocapitalization(.never)
                .foregroundStyle(Color.nomiInk)
                .tint(Color.nomiPink)

            if !options.query.isEmpty {
                Button {
                    options.query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.nomiMuted)
                }
                .buttonStyle(.plain)
            }

            Button {
                isShowingFilters = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .foregroundStyle(Color.nomiPink)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 13)
        .padding(.horizontal, 14)
        .background(Color.nomiField)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var askNomiCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiPink)

                Text("Ask Nomi")
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                if let confidence = askResponse?.confidence {
                    Text(confidence)
                        .font(.caption.weight(.black))
                        .foregroundStyle(confidence.caseInsensitiveCompare("low") == .orderedSame ? Color.nomiOrange : Color.nomiPink)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 9)
                        .background(Color.nomiField, in: Capsule())
                }
            }

            HStack(spacing: 10) {
                TextField("Ask about your saved memories", text: $askQuestion, axis: .vertical)
                    .lineLimit(1...3)
                    .textInputAutocapitalization(.sentences)
                    .foregroundStyle(Color.nomiInk)
                    .tint(Color.nomiPink)
                    .padding(.vertical, 11)
                    .padding(.horizontal, 12)
                    .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.nomiStroke, lineWidth: 1)
                    )

                Button {
                    Task { await askNomi() }
                } label: {
                    if isAskingNomi {
                        ProgressView()
                            .tint(.white)
                            .frame(width: 46, height: 46)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.headline.weight(.black))
                            .foregroundStyle(.white)
                            .frame(width: 46, height: 46)
                    }
                }
                .background(canAskNomi ? Color.nomiPink : Color.nomiMuted.opacity(0.45), in: Circle())
                .disabled(!canAskNomi)
                .buttonStyle(.plain)
                .accessibilityLabel("Ask Nomi")
            }

            if let askErrorMessage {
                Text(askErrorMessage)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiCoral)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let response = askResponse {
                askAnswerView(response)
            }
        }
        .padding(14)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var canAskNomi: Bool {
        !isAskingNomi && !askQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func askAnswerView(_ response: BrainQueryResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if response.sources.isEmpty {
                Text("Nomi couldn’t find enough saved context to answer that yet.")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                scopeLabel(for: response)

                Text(response.answer)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)

                if response.confidence.caseInsensitiveCompare("low") == .orderedSame {
                    Label("Low confidence — based only on a few matching memories.", systemImage: "exclamationmark.triangle")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiOrange)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 9) {
                    Text("Sources")
                        .font(.caption.weight(.black))
                        .foregroundStyle(Color.nomiMuted)
                        .textCase(.uppercase)

                    ForEach(response.sources) { source in
                        sourceCard(source)
                    }
                }
            }
        }
        .padding(12)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func scopeLabel(for response: BrainQueryResponse) -> some View {
        Text(scopeTitle(for: response))
            .font(.caption.weight(.black))
            .foregroundStyle(Color.nomiMuted)
            .padding(.vertical, 5)
            .padding(.horizontal, 8)
            .background(Color.nomiCardStrong, in: Capsule())
            .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func scopeTitle(for response: BrainQueryResponse) -> String {
        if response.scope?.type == "project" {
            let title = response.scope?.projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
            return "Project: \((title?.isEmpty == false ? title : nil) ?? "Selected project")"
        }
        return "Global memory search"
    }

    private func sourceCard(_ source: BrainQuerySource) -> some View {
        let matchedMemory = memoryStore.memories.first { $0.id == source.memoryId }
        let isLoading = openingSourceMemoryId == source.memoryId

        return Group {
            if let matchedMemory {
                NavigationLink(value: matchedMemory) {
                    sourceCardContent(source, isOpenable: true, isLoading: false)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    Task { await openSource(source) }
                } label: {
                    sourceCardContent(source, isOpenable: true, isLoading: isLoading)
                }
                .disabled(isLoading)
                .buttonStyle(.plain)
            }
        }
    }

    private func sourceCardContent(_ source: BrainQuerySource, isOpenable: Bool, isLoading: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(source.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                Spacer()

                if isLoading {
                    ProgressView()
                        .controlSize(.mini)
                } else if isOpenable {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.nomiMuted)
                }
            }

            if let relevanceReason = source.relevanceReason, !relevanceReason.isEmpty {
                Text(relevanceReason)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.nomiPink)
                    .lineLimit(1)
            }

            Text(source.snippet)
                .font(.caption)
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            if let date = source.capturedAt ?? source.createdAt {
                Text(NomiFormatters.shortDate.string(from: date))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(11)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var sourceOpenErrorBinding: Binding<Bool> {
        Binding(
            get: { sourceOpenErrorMessage != nil },
            set: { if !$0 { sourceOpenErrorMessage = nil } }
        )
    }

    private func openSource(_ source: BrainQuerySource) async {
        guard openingSourceMemoryId == nil else { return }
        guard let userId = appSession.user?.uid else {
            sourceOpenErrorMessage = "Sign in before opening saved memories."
            return
        }

        openingSourceMemoryId = source.memoryId
        defer { openingSourceMemoryId = nil }

        do {
            guard let memory = try await memoryStore.memory(id: source.memoryId, userId: userId) else {
                sourceOpenErrorMessage = "Nomi couldn’t open that memory. It may have been deleted or is no longer available."
                return
            }
            openedSourceMemory = memory
        } catch {
            sourceOpenErrorMessage = "Nomi couldn’t open that memory. It may have been deleted or is no longer available."
        }
    }

    private var quickFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                filterChip("Favorites", systemImage: "heart.fill", isSelected: options.favoritesOnly) {
                    options.favoritesOnly.toggle()
                }

                filterChip("Archived", systemImage: "archivebox.fill", isSelected: options.archivedOnly) {
                    options.archivedOnly.toggle()
                }

                filterChip(options.dateRange.title, systemImage: "calendar", isSelected: options.dateRange != .all) {
                    isShowingFilters = true
                }

                if let category = options.category {
                    removableChip(category, showsCategoryIcon: true) {
                        options.category = nil
                    }
                }

                if let tag = options.tag {
                    removableChip("#\(tag)") {
                        options.tag = nil
                    }
                }

                if let sourceType = options.sourceType {
                    removableChip(sourceLabel(sourceType)) {
                        options.sourceType = nil
                    }
                }

                if hasActiveFilters {
                    Button("Clear") {
                        options = NomiMemorySearchOptions()
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
                    .padding(.vertical, 9)
                    .padding(.horizontal, 12)
                    .background(Color.nomiCardStrong, in: Capsule())
                    .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
                }
            }
        }
        .scrollClipDisabled()
    }

    private var content: some View {
        Group {
            if memoryStore.isLoading && memoryStore.memories.isEmpty {
                Spacer()
                ProgressView()
                    .frame(maxWidth: .infinity)
                Spacer()
            } else if filteredMemories.isEmpty {
                Spacer()
                EmptyStateView(
                    title: emptyStateTitle,
                    message: emptyStateMessage
                )
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filteredMemories) { memory in
                            NavigationLink(value: memory) {
                                MemoryCardView(memory: memory)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 220)
                }
            }
        }
    }

    private func filterChip(_ title: String, systemImage: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(isSelected ? Color.nomiPink : Color.nomiInk)
                .lineLimit(1)
                .padding(.vertical, 9)
                .padding(.horizontal, 12)
                .background((isSelected ? Color.nomiPink.opacity(0.12) : Color.nomiCardStrong), in: Capsule())
                .overlay(Capsule().stroke(isSelected ? Color.nomiPink.opacity(0.30) : Color.nomiStroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func removableChip(_ title: String, showsCategoryIcon: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if showsCategoryIcon {
                    NomiCategoryIconView(categoryName: title, size: 18, strokeColor: Color.nomiPink)
                }
                Text(title)
                    .lineLimit(1)
                Image(systemName: "xmark")
                    .font(.caption2.weight(.black))
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.nomiPink)
            .padding(.vertical, 9)
            .padding(.horizontal, 12)
            .background(Color.nomiPink.opacity(0.12), in: Capsule())
            .overlay(Capsule().stroke(Color.nomiPink.opacity(0.30), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func sourceLabel(_ sourceType: String) -> String {
        switch sourceType {
        case "x_bookmark": return "X bookmark"
        case "manual_note": return "Manual note"
        case "link": return "Link"
        case "image": return "Image"
        case "voice": return "Voice"
        default: return "Unknown"
        }
    }

    private func loadMemories() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }

    private func askNomi() async {
        let question = askQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }

        isAskingNomi = true
        askErrorMessage = nil
        defer { isAskingNomi = false }

        do {
            askResponse = try await backendService.askMemories(question: question, limit: 12)
        } catch {
            askErrorMessage = error.localizedDescription
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { memoryStore.errorMessage != nil },
            set: { if !$0 { memoryStore.errorMessage = nil } }
        )
    }

    private var emptyStateTitle: String {
        if memoryStore.memories.isEmpty { return "No memories yet" }
        if options.archivedOnly { return "Archive is empty" }
        if options.favoritesOnly { return "No favorite memories" }
        return "No matching memories"
    }

    private var emptyStateMessage: String {
        if memoryStore.memories.isEmpty {
            return "Capture a note, link, image, or voice thought and it will appear here."
        }

        if options.archivedOnly {
            return "Archived memories stay tucked away until you need them."
        }

        if options.favoritesOnly {
            return "Tap the heart on memories you want to keep close."
        }

        return "Try a different search or clear a filter."
    }
}

private struct RecallFilterSheet: View {
    @Binding var options: NomiMemorySearchOptions
    let categories: [String]
    let tags: [String]
    let sourceTypes: [String]
    @Environment(\.dismiss) private var dismiss

    private let supportedSourceTypes = ["x_bookmark", "manual_note", "link", "image", "voice", "unknown"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    toggleRow
                    pickerSection("Date", options: NomiMemoryDateRange.allCases, selection: $options.dateRange)
                    pickerSection("Sort", options: NomiMemorySortOption.allCases, selection: $options.sortBy)
                    singleSelectSection("Category", items: categories, selected: $options.category, emptyLabel: "No categories yet", showsCategoryIcon: true)
                    singleSelectSection("Tag", items: tags, selected: $options.tag, emptyLabel: "No tags yet") { "#\($0)" }
                    singleSelectSection("Source", items: sourceItems, selected: $options.sourceType, emptyLabel: "No sources yet", label: sourceLabel)
                }
                .padding(18)
            }
            .background(NomiBackground())
            .navigationTitle("Filter memories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") {
                        options = NomiMemorySearchOptions(query: options.query)
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var toggleRow: some View {
        HStack(spacing: 10) {
            filterToggle("Favorites", systemImage: "heart.fill", isOn: $options.favoritesOnly)
            filterToggle("Archived", systemImage: "archivebox.fill", isOn: $options.archivedOnly)
        }
    }

    private var sourceItems: [String] {
        let values = Set(sourceTypes + supportedSourceTypes)
        return supportedSourceTypes.filter(values.contains)
    }

    private func filterToggle(_ title: String, systemImage: String, isOn: Binding<Bool>) -> some View {
        Button {
            isOn.wrappedValue.toggle()
        } label: {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(isOn.wrappedValue ? Color.nomiPink : Color.nomiInk)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background((isOn.wrappedValue ? Color.nomiPink.opacity(0.12) : Color.nomiCardStrong), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(isOn.wrappedValue ? Color.nomiPink.opacity(0.28) : Color.nomiStroke, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func pickerSection<T: CaseIterable & Identifiable & Hashable>(_ title: String, options values: [T], selection: Binding<T>) -> some View where T: Equatable, T: Identifiable, T.ID == String {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            Picker(title, selection: selection) {
                ForEach(values) { value in
                    Text(optionTitle(value)).tag(value)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private func singleSelectSection(
        _ title: String,
        items: [String],
        selected: Binding<String?>,
        emptyLabel: String,
        showsCategoryIcon: Bool = false,
        label: @escaping (String) -> String = { $0 }
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline.bold())
                .foregroundStyle(Color.nomiInk)

            if items.isEmpty {
                Text(emptyLabel)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            } else {
                FlowLayout(items: items) { item in
                    let active = selected.wrappedValue == item
                    Button {
                        selected.wrappedValue = active ? nil : item
                    } label: {
                        HStack(spacing: 6) {
                            if showsCategoryIcon {
                                NomiCategoryIconView(categoryName: item, size: 18, strokeColor: active ? Color.nomiPink : nil)
                            }
                            Text(label(item))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(active ? Color.nomiPink : Color.nomiInk)
                                .lineLimit(1)
                        }
                            .padding(.vertical, 9)
                            .padding(.horizontal, 12)
                            .background((active ? Color.nomiPink.opacity(0.12) : Color.nomiCardStrong), in: Capsule())
                            .overlay(Capsule().stroke(active ? Color.nomiPink.opacity(0.30) : Color.nomiStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func optionTitle<T>(_ value: T) -> String {
        if let dateRange = value as? NomiMemoryDateRange { return dateRange.title }
        if let sortOption = value as? NomiMemorySortOption { return sortOption.title }
        return String(describing: value)
    }

    private func sourceLabel(_ sourceType: String) -> String {
        switch sourceType {
        case "x_bookmark": return "X bookmark"
        case "manual_note": return "Manual note"
        case "link": return "Link"
        case "image": return "Image"
        case "voice": return "Voice"
        default: return "Unknown"
        }
    }
}

struct FlowLayout<Content: View>: View {
    let items: [String]
    let content: (String) -> Content

    init(items: [String], @ViewBuilder content: @escaping (String) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                content(item)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
