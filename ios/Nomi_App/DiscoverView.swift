import SwiftUI

struct DiscoverView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore

    @State private var selectedTopics: Set<String> = ["ai_tech"]
    @State private var items: [XDiscoverItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let xBackendService = XBackendService()
    private let topics = [
        ("ai_tech", "AI & Tech"),
        ("crypto", "Crypto"),
        ("sports", "Sports"),
        ("politics", "Politics"),
        ("finance", "Finance"),
        ("science", "Science"),
        ("startups", "Startups"),
        ("health", "Health")
    ]

    var body: some View {
        ZStack {
            NomiBackground()

            VStack(spacing: 14) {
                topicScroller

                if isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if items.isEmpty {
                    Spacer()
                    EmptyStateView(
                        title: "Discover posts",
                        message: "Choose interests and fetch current X posts through the backend."
                    )
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(items) { item in
                                XDiscoverCard(item: item) {
                                    Task { await save(item) }
                                }
                            }
                        }
                        .padding(.bottom, 24)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
        .navigationTitle("Discover")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await discover() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isLoading)
            }
        }
        .alert("Discover error", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Something went wrong.")
        }
        .task {
            if items.isEmpty {
                await discover()
            }
        }
    }

    private var topicScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(topics, id: \.0) { topic in
                    Button {
                        toggle(topic.0)
                    } label: {
                        Text(topic.1)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(selectedTopics.contains(topic.0) ? .white : .primary)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 13)
                            .background(selectedTopics.contains(topic.0) ? .pink : .white.opacity(0.86))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private func toggle(_ topic: String) {
        if selectedTopics.contains(topic), selectedTopics.count > 1 {
            selectedTopics.remove(topic)
        } else {
            selectedTopics.insert(topic)
        }
    }

    private func discover() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await xBackendService.discover(topics: Array(selectedTopics), limit: 20)
            items = response.items
            if let firstError = response.errors?.first {
                errorMessage = firstError.message
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save(_ item: XDiscoverItem) async {
        guard let userId = appSession.user?.uid else { return }

        _ = await memoryStore.create(
            userId: userId,
            title: item.title,
            content: item.body ?? item.summary ?? "",
            category: item.category ?? "General",
            tags: item.tags ?? ["xpost"],
            sourceURL: item.url,
            sourceUsername: item.authorUsername.map { "@\($0)" },
            sourceDate: item.postDate ?? item.publishedAt,
            type: "x_post",
            links: (item.links ?? []).map {
                NomiMemoryLink(url: $0.url, displayUrl: $0.displayUrl, title: $0.title)
            },
            media: (item.media ?? []).map {
                NomiMemoryMedia(
                    type: $0.type,
                    url: $0.url,
                    previewImageUrl: $0.previewImageUrl,
                    altText: $0.altText,
                    width: $0.width,
                    height: $0.height,
                    variants: ($0.variants ?? []).map {
                        NomiMemoryMediaVariant(url: $0.url, contentType: $0.contentType, bitRate: $0.bitRate)
                    }
                )
            },
            referencedPosts: (item.referencedPosts ?? []).map {
                NomiReferencedPost(
                    id: $0.id,
                    referenceType: $0.referenceType,
                    username: $0.username.map { "@\($0)" },
                    url: $0.url,
                    text: $0.text,
                    postDate: $0.postDate,
                    links: ($0.links ?? []).map {
                        NomiMemoryLink(url: $0.url, displayUrl: $0.displayUrl, title: $0.title)
                    },
                    media: ($0.media ?? []).map {
                        NomiMemoryMedia(
                            type: $0.type,
                            url: $0.url,
                            previewImageUrl: $0.previewImageUrl,
                            altText: $0.altText,
                            width: $0.width,
                            height: $0.height,
                            variants: ($0.variants ?? []).map {
                                NomiMemoryMediaVariant(url: $0.url, contentType: $0.contentType, bitRate: $0.bitRate)
                            }
                        )
                    }
                )
            }
        )
    }
}

private struct XDiscoverCard: View {
    let item: XDiscoverItem
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(item.title)
                    .font(.headline)
                Spacer()
                Text(item.category ?? "X")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.pink)
            }

            Text(item.body ?? item.summary ?? "")
                .font(.body)
                .lineLimit(6)

            HStack {
                if let postDate = item.postDate ?? item.publishedAt {
                    Text(NomiFormatters.shortDate.string(from: postDate))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button("Save") {
                    onSave()
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.pink)
            }
        }
        .padding(16)
        .background(.white.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
