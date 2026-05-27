import SwiftUI
import PhotosUI
import RevenueCatUI
import FirebaseAuth
import UIKit

struct SettingsView: View {
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var appSession: AppSession
    @EnvironmentObject private var memoryStore: MemoryStore
    @EnvironmentObject private var intelligenceStore: IntelligenceStore
    @EnvironmentObject private var purchaseStore: PurchaseStore
    @State private var isShowingPaywall = false
    @State private var isShowingCustomerCenter = false
    @State private var isShowingMoreOptions = false
    @State private var isEditingUsername = false
    @State private var isConfirmingAccountDeletion = false
    @State private var isDeletingAccount = false
    @State private var accountDeletionError: String?
    @State private var isShowingAccountDeletionError = false
    @State private var xBookmarkStatus: XBookmarkStatusResponse?
    @State private var isLoadingXBookmarks = false
    @State private var isSyncingXBookmarks = false
    @State private var isUpdatingDailySync = false
    @State private var aiUsageStatus: AIUsageMetadata?
    @State private var xBookmarkMessage: String?
    @State private var xBookmarkMessageTint = Color.nomiMuted
    @State private var selectedProfilePhoto: PhotosPickerItem?
    @State private var isUploadingProfilePhoto = false
    @State private var profilePhotoMessage: String?
    @State private var usernameDraft = ""
    @State private var usernameMessage: String?
    @State private var isSavingUsername = false
    #if DEBUG
    @State private var isCopyingDebugToken = false
    @State private var debugTokenMessage: String?
    #endif

    private let accountDeletionService = AccountDeletionService()
    private let xBackendService = XBackendService()
    private let appleSubscriptionURL = URL(string: "https://apps.apple.com/account/subscriptions")
    private let privacyPolicyURL = BackendConfig.publicBaseURL.appendingPathComponent("privacy")
    private let termsOfUseURL = BackendConfig.publicBaseURL.appendingPathComponent("terms")

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        profileOverviewCard
                        xBookmarksCard
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                    .padding(.bottom, 104)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $isShowingPaywall) {
                NomiPaywallView()
            }
            .sheet(isPresented: $isShowingCustomerCenter) {
                CustomerCenterView()
            }
            .sheet(isPresented: $isShowingMoreOptions) {
                moreOptionsSheet
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $isEditingUsername) {
                usernameEditorSheet
                    .presentationDetents([.height(280)])
                    .presentationDragIndicator(.visible)
            }
            .confirmationDialog(
                "Delete your Nomi account?",
                isPresented: $isConfirmingAccountDeletion,
                titleVisibility: .visible
            ) {
                Button("Delete Account Forever", role: .destructive) {
                    Task { await deleteAccount() }
                }

                Button("Cancel", role: .cancel) {}
            } message: {
                Text(deleteAccountConfirmationCopy)
            }
            .alert("Could not delete account", isPresented: $isShowingAccountDeletionError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(accountDeletionError ?? "Please try again.")
            }
            .task {
                await purchaseStore.refresh()
                await loadXBookmarkStatus()
                await intelligenceStore.loadTodayBrief()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Settings")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.nomiInk)

                Text("Manage your profile and connections")
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
            }

            Spacer()

            Button {
                isShowingMoreOptions = true
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .frame(width: 42, height: 42)
                    .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.nomiStroke, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open settings options")
        }
        .padding(.top, 10)
    }

    private var profileOverviewCard: some View {
        settingsCard(icon: "person", iconTint: Color.nomiCoral, title: "Profile", accessory: aiTierLabel) {
            HStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    NomiAvatarView(
                        name: appSession.profile?.displayName ?? appSession.profile?.email,
                        imageURL: appSession.profile?.photoURL,
                        size: 58,
                        fontSize: 20
                    )

                    PhotosPicker(selection: $selectedProfilePhoto, matching: .images) {
                        Image(systemName: isUploadingProfilePhoto ? "hourglass" : "camera.fill")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(.white)
                            .frame(width: 24, height: 24)
                            .background(Color.nomiPink, in: Circle())
                            .overlay(Circle().stroke(Color.nomiCardStrong, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .disabled(isUploadingProfilePhoto)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(displayProfileName)
                        .font(.headline.bold())
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Text(profileHandle)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)

                    Button {
                        usernameDraft = appSession.profile?.username ?? ""
                        usernameMessage = nil
                        isEditingUsername = true
                    } label: {
                        Text(appSession.profile?.username?.isEmpty == false ? "Edit username" : "Choose username")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.nomiPink)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: 6) {
                    inlineStat(value: "\(memoryStore.memories.count)", label: "Captures")
                    inlineStat(value: "\(memoryStore.categories.count)", label: "Categories")
                }
                .frame(width: 78, alignment: .trailing)
            }
            .padding(10)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )

            VStack(spacing: 0) {
                compactInfoRow(icon: "envelope", title: "Email", value: appSession.profile?.email ?? "Unknown")
                Divider().padding(.leading, 28)
                compactInfoRow(icon: "bolt.circle", title: "AI usage", value: aiUsageTodayLabel, valueColor: (currentAiUsage?.remaining ?? 1) == 0 ? Color.nomiOrange : Color.nomiMuted)
                Divider().padding(.leading, 28)
                compactInfoRow(icon: "gauge.with.dots.needle.33percent", title: "Limit", value: aiLimitLabel, valueColor: Color.nomiMuted)
                Divider().padding(.leading, 28)
                compactInfoRow(icon: "doc.text.magnifyingglass", title: "Last brief", value: lastBriefLabel, valueColor: Color.nomiMuted)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )

            signOutButton

            if let profilePhotoMessage {
                statusStrip(message: profilePhotoMessage, tint: Color.nomiOrange, icon: "info.circle")
            }
        }
        .onChange(of: selectedProfilePhoto) { _, item in
            guard let item else { return }
            Task { await uploadProfilePhoto(item) }
        }
    }

    private var accountCard: some View {
        settingsCard(icon: "person", iconTint: Color.nomiCoral, title: "Account") {
            HStack(spacing: 13) {
                ZStack(alignment: .bottomTrailing) {
                    NomiAvatarView(
                        name: appSession.profile?.displayName ?? appSession.profile?.email,
                        imageURL: appSession.profile?.photoURL,
                        size: 64,
                        fontSize: 22
                    )

                    PhotosPicker(selection: $selectedProfilePhoto, matching: .images) {
                        Image(systemName: isUploadingProfilePhoto ? "hourglass" : "camera.fill")
                            .font(.caption.weight(.black))
                            .foregroundStyle(.white)
                            .frame(width: 25, height: 25)
                            .background(Color.nomiPink, in: Circle())
                            .overlay(Circle().stroke(Color.nomiCardStrong, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .disabled(isUploadingProfilePhoto)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(appSession.profile?.displayName ?? "Nomi friend")
                        .font(.headline.bold())
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    Text(appSession.profile?.email ?? "Add your profile details")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)

                    Text(isUploadingProfilePhoto ? "Uploading photo..." : "Edit photo")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.nomiPink)
                }

                Spacer()
            }
            .padding(10)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )

            VStack(spacing: 0) {
                compactInfoRow(icon: "envelope", title: "Email", value: appSession.profile?.email ?? "Unknown")
                Divider().padding(.leading, 28)
                compactInfoRow(
                    icon: "checkmark.circle",
                    title: "Onboarding",
                    value: appSession.profile?.onboardingCompleted == true ? "Complete" : "Incomplete",
                    valueColor: appSession.profile?.onboardingCompleted == true ? .green : .secondary,
                    trailingIcon: appSession.profile?.onboardingCompleted == true ? "checkmark.circle" : nil
                )
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )

            signOutButton
                .padding(.top, 8)

            if let profilePhotoMessage {
                statusStrip(message: profilePhotoMessage, tint: Color.nomiOrange, icon: "info.circle")
            }
        }
        .onChange(of: selectedProfilePhoto) { _, item in
            guard let item else { return }
            Task { await uploadProfilePhoto(item) }
        }
    }

    private var statsCard: some View {
        settingsCard(icon: "brain.head.profile", iconTint: Color.nomiPink, title: "Memory") {
            HStack(spacing: 0) {
                statTile(value: "\(memoryStore.memories.count)", label: "Total captures")
                Divider().frame(height: 30)
                statTile(value: "\(memoryStore.categories.count)", label: "Categories")
                Divider().frame(height: 30)
                statTile(value: "0", label: "Exports")
            }
            .padding(.vertical, 7)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
        }
    }

    private var subscriptionCard: some View {
        settingsCard(icon: "crown", iconTint: Color.nomiOrange, title: "Nomi Pro", accessory: purchaseStore.proStatusLabel) {
            Button {
                isShowingPaywall = true
            } label: {
                Label(purchaseStore.hasNomiPro ? "View plans" : "Upgrade to Nomi Pro", systemImage: "crown")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())

            HStack(spacing: 12) {
                Button {
                    Task { await purchaseStore.restorePurchases() }
                } label: {
                    if purchaseStore.isLoading {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Restore")
                        }
                    } else {
                        Label("Restore", systemImage: "arrow.clockwise")
                    }
                }
                .buttonStyle(CompactSettingsButtonStyle())
                .disabled(purchaseStore.isLoading)

                Button {
                    isShowingCustomerCenter = true
                } label: {
                    Label("Customer Center", systemImage: "headphones")
                }
                .buttonStyle(CompactSettingsButtonStyle())

                Button {
                    openAppleSubscriptionSettings()
                } label: {
                    Label("Manage", systemImage: "gearshape")
                }
                .buttonStyle(CompactSettingsButtonStyle())
            }

            if purchaseStore.hasNomiPro {
                statusStrip(
                    message: "Apple billing must be canceled separately in Subscriptions.",
                    tint: .secondary,
                    icon: "info.circle"
                )
            } else if purchaseStore.hasExpiredNomiPro {
                statusStrip(
                    message: "Previous Nomi Pro access is no longer active.",
                    tint: .secondary,
                    icon: "info.circle"
                )
            }

            if let successMessage = purchaseStore.successMessage {
                statusStrip(message: successMessage, tint: .green, icon: "checkmark.circle")
            }

            if let errorMessage = purchaseStore.errorMessage {
                statusStrip(message: errorMessage, tint: Color.nomiOrange, icon: "info.circle")
            }
        }
    }

    private var xBookmarksCard: some View {
        settingsCard(
            icon: "bookmark",
            iconTint: Color.nomiPink,
            title: "X Bookmarks",
            accessory: xBookmarkStatus?.connected == true ? "Connected" : "Not connected"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                if xBookmarkStatus?.connected == true {
                    compactInfoRow(
                        icon: "person.crop.circle",
                        title: "Account",
                        value: xBookmarkStatus?.username.map { "@\($0)" } ?? "Connected",
                        valueColor: Color.nomiMuted
                    )

                    compactInfoRow(
                        icon: "clock.arrow.circlepath",
                        title: "Last sync",
                        value: lastXBookmarkSyncLabel,
                        valueColor: Color.nomiMuted
                    )

                    compactInfoRow(
                        icon: "tray.and.arrow.down",
                        title: "Recent import",
                        value: "\(xBookmarkStatus?.lastImportedCount ?? 0) new · \(xBookmarkStatus?.lastDuplicateCount ?? 0) skipped",
                        valueColor: Color.nomiMuted
                    )
                } else {
                    Text("Import new X bookmarks into private Nomi memories when you sync.")
                        .font(.caption)
                        .foregroundStyle(Color.nomiMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        xBookmarkPrimaryButton
                        xBookmarkRefreshButton
                        if xBookmarkStatus?.connected == true {
                            xBookmarkDisconnectButton
                        }
                    }

                    VStack(spacing: 10) {
                        xBookmarkPrimaryButton
                        HStack(spacing: 12) {
                            xBookmarkRefreshButton
                            if xBookmarkStatus?.connected == true {
                                xBookmarkDisconnectButton
                            }
                        }
                    }
                }

                if let xBookmarkMessage {
                    statusStrip(message: xBookmarkMessage, tint: xBookmarkMessageTint, icon: "info.circle")
                }

                if xBookmarkStatus?.lastSyncStatus == "failed", let lastSyncError = xBookmarkStatus?.lastSyncError, !lastSyncError.isEmpty {
                    statusStrip(message: lastSyncError, tint: Color.nomiOrange, icon: "exclamationmark.circle")
                }

                if xBookmarkStatus?.connected == true {
                    HStack(spacing: 10) {
                        Label("Daily sync", systemImage: "calendar.badge.clock")
                            .font(.subheadline)
                            .foregroundStyle(Color.nomiInk)

                        Spacer()

                        Toggle("", isOn: Binding(
                            get: { xBookmarkStatus?.dailySyncEnabled == true },
                            set: { enabled in
                                Task { await updateDailySync(enabled: enabled) }
                            }
                        ))
                            .labelsHidden()
                            .disabled(isUpdatingDailySync)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.nomiStroke, lineWidth: 1)
                    )
                }
            }
        }
    }

    private var intelligenceCard: some View {
        settingsCard(icon: "sparkles", iconTint: Color.nomiPink, title: "Intelligence", accessory: aiTierLabel) {
            VStack(spacing: 0) {
                compactInfoRow(
                    icon: "bolt.circle",
                    title: "AI usage today",
                    value: aiUsageTodayLabel,
                    valueColor: (currentAiUsage?.remaining ?? 1) == 0 ? Color.nomiOrange : Color.nomiMuted
                )
                Divider().padding(.leading, 28)
                compactInfoRow(
                    icon: "gauge.with.dots.needle.33percent",
                    title: "Daily limit",
                    value: aiLimitLabel,
                    valueColor: Color.nomiMuted
                )
                Divider().padding(.leading, 28)
                compactInfoRow(
                    icon: "doc.text.magnifyingglass",
                    title: "Last Nomi Brief",
                    value: lastBriefLabel,
                    valueColor: Color.nomiMuted
                )
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
        }
    }

    private var xBookmarkPrimaryButton: some View {
        Button {
            Task {
                if xBookmarkStatus?.connected == true {
                    await syncXBookmarks()
                } else {
                    await connectXBookmarks()
                }
            }
        } label: {
            if isLoadingXBookmarks || isSyncingXBookmarks {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(xBookmarkStatus?.connected == true ? "Syncing" : "Connecting")
                }
            } else {
                Label(xBookmarkStatus?.connected == true ? "Sync now" : "Connect X", systemImage: xBookmarkStatus?.connected == true ? "arrow.triangle.2.circlepath" : "link")
            }
        }
        .buttonStyle(CompactSettingsButtonStyle())
        .disabled(isLoadingXBookmarks || isSyncingXBookmarks)
    }

    private var xBookmarkRefreshButton: some View {
        Button {
            Task { await loadXBookmarkStatus() }
        } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
        }
        .buttonStyle(CompactSettingsButtonStyle())
        .disabled(isLoadingXBookmarks || isSyncingXBookmarks)
    }

    private var xBookmarkDisconnectButton: some View {
        Button(role: .destructive) {
            Task { await disconnectXBookmarks() }
        } label: {
            Label("Disconnect", systemImage: "xmark.circle")
        }
        .buttonStyle(CompactSettingsButtonStyle())
        .disabled(isLoadingXBookmarks || isSyncingXBookmarks)
    }

    private var dangerZoneCard: some View {
        settingsCard(icon: "exclamationmark.triangle", iconTint: Color.nomiCoral, title: "Danger Zone") {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 16) {
                    dangerDescription
                    Spacer(minLength: 8)
                    deleteAccountButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    dangerDescription
                    deleteAccountButton
                }
            }
        }
    }

    private var legalCard: some View {
        settingsCard(icon: "shield.lefthalf.filled", iconTint: Color.nomiPink, title: "Legal") {
            HStack(spacing: 12) {
                Button {
                    openURL(privacyPolicyURL)
                } label: {
                    Label("Privacy Policy", systemImage: "doc.text")
                }
                .buttonStyle(CompactSettingsButtonStyle())

                Button {
                    openURL(termsOfUseURL)
                } label: {
                    Label("Terms of Use", systemImage: "scalemass")
                }
                .buttonStyle(CompactSettingsButtonStyle())
            }
        }
    }

    #if DEBUG
    private var developerDebugCard: some View {
        settingsCard(icon: "wrench.and.screwdriver", iconTint: Color.nomiOrange, title: "Developer Debug") {
            Text(BackendConfig.allowsLocalDebugTools
                ? "Local backend: \(BackendConfig.apiBaseURL.absoluteString)"
                : "Point this Debug build at localhost to enable token copy. Current backend: \(BackendConfig.apiBaseURL.host ?? "unknown")")
                .font(.caption)
                .foregroundStyle(Color.nomiMuted)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await copyDebugAuthToken() }
            } label: {
                if isCopyingDebugToken {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Copying")
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Label("Copy debug auth token", systemImage: "key")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(CompactSettingsButtonStyle())
            .disabled(isCopyingDebugToken || Auth.auth().currentUser == nil || !BackendConfig.allowsLocalDebugTools)

            if let debugTokenMessage {
                statusStrip(message: debugTokenMessage, tint: Color.nomiOrange, icon: "info.circle")
            }
        }
    }
    #endif

    private var signOutButton: some View {
        Button {
            appSession.signOut()
        } label: {
            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(CompactSettingsButtonStyle())
    }

    private var dangerDescription: some View {
        Text("Delete your profile, saved memories, and uploaded files from Firebase.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var deleteAccountButton: some View {
        Button(role: .destructive) {
            isConfirmingAccountDeletion = true
        } label: {
            if isDeletingAccount {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Deleting")
                }
            } else {
                Label("Delete Account", systemImage: "trash")
            }
        }
        .buttonStyle(CompactSettingsButtonStyle())
        .disabled(isDeletingAccount)
    }

    private var moreOptionsSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    subscriptionCard
                    legalCard
                    dangerZoneCard
                    #if DEBUG
                    developerDebugCard
                    #endif
                    Text("Nomi v1.0.0")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.nomiMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
                .padding(18)
            }
            .background(NomiBackground())
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var usernameEditorSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("Choose a username")
                    .font(.title3.bold())
                    .foregroundStyle(Color.nomiInk)

                TextField("username", text: $usernameDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .nomiTextField()

                if let usernameMessage {
                    statusStrip(message: usernameMessage, tint: Color.nomiOrange, icon: "info.circle")
                }

                Button {
                    Task { await saveUsername() }
                } label: {
                    if isSavingUsername {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Saving")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Save username")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(NomiPrimaryButtonStyle())
                .disabled(isSavingUsername)

                Spacer()
            }
            .padding(20)
            .background(NomiBackground())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isEditingUsername = false }
                }
            }
        }
    }

    private func settingsCard<Content: View>(
        icon: String,
        iconTint: Color,
        title: String,
        accessory: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(iconTint)
                    .frame(width: 34, height: 34)
                    .background(iconTint.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                Text(title)
                    .font(.headline.bold())
                    .foregroundStyle(Color.nomiInk)

                Spacer()

                if let accessory {
                    Text(accessory)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(purchaseStore.hasNomiPro ? .green : .secondary)
                }
            }

            content()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.nomiStroke, lineWidth: 1)
        )
    }

    private func compactInfoRow(
        icon: String,
        title: String,
        value: String,
        valueColor: Color = .secondary,
        trailingIcon: String? = nil
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiMuted)
                .frame(width: 18)

            Text(title)
                .font(.subheadline)
                .foregroundStyle(Color.nomiInk)

            Spacer(minLength: 8)

            Text(value)
                .font(.caption.weight(.medium))
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.74)

            if let trailingIcon {
                Image(systemName: trailingIcon)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(valueColor)
            }
        }
        .frame(minHeight: 31)
    }

    private func statTile(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(Color.nomiInk)

            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.74)
        }
        .frame(maxWidth: .infinity)
    }

    private func inlineStat(value: String, label: String) -> some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(value)
                .font(.subheadline.bold())
                .foregroundStyle(Color.nomiInk)
                .monospacedDigit()
                .lineLimit(1)
        }
    }

    private func statusStrip(message: String, tint: Color, icon: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)

            Text(message)
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.nomiMuted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var deleteAccountConfirmationCopy: String {
        var copy = "This permanently deletes your Nomi profile, all saved memories, and uploaded files. You will lose access to this account inside Nomi."

        if purchaseStore.hasNomiPro {
            copy += " Your Nomi Pro subscription is billed by Apple and must be canceled separately in Apple Subscriptions."
        }

        return copy
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }

        do {
            try await accountDeletionService.deleteCurrentUserAccount()
            memoryStore.reset()
            appSession.signOut()
        } catch {
            accountDeletionError = error.localizedDescription
            isShowingAccountDeletionError = true
        }
    }

    private func openAppleSubscriptionSettings() {
        guard let appleSubscriptionURL else { return }
        openURL(appleSubscriptionURL)
    }

    #if DEBUG
    @MainActor
    private func copyDebugAuthToken() async {
        guard BackendConfig.allowsLocalDebugTools else {
            debugTokenMessage = "Debug token tools are only available for local backend builds."
            return
        }

        guard let user = Auth.auth().currentUser else {
            debugTokenMessage = "Sign in before copying a debug token."
            return
        }

        isCopyingDebugToken = true
        defer { isCopyingDebugToken = false }

        do {
            let token = try await user.getIDToken()
            UIPasteboard.general.string = token
            debugTokenMessage = "Copied. Paste it into NOMI_DEBUG_AUTH_TOKEN for local CLI runs."
        } catch {
            debugTokenMessage = "Could not copy token: \(error.localizedDescription)"
        }
    }
    #endif

    private var lastXBookmarkSyncLabel: String {
        guard let date = xBookmarkStatus?.lastSyncedAt else { return "Never" }
        return NomiFormatters.shortDate.string(from: date)
    }

    private var xBookmarkLastResultLabel: String {
        switch xBookmarkStatus?.lastSyncStatus {
        case "success":
            return "Success"
        case "partial_success":
            return "Partial"
        case "failed":
            return "Failed"
        case "retrying":
            return "Retrying"
        default:
            return "Idle"
        }
    }

    private var currentAiUsage: AIUsageMetadata? {
        aiUsageStatus ?? xBookmarkStatus?.aiUsage
    }

    private var aiTierLabel: String {
        switch currentAiUsage?.tier {
        case "admin":
            return "Admin"
        case "early_access":
            return "Early access"
        default:
            return "Free"
        }
    }

    private var aiUsageTodayLabel: String {
        guard let usage = currentAiUsage else { return "Not loaded" }
        let used = usage.used ?? usage.usedAfter ?? 0
        let remaining = usage.remaining ?? usage.remainingAfter ?? max(0, usage.limit - used)
        return "\(used) used · \(remaining) left"
    }

    private var aiLimitLabel: String {
        guard let usage = currentAiUsage else { return "Free includes 10/day" }
        return "\(usage.limit) AI actions/day"
    }

    private var lastBriefLabel: String {
        guard let brief = intelligenceStore.todayBrief else { return "Not generated yet" }
        let status = brief.status ?? (brief.usedAi == true ? "generated" : "fallback")
        return "\(brief.dateKey) · \(status.replacingOccurrences(of: "_", with: " "))"
    }

    private var displayProfileName: String {
        let value = appSession.profile?.username ?? appSession.profile?.displayName ?? "Nomi friend"
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Nomi friend" : trimmed
    }

    private var profileHandle: String {
        if let username = appSession.profile?.username?.trimmingCharacters(in: .whitespacesAndNewlines), !username.isEmpty {
            return "@\(username.replacingOccurrences(of: "@", with: ""))"
        }
        return appSession.profile?.email ?? "Choose your username"
    }

    private func saveUsername() async {
        let cleaned = UserProfileService.normalizedUsername(usernameDraft)
        guard cleaned.count >= 3 else {
            usernameMessage = "Use at least 3 letters or numbers."
            return
        }

        isSavingUsername = true
        defer { isSavingUsername = false }

        do {
            try await appSession.updateUsername(cleaned)
            usernameDraft = cleaned
            usernameMessage = nil
            isEditingUsername = false
        } catch {
            usernameMessage = FirebaseErrorFormatter.userFacingMessage(from: error, action: "Saving your username")
        }
    }

    private func loadXBookmarkStatus() async {
        isLoadingXBookmarks = true
        defer { isLoadingXBookmarks = false }

        do {
            xBookmarkStatus = try await xBackendService.xBookmarkStatus()
            if let aiUsage = xBookmarkStatus?.aiUsage {
                aiUsageStatus = aiUsage
            } else {
                aiUsageStatus = try? await xBackendService.getAiUsageStatus()
            }
        } catch {
            xBookmarkMessage = error.localizedDescription
            xBookmarkMessageTint = Color.nomiOrange
            aiUsageStatus = try? await xBackendService.getAiUsageStatus()
        }
    }

    private func connectXBookmarks() async {
        isLoadingXBookmarks = true
        defer { isLoadingXBookmarks = false }

        do {
            let response = try await xBackendService.connectXBookmarks()
            guard response.configured, let authorizationUrl = response.authorizationUrl else {
                xBookmarkMessage = "X OAuth is not configured on the backend yet."
                xBookmarkMessageTint = Color.nomiOrange
                return
            }
            openURL(authorizationUrl)
            xBookmarkMessage = "After approving X, return here and tap Refresh."
            xBookmarkMessageTint = Color.nomiMuted
        } catch {
            xBookmarkMessage = error.localizedDescription
            xBookmarkMessageTint = Color.nomiOrange
        }
    }

    private func syncXBookmarks() async {
        isSyncingXBookmarks = true
        defer { isSyncingXBookmarks = false }

        do {
            let response = try await xBackendService.syncXBookmarks(limit: 25)
            let imported = response.importedCount ?? response.imported
            let duplicates = response.duplicateCount ?? response.skipped
            let failed = response.failedCount ?? 0

            if response.status == "partial_success" {
                xBookmarkMessage = "Imported \(imported), skipped \(duplicates), failed \(failed)."
                xBookmarkMessageTint = Color.nomiOrange
            } else if response.aiLimitReached == true {
                xBookmarkMessage = "Imported \(imported) bookmarks. Daily AI limit reached; summaries resume tomorrow."
                xBookmarkMessageTint = Color.nomiOrange
            } else if imported == 0 {
                xBookmarkMessage = duplicates > 0
                    ? "No new bookmarks. \(duplicates) already saved."
                    : "No new X bookmarks found."
                xBookmarkMessageTint = Color.nomiMuted
            } else {
                xBookmarkMessage = imported == 1
                    ? "Imported 1 new X bookmark. \(duplicates) skipped."
                    : "Imported \(imported) new X bookmarks. \(duplicates) skipped."
                xBookmarkMessageTint = .green
            }
            await loadXBookmarkStatus()
            if let userId = appSession.user?.uid {
                await memoryStore.load(userId: userId)
            }
        } catch {
            xBookmarkMessage = error.localizedDescription
            xBookmarkMessageTint = Color.nomiOrange
            await loadXBookmarkStatus()
        }
    }

    private func updateDailySync(enabled: Bool) async {
        isUpdatingDailySync = true
        defer { isUpdatingDailySync = false }

        do {
            xBookmarkStatus = try await xBackendService.updateDailySyncEnabled(enabled)
            xBookmarkMessage = enabled ? "Daily X bookmark sync enabled." : "Daily X bookmark sync paused."
            xBookmarkMessageTint = Color.nomiMuted
        } catch {
            xBookmarkMessage = error.localizedDescription
            xBookmarkMessageTint = Color.nomiOrange
            await loadXBookmarkStatus()
        }
    }

    private func disconnectXBookmarks() async {
        isLoadingXBookmarks = true
        defer { isLoadingXBookmarks = false }

        do {
            try await xBackendService.disconnectXBookmarks()
            xBookmarkStatus = nil
            xBookmarkMessage = "X bookmarks disconnected."
            xBookmarkMessageTint = Color.nomiMuted
        } catch {
            xBookmarkMessage = error.localizedDescription
            xBookmarkMessageTint = Color.nomiOrange
        }
    }

    private func uploadProfilePhoto(_ item: PhotosPickerItem) async {
        isUploadingProfilePhoto = true
        profilePhotoMessage = nil
        defer {
            isUploadingProfilePhoto = false
            selectedProfilePhoto = nil
        }

        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                profilePhotoMessage = "Could not read that photo. Please choose another image."
                return
            }
            try await appSession.updateProfileImage(data: data)
        } catch {
            profilePhotoMessage = FirebaseErrorFormatter.userFacingMessage(from: error, action: "Updating your profile photo")
        }
    }
}

private struct CompactSettingsButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.bold))
            .foregroundStyle(Color.nomiPink)
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.nomiPink.opacity(0.20), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.76 : 1.0)
    }
}
