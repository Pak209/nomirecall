import SwiftUI

struct MemoryCardView: View {
    let memory: NomiMemory
    @AppStorage("nomi.postTextSize") private var postTextSizeRaw = NomiPostTextSize.standard.rawValue

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(memory.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Spacer(minLength: 12)

                HStack(spacing: 7) {
                    if memory.isFavorite {
                        Image(systemName: "heart.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.nomiPink)
                    }

                    if memory.isArchived {
                        Image(systemName: "archivebox.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.nomiMuted)
                    }

                    Text(memory.category.isEmpty ? "General" : memory.category)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.pink)
                        .lineLimit(1)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(.pink.opacity(0.1))
                .clipShape(Capsule())
            }

            Text("\(memory.displayType) · \(memory.displayDate)")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if !memory.previewText.isEmpty {
                Text(memory.previewText)
                    .font(.system(size: postTextSize.feedPreviewSize))
                    .foregroundStyle(.primary)
                    .lineLimit(postTextSize.feedPreviewLineLimit)
            }

            if let link = memory.previewLink {
                LinkPreviewCard(url: link.url, storedTitle: link.title, storedThumbnail: link.thumbnail)
            }

            if !memory.media.isEmpty || memory.links.count > 1 || !memory.referencedPosts.isEmpty {
                HStack(spacing: 12) {
                    if !memory.media.isEmpty {
                        Label("\(memory.media.count)", systemImage: "photo.on.rectangle")
                    }
                    if memory.links.count > 1 {
                        Label("+\(memory.links.count - 1)", systemImage: "link")
                    }
                    if !memory.referencedPosts.isEmpty {
                        Label("\(memory.referencedPosts.count)", systemImage: "arrow.triangle.branch")
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }

            if !memory.concepts.isEmpty || !memory.entities.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array((memory.concepts + memory.entities).prefix(3)), id: \.self) { value in
                        Text(value)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.nomiMuted)
                            .lineLimit(1)
                    }
                }
            }

            if !memory.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(memory.tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Color.nomiCardStrong)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private var postTextSize: NomiPostTextSize {
        NomiPostTextSize.value(for: postTextSizeRaw)
    }
}
