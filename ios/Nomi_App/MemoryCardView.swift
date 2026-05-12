import SwiftUI

struct MemoryCardView: View {
    let memory: NomiMemory

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(memory.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Spacer(minLength: 12)

                Text(memory.category)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.pink)
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
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(4)
            }

            if !memory.media.isEmpty || !memory.links.isEmpty || !memory.referencedPosts.isEmpty {
                HStack(spacing: 12) {
                    if !memory.media.isEmpty {
                        Label("\(memory.media.count)", systemImage: "photo.on.rectangle")
                    }
                    if !memory.links.isEmpty {
                        Label("\(memory.links.count)", systemImage: "link")
                    }
                    if !memory.referencedPosts.isEmpty {
                        Label("\(memory.referencedPosts.count)", systemImage: "arrow.triangle.branch")
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
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
        .background(.white.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.black.opacity(0.06), lineWidth: 1)
        )
    }
}
