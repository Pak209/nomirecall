import SwiftUI

struct RecallView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    @State private var query = ""
    @State private var selectedCategory: String?
    @State private var isShowingFilters = false

    private var filteredMemories: [NomiMemory] {
        memoryStore.memories.filter { memory in
            let matchesQuery = query.isEmpty ||
                memory.title.localizedCaseInsensitiveContains(query) ||
                memory.content.localizedCaseInsensitiveContains(query) ||
                memory.tags.contains { $0.localizedCaseInsensitiveContains(query) }

            let matchesCategory = selectedCategory == nil || memory.category == selectedCategory

            return matchesQuery && matchesCategory
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                VStack(spacing: 14) {
                    searchBar

                    if let selectedCategory {
                        activeFilter(category: selectedCategory)
                    }

                    content
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .navigationTitle("Recall")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        DiscoverView()
                    } label: {
                        Image(systemName: "sparkle.magnifyingglass")
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .sheet(isPresented: $isShowingFilters) {
                CategoryFilterSheet(
                    categories: memoryStore.categories,
                    selectedCategory: $selectedCategory
                )
            }
            .navigationDestination(for: NomiMemory.self) { memory in
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

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField("Search memories", text: $query)
                .textInputAutocapitalization(.never)

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Button {
                isShowingFilters = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .foregroundStyle(.pink)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 13)
        .padding(.horizontal, 14)
        .background(.white.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.black.opacity(0.08), lineWidth: 1)
        )
    }

    private var content: some View {
        Group {
            if memoryStore.isLoading && memoryStore.memories.isEmpty {
                Spacer()
                ProgressView()
                Spacer()
            } else if filteredMemories.isEmpty {
                Spacer()
                EmptyStateView(
                    title: "No matching memories",
                    message: "Try a different search or clear your category filter."
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
                    .padding(.bottom, 32)
                }
            }
        }
    }

    private func activeFilter(category: String) -> some View {
        HStack {
            Text(category)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.pink)

            Button {
                selectedCategory = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(.pink.opacity(0.1))
        .clipShape(Capsule())
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func loadMemories() async {
        guard let userId = appSession.user?.uid else { return }
        await memoryStore.load(userId: userId)
    }
}

private struct CategoryFilterSheet: View {
    let categories: [String]
    @Binding var selectedCategory: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Button {
                    selectedCategory = nil
                    dismiss()
                } label: {
                    Label("All categories", systemImage: selectedCategory == nil ? "checkmark.circle.fill" : "circle")
                }

                ForEach(categories, id: \.self) { category in
                    Button {
                        selectedCategory = category
                        dismiss()
                    } label: {
                        Label(category, systemImage: selectedCategory == category ? "checkmark.circle.fill" : "circle")
                    }
                }
            }
            .navigationTitle("Filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
