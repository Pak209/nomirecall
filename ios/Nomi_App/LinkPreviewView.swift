import SwiftUI
import LinkPresentation
import UIKit

// MARK: - Rich link previews (X-style cards instead of raw URLs)
//
// Fast path: stored metadata from the memory itself (link title/displayUrl,
// media thumbnail captured at import time) renders instantly with no network.
// Slow path: LPMetadataProvider fetch, cached process-wide so scrolling feeds
// never re-fetch. Failures degrade to a compact domain chip — never a raw
// t.co string.

@MainActor
final class LinkMetadataCache {
    static let shared = LinkMetadataCache()

    private var metadata: [String: LPLinkMetadata] = [:]
    private var images: [String: UIImage] = [:]
    private var inflight: Set<String> = []

    func cached(for url: URL) -> (title: String?, image: UIImage?)? {
        let key = url.absoluteString
        guard let meta = metadata[key] else { return nil }
        return (meta.title, images[key])
    }

    func fetch(_ url: URL) async -> (title: String?, image: UIImage?)? {
        let key = url.absoluteString
        if let hit = cached(for: url) { return hit }
        guard !inflight.contains(key) else { return nil }
        inflight.insert(key)
        defer { inflight.remove(key) }

        let provider = LPMetadataProvider()
        provider.timeout = 12
        guard let meta = try? await provider.startFetchingMetadata(for: url) else { return nil }
        metadata[key] = meta

        if let imageProvider = meta.imageProvider {
            let image: UIImage? = await withCheckedContinuation { continuation in
                imageProvider.loadObject(ofClass: UIImage.self) { object, _ in
                    continuation.resume(returning: object as? UIImage)
                }
            }
            if let image { images[key] = image }
        }
        return (meta.title, images[key])
    }
}

struct LinkPreviewCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    let url: URL
    /// Metadata already stored on the memory — renders instantly when present.
    var storedTitle: String? = nil
    var storedThumbnail: URL? = nil
    var compact = false

    @State private var fetchedTitle: String?
    @State private var fetchedImage: UIImage?
    @State private var didFetch = false

    private var displayHost: String {
        url.host?.replacingOccurrences(of: "www.", with: "") ?? url.absoluteString
    }

    private var bestTitle: String? {
        let stored = storedTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let stored, !stored.isEmpty { return stored }
        return fetchedTitle
    }

    var body: some View {
        Button {
            openURL(url)
        } label: {
            HStack(spacing: 10) {
                thumbnail
                    .frame(width: compact ? 42 : 56, height: compact ? 42 : 56)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(bestTitle ?? displayHost)
                        .font(compact ? .caption.weight(.bold) : .subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(compact ? 1 : 2)
                        .multilineTextAlignment(.leading)

                    Label(displayHost, systemImage: "link")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
            }
            .padding(compact ? 8 : 10)
            .background(Color.nomiCard, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .task(id: url) {
            guard !didFetch, bestTitle == nil || (storedThumbnail == nil && fetchedImage == nil) else { return }
            didFetch = true
            if let result = await LinkMetadataCache.shared.fetch(url) {
                fetchedTitle = result.title
                fetchedImage = result.image
            }
        }
        .accessibilityLabel("Link preview: \(bestTitle ?? displayHost)")
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let storedThumbnail {
            AsyncImage(url: storedThumbnail) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    placeholder
                }
            }
        } else if let fetchedImage {
            Image(uiImage: fetchedImage).resizable().scaledToFill()
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Color.nomiPurple.opacity(0.12)
            Image(systemName: "globe")
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.nomiPurple)
        }
    }
}

extension NomiMemory {
    /// Best URL to preview: the first attached link, else the source URL.
    var previewLink: (url: URL, title: String?, thumbnail: URL?)? {
        if let link = links.first(where: { $0.url != nil }), let url = link.url {
            return (url, link.title, media.first?.previewImageUrl ?? media.first?.url)
        }
        if let sourceURL {
            return (sourceURL, nil, media.first?.previewImageUrl ?? media.first?.url)
        }
        return nil
    }
}
