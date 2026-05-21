import SwiftUI

struct DailyBriefView: View {
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                Group {
                    if intelligenceStore.isLoadingBrief && intelligenceStore.todayBrief == nil {
                        ProgressView()
                    } else if let brief = intelligenceStore.todayBrief {
                        briefContent(brief)
                    } else if let errorMessage = intelligenceStore.errorMessage {
                        briefErrorState(errorMessage)
                    } else {
                        EmptyStateView(
                            title: "No brief yet",
                            message: "Nomi will summarize today once there are saved memories to review."
                        )
                        .padding()
                    }
                }
            }
            .navigationTitle("Daily Brief")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await intelligenceStore.loadTodayBrief(forceRegenerate: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task {
                if intelligenceStore.todayBrief == nil {
                    await intelligenceStore.loadTodayBrief()
                }
            }
            .navigationDestination(for: NomiMemory.self) { memory in
                MemoryDetailView(memory: memory)
            }
        }
    }

    private func briefContent(_ brief: NomiDailyBrief) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(brief.dateKey)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.nomiPink)

                    Text(brief.title)
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .foregroundStyle(Color.nomiInk)

                    Text("Based on your saved memories")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)

                    Text(brief.overview)
                        .font(.body)
                        .foregroundStyle(Color.nomiInk)
                }
                .briefCard()

                metricRow(brief)
                themeSection(brief)
                memoryRefSection("Best saves", refs: brief.bestSaves)
                ideasSection(brief)
                memoryRefSection("Connected older memories", refs: brief.connectedOlderMemories)
                projectLinksSection(brief)
                followUpsSection(brief)
            }
            .padding(18)
            .padding(.bottom, 40)
        }
    }

    private func briefErrorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title.weight(.bold))
                .foregroundStyle(Color.nomiOrange)
                .frame(width: 64, height: 64)
                .background(Color.nomiOrange.opacity(0.11), in: Circle())

            Text("Brief needs attention")
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.nomiInk)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 10)

            Button {
                Task { await intelligenceStore.loadTodayBrief(forceRegenerate: true) }
            } label: {
                Label("Try again", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiSecondaryButtonStyle())
        }
        .padding(22)
        .frame(maxWidth: .infinity)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
        .padding()
    }

    private func metricRow(_ brief: NomiDailyBrief) -> some View {
        HStack(spacing: 10) {
            briefMetric("\(brief.savedCount)", label: "Saved")
            briefMetric("\(brief.mainThemes.count)", label: "Themes")
            briefMetric("\(brief.actionableIdeas.count)", label: "Ideas")
        }
    }

    private func briefMetric(_ value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(Color.nomiInk)
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func themeSection(_ brief: NomiDailyBrief) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Main themes")
            if brief.mainThemes.isEmpty {
                emptyLine("Themes will appear after Nomi has more saves to connect.")
            } else {
                ForEach(brief.mainThemes, id: \.self) { theme in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(theme.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(Color.nomiInk)
                        if let summary = theme.summary, !summary.isEmpty {
                            Text(summary)
                                .font(.caption)
                                .foregroundStyle(Color.nomiMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }
        .briefCard()
    }

    private func memoryRefSection(_ title: String, refs: [NomiBriefMemoryRef]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(title)
            if refs.isEmpty {
                emptyLine("Nothing to show yet.")
            } else {
                ForEach(refs, id: \.self) { ref in
                    if let memory = memoryStore.memories.first(where: { $0.id == ref.memoryId }) {
                        NavigationLink(value: memory) {
                            briefRefRow(title: ref.title ?? memory.title, reason: ref.reason)
                        }
                        .buttonStyle(.plain)
                    } else {
                        briefRefRow(title: ref.title ?? "Saved memory", reason: ref.reason)
                    }
                }
            }
        }
        .briefCard()
    }

    private func ideasSection(_ brief: NomiDailyBrief) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Actionable ideas")
            if brief.actionableIdeas.isEmpty {
                emptyLine("No action ideas yet.")
            } else {
                ForEach(brief.actionableIdeas, id: \.self) { idea in
                    Label(idea.text, systemImage: "checkmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiInk)
                }
            }
        }
        .briefCard()
    }

    private func projectLinksSection(_ brief: NomiDailyBrief) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Suggested projects")
            let links = brief.suggestedProjectLinks ?? []
            if links.isEmpty {
                emptyLine("Project suggestions will appear when saves cluster around a goal.")
            } else {
                ForEach(links, id: \.self) { link in
                    briefRefRow(title: link.projectName ?? "Project idea", reason: link.reason)
                }
            }
        }
        .briefCard()
    }

    private func followUpsSection(_ brief: NomiDailyBrief) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Follow up")
            if brief.suggestedFollowUps.isEmpty {
                emptyLine("No follow-ups yet.")
            } else {
                ForEach(brief.suggestedFollowUps, id: \.self) { item in
                    Label(item, systemImage: "arrow.turn.down.right")
                        .font(.subheadline)
                        .foregroundStyle(Color.nomiInk)
                }
            }
        }
        .briefCard()
    }

    private func briefRefRow(title: String, reason: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline.bold())
                .foregroundStyle(Color.nomiInk)
                .lineLimit(2)
            Text(reason)
                .font(.caption)
                .foregroundStyle(Color.nomiMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.headline.bold())
            .foregroundStyle(Color.nomiInk)
    }

    private func emptyLine(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Color.nomiMuted)
    }
}

private extension View {
    func briefCard() -> some View {
        self
            .padding(14)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}
