import SwiftUI

struct FriendCircleView: View {
    @EnvironmentObject private var appSession: AppSession
    @StateObject private var store = CircleStore()
    @Environment(\.dismiss) private var dismiss

    @AppStorage("nomi.circleIntroSeen") private var circleIntroSeen = false
    @State private var isShowingIntro = false
    @State private var isShowingAddFriend = false
    @State private var removalTarget: CircleFriend?
    @State private var blockTarget: CircleFriend?

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 22) {
                        header

                        if store.isLoading && isEverythingEmpty {
                            ProgressView()
                                .tint(Color.nomiPink)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
                        } else if isEverythingEmpty {
                            emptyState
                        } else {
                            requestsSection
                            inboxSection
                            friendsSection
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 112)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(Color.nomiInk)
                    }
                    .accessibilityLabel("Close")
                }

                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 2) {
                        Button {
                            isShowingIntro = true
                        } label: {
                            Image(systemName: "questionmark.circle")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(Color.nomiMuted)
                        }
                        .accessibilityLabel("How Circle works")

                        Button {
                            isShowingAddFriend = true
                        } label: {
                            Image(systemName: "plus")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(Color.nomiPink)
                        }
                        .accessibilityLabel("Add friend")
                    }
                }
            }
            .sheet(isPresented: $isShowingAddFriend) {
                AddFriendSheet(store: store)
            }
            .confirmationDialog(
                "Remove this friend?",
                isPresented: removalBinding,
                titleVisibility: .visible,
                presenting: removalTarget
            ) { friend in
                Button("Remove \(friend.profile.displayNameOrUsername)", role: .destructive) {
                    Task { await store.removeFriend(friend.id) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("They will no longer be in your Circle. You can add them again later.")
            }
            .confirmationDialog(
                "Block this person?",
                isPresented: blockBinding,
                titleVisibility: .visible,
                presenting: blockTarget
            ) { friend in
                Button("Block \(friend.profile.displayNameOrUsername)", role: .destructive) {
                    Task { await store.block(friend.profile.id) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("They will be removed from your Circle and cannot send you requests or shares.")
            }
            .alert("Circle", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "Something went wrong.")
            }
            .task { await store.loadAll() }
            .refreshable { await store.loadAll() }
            .onAppear {
                if !circleIntroSeen { isShowingIntro = true }
            }
            .sheet(isPresented: $isShowingIntro) {
                CircleIntroSheet {
                    circleIntroSeen = true
                    isShowingIntro = false
                }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            NomiAvatarView(
                name: appSession.profile?.displayName ?? appSession.profile?.email,
                imageURL: appSession.profile?.photoURL,
                size: 44,
                fontSize: 15
            )

            VStack(alignment: .leading, spacing: 4) {
                Text("Friend Circle")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(Color.nomiInk)

                Text("The people you learn with and from.")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.nomiMuted)
            }

            Spacer()
        }
    }

    // MARK: Requests

    @ViewBuilder
    private var requestsSection: some View {
        if !store.incoming.isEmpty || !store.outgoing.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("Requests")

                VStack(spacing: 12) {
                    ForEach(store.incoming) { profile in
                        IncomingRequestRow(
                            profile: profile,
                            onAccept: { Task { await store.accept(profile.id) } },
                            onDecline: { Task { await store.decline(profile.id) } }
                        )
                    }

                    ForEach(store.outgoing) { profile in
                        OutgoingRequestRow(profile: profile)
                    }
                }
            }
        }
    }

    // MARK: Shared with you

    @ViewBuilder
    private var inboxSection: some View {
        let items = store.newInboxItems
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("Shared with you")

                VStack(spacing: 12) {
                    ForEach(items) { item in
                        InboxCard(
                            item: item,
                            onSave: { await store.saveShare(item.id) },
                            onIgnore: { await store.ignoreShare(item.id) }
                        )
                    }
                }
            }
        }
    }

    // MARK: Friends

    @ViewBuilder
    private var friendsSection: some View {
        if !store.friends.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader("Friends")

                VStack(spacing: 12) {
                    ForEach(store.friends) { friend in
                        FriendRow(
                            friend: friend,
                            onTogglePin: { Task { await store.setPinned(friend.id, !friend.pinned) } },
                            onRemove: { removalTarget = friend },
                            onBlock: { blockTarget = friend }
                        )
                    }
                }
            }
        }
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                title: "Your Circle is quiet",
                message: "My brain stays private. My Circle helps it grow.\n\nAdd a friend by their exact username or email to start sharing ideas."
            )

            Button {
                isShowingAddFriend = true
            } label: {
                Label("Add a friend", systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())
        }
        .padding(.top, 40)
    }

    // MARK: Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline.bold())
            .foregroundStyle(Color.nomiInk)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var isEverythingEmpty: Bool {
        store.incoming.isEmpty
            && store.outgoing.isEmpty
            && store.newInboxItems.isEmpty
            && store.friends.isEmpty
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }

    private var removalBinding: Binding<Bool> {
        Binding(
            get: { removalTarget != nil },
            set: { if !$0 { removalTarget = nil } }
        )
    }

    private var blockBinding: Binding<Bool> {
        Binding(
            get: { blockTarget != nil },
            set: { if !$0 { blockTarget = nil } }
        )
    }
}

// MARK: - Rows

private struct IncomingRequestRow: View {
    let profile: CircleProfile
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            NomiAvatarView(name: profile.displayNameOrUsername, imageURL: profile.photoURL, size: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(profile.displayNameOrUsername)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                if let handle = profile.handle {
                    Text(handle)
                        .font(.caption)
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            HStack(spacing: 8) {
                Button(action: onDecline) {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiMuted)
                        .frame(width: 38, height: 38)
                        .background(Color.nomiField, in: Circle())
                        .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Decline")

                Button(action: onAccept) {
                    Text("Accept")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(
                            LinearGradient(colors: [.orange, .pink], startPoint: .leading, endPoint: .trailing),
                            in: Capsule()
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

private struct OutgoingRequestRow: View {
    let profile: CircleProfile

    var body: some View {
        HStack(spacing: 12) {
            NomiAvatarView(name: profile.displayNameOrUsername, imageURL: profile.photoURL, size: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(profile.displayNameOrUsername)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                if let handle = profile.handle {
                    Text(handle)
                        .font(.caption)
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Text("Pending")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.nomiMuted)
                .padding(.vertical, 8)
                .padding(.horizontal, 14)
                .background(Color.nomiField, in: Capsule())
                .overlay(Capsule().stroke(Color.nomiStroke, lineWidth: 1))
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

private struct InboxCard: View {
    let item: CircleInboxItem
    let onSave: () async -> Bool
    let onIgnore: () async -> Void

    @State private var isWorking = false
    @State private var didSave = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Originally shared by \(item.attribution.displayLabel)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.nomiPink)
                .lineLimit(1)

            Text(snapshotTitle)
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.nomiInk)
                .lineLimit(2)

            if let body = item.snapshot.body?.trimmingCharacters(in: .whitespacesAndNewlines), !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if didSave {
                Label("Saved to your Nomi", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.green)
            } else {
                HStack(spacing: 10) {
                    Button {
                        Task {
                            isWorking = true
                            let ok = await onSave()
                            isWorking = false
                            if ok { didSave = true }
                        }
                    } label: {
                        Label("Save to my Nomi", systemImage: "tray.and.arrow.down")
                            .font(.caption.weight(.bold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(NomiSecondaryButtonStyle())
                    .disabled(isWorking)

                    Button {
                        Task {
                            isWorking = true
                            await onIgnore()
                            isWorking = false
                        }
                    } label: {
                        Text("Ignore")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.nomiMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(isWorking)
                }
            }
        }
        .padding(16)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private var snapshotTitle: String {
        let title = item.snapshot.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "Shared memory" : title
    }
}

private struct FriendRow: View {
    let friend: CircleFriend
    let onTogglePin: () -> Void
    let onRemove: () -> Void
    let onBlock: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onTogglePin) {
                Image(systemName: friend.pinned ? "star.fill" : "star")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(friend.pinned ? Color.nomiPink : Color.nomiMuted)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(friend.pinned ? "Unpin" : "Pin")

            NomiAvatarView(name: friend.profile.displayNameOrUsername, imageURL: friend.profile.photoURL, size: 42)

            VStack(alignment: .leading, spacing: 2) {
                Text(friend.profile.displayNameOrUsername)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.nomiInk)
                    .lineLimit(1)

                if let handle = friend.profile.handle {
                    Text(handle)
                        .font(.caption)
                        .foregroundStyle(Color.nomiMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Menu {
                Button {
                    onTogglePin()
                } label: {
                    Label(friend.pinned ? "Unpin" : "Pin", systemImage: friend.pinned ? "star.slash" : "star")
                }

                Button(role: .destructive) {
                    onRemove()
                } label: {
                    Label("Remove Friend", systemImage: "person.badge.minus")
                }

                Button(role: .destructive) {
                    onBlock()
                } label: {
                    Label("Block", systemImage: "hand.raised")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.nomiMuted)
                    .frame(width: 38, height: 38)
                    .background(Color.nomiField, in: Circle())
                    .overlay(Circle().stroke(Color.nomiStroke, lineWidth: 1))
            }
        }
        .padding(12)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}

// MARK: - Add friend

private struct AddFriendSheet: View {
    @ObservedObject var store: CircleStore
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var result: CircleProfile?
    @State private var didSearch = false
    @State private var isSearching = false
    @State private var didSendTo: Set<String> = []

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("Find someone by their exact username or email. Nomi never shows lists of people.")
                            .font(.subheadline)
                            .foregroundStyle(Color.nomiMuted)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(spacing: 10) {
                            TextField("Exact username or email", text: $query)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.search)
                                .onSubmit { runSearch() }
                                .nomiTextField()

                            Button {
                                runSearch()
                            } label: {
                                Image(systemName: "magnifyingglass")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 48, height: 48)
                                    .background(
                                        LinearGradient(colors: [.orange, .pink], startPoint: .topLeading, endPoint: .bottomTrailing),
                                        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    )
                            }
                            .buttonStyle(.plain)
                            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSearching)
                        }

                        if isSearching {
                            ProgressView()
                                .tint(Color.nomiPink)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 20)
                        } else if let result {
                            resultCard(result)
                        } else if didSearch {
                            Text("No one found with that exact username or email.")
                                .font(.subheadline)
                                .foregroundStyle(Color.nomiMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 8)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(18)
                }
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.nomiPink)
                }
            }
        }
    }

    @ViewBuilder
    private func resultCard(_ profile: CircleProfile) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                NomiAvatarView(name: profile.displayNameOrUsername, imageURL: profile.photoURL, size: 52)

                VStack(alignment: .leading, spacing: 3) {
                    Text(profile.displayNameOrUsername)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    if let handle = profile.handle {
                        Text(handle)
                            .font(.subheadline)
                            .foregroundStyle(Color.nomiMuted)
                            .lineLimit(1)
                    }
                }

                Spacer()
            }

            if let bio = profile.bio?.trimmingCharacters(in: .whitespacesAndNewlines), !bio.isEmpty {
                Text(bio)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            actionButton(for: profile)
        }
        .padding(16)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    @ViewBuilder
    private func actionButton(for profile: CircleProfile) -> some View {
        if store.friends.contains(where: { $0.profile.id == profile.id }) {
            statusPill("Already friends", systemImage: "checkmark.seal.fill")
        } else if store.outgoing.contains(where: { $0.id == profile.id }) || didSendTo.contains(profile.id) {
            statusPill("Pending", systemImage: "clock")
        } else {
            Button {
                Task {
                    if await store.sendRequest(to: profile.id) {
                        didSendTo.insert(profile.id)
                    }
                }
            } label: {
                Label("Send Request", systemImage: "paperplane.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(NomiPrimaryButtonStyle())
        }
    }

    private func statusPill(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.nomiMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.nomiField, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }

    private func runSearch() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            isSearching = true
            let found = await store.search(trimmed)
            result = found
            didSearch = true
            isSearching = false
        }
    }
}

// MARK: - Share to Circle

/// A minimal sheet for sharing a single memory to one friend in your Circle.
struct ShareToCircleSheet: View {
    let memoryId: String

    @StateObject private var store = CircleStore()
    @Environment(\.dismiss) private var dismiss

    @State private var sharedName: String?
    @State private var sharingFriendId: String?

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                Group {
                    if let sharedName {
                        confirmation(name: sharedName)
                    } else if store.isLoading && store.friends.isEmpty {
                        ProgressView()
                            .tint(Color.nomiPink)
                    } else if store.friends.isEmpty {
                        EmptyStateView(
                            title: "No friends yet",
                            message: "Add friends in your Circle first, then you can share memories with them."
                        )
                        .padding(18)
                    } else {
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 12) {
                                ForEach(store.friends) { friend in
                                    friendRow(friend)
                                }
                            }
                            .padding(18)
                        }
                    }
                }
            }
            .navigationTitle("Share to Circle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.nomiPink)
                }
            }
            .alert("Circle", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "Something went wrong.")
            }
            .task { await store.loadAll() }
        }
    }

    private func friendRow(_ friend: CircleFriend) -> some View {
        Button {
            Task { await share(with: friend) }
        } label: {
            HStack(spacing: 12) {
                NomiAvatarView(name: friend.profile.displayNameOrUsername, imageURL: friend.profile.photoURL, size: 42)

                VStack(alignment: .leading, spacing: 2) {
                    Text(friend.profile.displayNameOrUsername)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiInk)
                        .lineLimit(1)

                    if let handle = friend.profile.handle {
                        Text(handle)
                            .font(.caption)
                            .foregroundStyle(Color.nomiMuted)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 8)

                if sharingFriendId == friend.id {
                    ProgressView()
                        .tint(Color.nomiPink)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.nomiPink)
                }
            }
            .padding(12)
            .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(sharingFriendId != nil)
    }

    private func confirmation(name: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 46, weight: .semibold))
                .foregroundStyle(.green)

            Text("Shared with \(name)")
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.nomiInk)
        }
        .padding(30)
    }

    private func share(with friend: CircleFriend) async {
        sharingFriendId = friend.id
        let ok = await store.share(memoryId: memoryId, to: friend.profile.id)
        sharingFriendId = nil
        guard ok else { return }
        sharedName = friend.profile.displayNameOrUsername
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        dismiss()
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }
}


// MARK: - First-run intro

/// One-time explainer shown on first open (reopenable via the ? button).
/// Pure education — no mock data, no fake controls.
private struct CircleIntroSheet: View {
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                NomiBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Welcome to your Circle")
                                .font(.system(size: 28, weight: .black, design: .rounded))
                                .foregroundStyle(Color.nomiInk)
                            Text("My brain stays private. My Circle helps it grow.")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.nomiPurple)
                        }
                        .padding(.top, 8)

                        introCard(
                            icon: "person.badge.plus",
                            title: "Add people you trust",
                            body: "Find friends by their exact username or email — there's no public directory and no follower counts. Friendship is mutual: they approve, you're connected."
                        )

                        introCard(
                            icon: "square.and.arrow.up",
                            title: "Share what matters",
                            body: "Share any memory from its ⋯ menu. Friends receive a copy with your name on it and choose to save it into their own Nomi or pass. Nothing is ever shared automatically."
                        )

                        introCard(
                            icon: "folder.badge.person.crop",
                            title: "Build projects together",
                            body: "Invite friends into a project workspace to brainstorm, answer each other's open questions, and turn shared ideas into decisions and tasks — without exposing anything outside that project.",
                            badge: "Coming Soon"
                        )

                        Button(action: onDone) {
                            Text("Got it")
                                .font(.headline.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.nomiPurple, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 6)
                    }
                    .padding(20)
                }
            }
            .presentationDragIndicator(.visible)
        }
    }

    private func introCard(icon: String, title: String, body text: String, badge: String? = nil) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3.weight(.bold))
                .foregroundStyle(Color.nomiPurple)
                .frame(width: 40, height: 40)
                .background(Color.nomiPurple.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.headline.weight(.black))
                        .foregroundStyle(Color.nomiInk)
                    if let badge {
                        Text(badge)
                            .font(.caption2.weight(.black))
                            .foregroundStyle(Color.nomiOrange)
                            .padding(.vertical, 3)
                            .padding(.horizontal, 7)
                            .background(Color.nomiOrange.opacity(0.14), in: Capsule())
                    }
                }
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(Color.nomiMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.nomiCardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.nomiStroke, lineWidth: 1))
    }
}
