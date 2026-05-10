import SwiftUI
import RevenueCatUI

struct SettingsView: View {
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var purchaseStore: PurchaseStore
    @State private var isShowingPaywall = false
    @State private var isShowingCustomerCenter = false

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        accountCard
                        subscriptionCard
                        statsCard
                        signOutButton
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $isShowingPaywall) {
                PaywallView(displayCloseButton: true)
            }
            .sheet(isPresented: $isShowingCustomerCenter) {
                CustomerCenterView()
            }
            .task {
                await purchaseStore.refresh()
            }
        }
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Account")
                .font(.title3.bold())

            LabeledContent("Email", value: appSession.profile?.email ?? "Unknown")
            LabeledContent("Onboarding", value: appSession.profile?.onboardingCompleted == true ? "Complete" : "Incomplete")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var statsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Memory")
                .font(.title3.bold())

            LabeledContent("Total captures", value: "\(memoryStore.memories.count)")
            LabeledContent("Categories", value: "\(memoryStore.categories.count)")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var subscriptionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Subscription")
                    .font(.title3.bold())

                Spacer()

                Text(purchaseStore.proStatusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(purchaseStore.hasNomiPro ? .green : .secondary)
            }

            Button {
                isShowingPaywall = true
            } label: {
                Text(purchaseStore.hasNomiPro ? "View plans" : "Upgrade to Nomi Pro")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())

            HStack(spacing: 12) {
                Button("Restore") {
                    Task { await purchaseStore.restorePurchases() }
                }
                .buttonStyle(NomiSecondaryButtonStyle())

                Button("Customer Center") {
                    isShowingCustomerCenter = true
                }
                .buttonStyle(NomiSecondaryButtonStyle())
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var signOutButton: some View {
        Button {
            appSession.signOut()
        } label: {
            Text("Sign out")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(NomiSecondaryButtonStyle())
    }
}
