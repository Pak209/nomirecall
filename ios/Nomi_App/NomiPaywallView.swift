import RevenueCat
import SwiftUI

struct NomiPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var purchaseStore: PurchaseStore

    private var monthlyPackage: Package? {
        purchaseStore.offerings?.current?.availablePackages.first { package in
            package.packageType == .monthly
                || package.storeProduct.productIdentifier.lowercased() == "monthly"
        } ?? purchaseStore.offerings?.current?.availablePackages.first
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(spacing: 22) {
                        hero
                        benefits
                        purchasePanel
                        legalText
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 28)
                    .padding(.bottom, 34)
                }
            }
            .navigationTitle("Nomi Pro")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await purchaseStore.refresh()
            }
        }
    }

    private var hero: some View {
        VStack(spacing: 16) {
            Image("NomiMascot")
                .resizable()
                .scaledToFit()
                .frame(width: 150, height: 150)
                .shadow(color: .pink.opacity(0.22), radius: 20, y: 10)

            VStack(spacing: 8) {
                Text("Unlock Nomi Pro")
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)

                Text("Capture more, recall faster, and discover better memories with Nomi.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 14) {
            PaywallBenefitRow(
                systemImage: "sparkles",
                title: "Smarter recall",
                detail: "Ask Nomi questions and surface the memories that matter."
            )
            PaywallBenefitRow(
                systemImage: "tray.and.arrow.down.fill",
                title: "More ways to save",
                detail: "Keep notes, links, X posts, images, and voice captures together."
            )
            PaywallBenefitRow(
                systemImage: "bolt.fill",
                title: "Discovery powered by your interests",
                detail: "Find relevant posts and ideas without starting from a blank page."
            )
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var purchasePanel: some View {
        VStack(spacing: 14) {
            if purchaseStore.hasNomiPro {
                Text("Nomi Pro is active")
                    .font(.title3.bold())
                    .foregroundStyle(.green)
            } else if let monthlyPackage {
                VStack(spacing: 6) {
                    Text("Monthly")
                        .font(.headline)
                    Text(monthlyPackage.storeProduct.localizedPriceString)
                        .font(.title2.bold())
                }

                Button {
                    Task {
                        await purchaseStore.purchase(monthlyPackage)
                    }
                } label: {
                    HStack {
                        if purchaseStore.isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(purchaseStore.isLoading ? "Processing..." : "Start Nomi Pro")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(NomiPrimaryButtonStyle())
                .disabled(purchaseStore.isLoading)
            } else {
                VStack(spacing: 8) {
                    ProgressView()
                    Text("Loading subscription...")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }

            if let errorMessage = purchaseStore.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button("Restore purchases") {
                Task {
                    await purchaseStore.restorePurchases()
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.pink)
            .disabled(purchaseStore.isLoading)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(.white.opacity(0.94))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var legalText: some View {
        Text("Payment is charged to your Apple Account. Subscriptions renew unless canceled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
    }
}

private struct PaywallBenefitRow: View {
    let systemImage: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(.pink)
                .frame(width: 28, height: 28)
                .background(.pink.opacity(0.1))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
