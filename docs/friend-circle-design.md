# Friend Circle — Design & Phasing

**Philosophy:** "My brain stays private. My Circle helps it grow."
Not a social network: no likes, follower counts, trending, public discovery, or infinite feeds. A trusted collaboration layer around ideas and projects, with each person's knowledge base fully private by default.

## Architecture principle (security-first)

Every cross-user operation flows through **backend REST routes enforced in code with the admin SDK**. Client-direct Firestore access remains owner-only, and **`firestore.rules` is never modified** — the per-user isolation model the launch audit approved stays exactly as-is. A recipient never reads a sharer's live documents; they receive **snapshots** (copies with attribution) or access **server-mediated views** with per-request permission checks.

Consequences:
- Revoking access = server stops serving; nothing lingers client-side except copies the recipient explicitly saved to their own Nomi (which are theirs, with attribution — like a forwarded email).
- Blocking is enforced server-side on every circle route.
- No enumeration: user search is **exact username or exact email only**, returning a minimal profile (name, username, avatar, bio) — no fuzzy listing of the user base.

## Data model (all backend-managed)

```
users/{uid}/circle/friends/{friendUid}      { username, displayName, photoURL, pinned, createdAt }
users/{uid}/circle/requestsIn/{fromUid}     { fromProfile, message?, createdAt }
users/{uid}/circle/requestsOut/{toUid}      { toProfile, createdAt }
users/{uid}/circle/blocked/{blockedUid}     { createdAt }
users/{uid}/circle/inbox/{shareId}          { kind: "memory", snapshot {...}, attribution
                                              { fromUserId, fromUsername, fromDisplayName,
                                                originalMemoryId, sharedAt }, status: new|saved|ignored }
```
Friendship is mutual: accept writes `friends` docs on **both** sides atomically (batch). Phase 2 adds `projects/{id}/members/{uid} { role }` and `projects/{id}/activity/{eventId}`.

## Permission levels (target matrix, Phase 2+)

| Level | See content | Comment | Suggest (owner approves) | Add/edit objects | Manage members |
|---|---|---|---|---|---|
| View Only | ✓ | – | – | – | – |
| Comment | ✓ | ✓ | – | – | – |
| Suggest | ✓ | ✓ | ✓ | – | – |
| Contribute | ✓ | ✓ | ✓ | ✓ (attributed) | – |
| Co-Owner | ✓ | ✓ | ✓ | ✓ | ✓ (except remove owner) |

Owner can change/revoke any member's level at any time. Every mutation records `{ authorUid, at, action }` in the project activity log (nothing anonymous; AI-created objects attributed to "Nomi via <requesting user>").

## Phases

**Phase 1 — Friends + Shared Memories (this build):** friend requests/accept/decline/remove/block/pin; exact-match search; share a memory to a friend (snapshot + attribution); recipient inbox with Save to my Nomi / Ignore (Reply and Connect-to-project arrive with later phases); Circle home showing requests, inbox, and friends. iOS UI replaces the placeholder.

**Phase 2 — Shared Projects:** members with permission levels on the existing project model; server-mediated project reads for members (only the project — linked memories are served as project-scoped snapshots, never the owner's collection); contribution attribution + activity timeline; workspace save-as flow for friends' additions.

**Phase 3 — Ask Circle:** owner picks friends → Nomi packages minimal context (summary, current goal, open questions, selected memories, recent decisions) → responses arrive in-project → Nomi summarizes and offers convert-to-object (reuses the workspace save-as mechanic).

**Phase 4 — Collections + AI collaboration:** shared collections (folder semantics over the same permission matrix); proactive signals ("this memory may answer Sarah's open question", conflict detection between decisions) — server-side jobs over *shared* content only.

## Product sign-off needed before Phase 2+
- Version history granularity (per-edit vs per-session) and storage cost.
- Whether "Suggest" requires owner approval UI in v1 of Phase 2 or collapses into Comment.
- Ask Circle cost model (packaging + summarization are AI spend on the owner's quota?).

## Explicitly rejected
Public profiles/discovery, follower graphs, engagement metrics, unread-badge pressure loops, generic chat (conversation is always convertible into structured knowledge, per the workspace mechanic).
