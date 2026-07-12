import SwiftUI

// MARK: - Invite friends / redeem a code
//
// One surface for both sides of the referral loop: share your code
// (+7 days of Pro for both of you) and redeem a friend's code on a new
// account. All validation is server-side; this view just relays it.

struct ReferralView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var summary: ReferralSummary?
    @State private var isLoading = true
    @State private var redeemCode = ""
    @State private var isRedeeming = false
    @State private var redeemSuccessUntil: String?
    @State private var errorMessage: String?

    private let backendService = XBackendService()

    private var inviteMessage: String {
        let code = summary?.code ?? ""
        return "Join me on Nomi — the second brain that remembers. Use my invite code \(code) for 7 free days of Nomi Pro: \(NomiShareLinks.marketingURL)"
    }

    private var trialActiveUntil: Date? {
        guard let value = summary?.proTrialUntil else { return nil }
        let date = ISO8601DateFormatter().date(from: value)
        guard let date, date > .now else { return nil }
        return date
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        header

                        if isLoading {
                            HStack { Spacer(); ProgressView(); Spacer() }
                                .padding(.vertical, 30)
                        } else if let summary {
                            codeCard(summary)
                            if summary.redeemed != true {
                                redeemCard
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Invite Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .presentationDragIndicator(.visible)
            .task { await load() }
            .alert("Couldn\u{2019}t redeem", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Something went wrong.")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Give 7 days. Get 7 days.")
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiInk)
            Text("Every friend who joins with your code unlocks a week of Nomi Pro — for both of you.")
                .font(.subheadline)
                .foregroundStyle(Color.nomiMuted)

            if let until = trialActiveUntil {
                Label("Pro trial active until \(until.formatted(date: .abbreviated, time: .omitted))", systemImage: "crown.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color.nomiOrange)
                    .padding(.top, 4)
            }
        }
        .padding(.top, 6)
    }

    private func codeCard(_ summary: ReferralSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your invite code")
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.nomiMuted)

            HStack {
                Text(summary.code)
                    .font(.system(size: 30, weight: .black, design: .monospaced))
                    .foregroundStyle(Color.nomiPurple)
                    .kerning(3)
                Spacer()
                Button {
                    UIPasteboard.general.string = summary.code
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.nomiMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Copy code")
            }

            ShareLink(item: inviteMessage) {
                Label("Share your invite", systemImage: "square.and.arrow.up")
                    .font(.headline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.nomiPurple, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .foregroundStyle(.white)
            }

            if let granted = summary.grantedDays, granted > 0 {
                Text("You\u{2019}ve gifted \(granted) of 90 bonus days.")
                    .font(.caption)
                    .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private var redeemCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Have a code?")
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.nomiMuted)

            if let until = redeemSuccessUntil {
                Label("Redeemed! Pro until \(until.prefix(10))", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiPurple)
            } else {
                HStack(spacing: 10) {
                    TextField("Invite code", text: $redeemCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .nomiTextField()

                    Button {
                        Task { await redeem() }
                    } label: {
                        if isRedeeming {
                            ProgressView()
                        } else {
                            Text("Redeem")
                                .font(.subheadline.weight(.black))
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.nomiPurple)
                    .disabled(redeemCode.trimmingCharacters(in: .whitespaces).isEmpty || isRedeeming)
                }
                Text("Codes work within the first 7 days of a new account.")
                    .font(.caption2)
                    .foregroundStyle(Color.nomiMuted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        summary = try? await backendService.referralSummary()
    }

    private func redeem() async {
        isRedeeming = true
        defer { isRedeeming = false }
        do {
            let result = try await backendService.redeemReferral(code: redeemCode.trimmingCharacters(in: .whitespaces).uppercased())
            redeemSuccessUntil = result.proTrialUntil ?? ""
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
