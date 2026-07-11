const crypto = require('crypto');

// Friend Circle Phase 1 — route handlers/helpers.
//
// SECURITY: every function here runs server-side under the `auth` middleware and
// is the ONLY place cross-user circle state is read or written. No function ever
// returns another user's private data — only (a) minimal profiles and (b) memory
// snapshots explicitly shared to the caller. Blocking is enforced on every
// mutating route (requests + share).
//
// `deps` is injected by server.js so this module stays independent of Firebase
// initialization details (mirrors how ./store abstracts persistence):
//   { store, admin, newSource, cleanObject, normalizeUsername,
//     firebaseProfileForUser, writeNativeMemoryDocumentFromSource }

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(stripUndefined).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value;
}

// Minimal, privacy-safe profile. NEVER includes email or any other private field.
function toCircleProfile(user) {
  if (!user) return null;
  const id = user.id || user.uid || user.firebaseUid;
  if (!id) return null;
  return stripUndefined({
    id: String(id),
    username: user.username || null,
    displayName: user.displayName || user.username || null,
    photoURL: user.photoURL || user.profileImageUrl || user.avatarUrl || null,
    bio: user.bio || undefined,
  });
}

async function loadUser(deps, userId) {
  const user = await deps.store.getUserById?.(userId);
  if (user) return user;
  if (deps.admin?.apps?.length) {
    const fb = await deps.firebaseProfileForUser({ uid: userId }).catch(() => null);
    if (fb) return { id: userId, ...fb };
  }
  return null;
}

async function getCircleProfile(deps, userId) {
  return toCircleProfile(await loadUser(deps, userId));
}

async function isBlockedEitherWay(deps, a, b) {
  const [aBlocksB, bBlocksA] = await Promise.all([
    deps.store.getCircleDoc(a, 'blocked', b),
    deps.store.getCircleDoc(b, 'blocked', a),
  ]);
  return Boolean(aBlocksB || bBlocksA);
}

async function areFriends(deps, a, b) {
  return Boolean(await deps.store.getCircleDoc(a, 'friends', b));
}

// Make two users mutual friends and clear any pending requests either direction.
async function establishFriendship(deps, aId, aProfile, bId, bProfile) {
  const friendedAt = new Date().toISOString();
  await Promise.all([
    deps.store.setCircleDoc(aId, 'friends', bId, { profile: bProfile, pinned: false, friendedAt }),
    deps.store.setCircleDoc(bId, 'friends', aId, { profile: aProfile, pinned: false, friendedAt }),
  ]);
  await Promise.all([
    deps.store.deleteCircleDoc(aId, 'requestsOut', bId),
    deps.store.deleteCircleDoc(aId, 'requestsIn', bId),
    deps.store.deleteCircleDoc(bId, 'requestsOut', aId),
    deps.store.deleteCircleDoc(bId, 'requestsIn', aId),
  ]);
}

function sharedAtMs(item) {
  const value = item?.attribution?.sharedAt;
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

// GET /api/circle/search?q= — exact match on username (case-insensitive) or email
// (lowercased). Returns { user: minimalProfile } or { user: null }. Never a list.
async function search(deps, callerId, rawQuery) {
  const raw = String(rawQuery || '').trim();
  if (!raw) return { user: null };
  const lowered = raw.toLowerCase();

  let target = null;
  const usernameKey = deps.normalizeUsername(raw);
  if (usernameKey) {
    target = await deps.store.getUserByUsername?.(usernameKey);
  }
  if (!target && raw.includes('@')) {
    target = await deps.store.getUserByEmail(lowered);
    if (!target && deps.admin?.apps?.length) {
      const fb = await deps.firebaseProfileForUser({ email: lowered }).catch(() => null);
      if (fb) target = fb;
    }
  }
  if (!target) return { user: null };

  const targetId = target.id || target.uid || target.firebaseUid;
  // Exclude the caller from their own search results.
  if (!targetId || targetId === callerId) return { user: null };
  // If the target has blocked the caller, they are invisible to the caller.
  if (await deps.store.getCircleDoc(targetId, 'blocked', callerId)) return { user: null };

  return { user: toCircleProfile(target) };
}

// POST /api/circle/requests { toUserId }
async function sendRequest(deps, callerId, toUserId) {
  if (!toUserId || toUserId === callerId) {
    return { status: 400, body: { error: 'You cannot send a friend request to yourself.' } };
  }
  const target = await loadUser(deps, toUserId);
  if (!target) return { status: 404, body: { error: 'User not found' } };
  const targetId = target.id || toUserId;

  if (await isBlockedEitherWay(deps, callerId, targetId)) {
    return { status: 403, body: { error: 'This action is not allowed.' } };
  }
  if (await areFriends(deps, callerId, targetId)) {
    return { status: 200, body: { ok: true, friends: true } };
  }

  // If the target already requested the caller, auto-accept into a mutual friendship.
  const reverse = await deps.store.getCircleDoc(callerId, 'requestsIn', targetId);
  if (reverse) {
    const [callerProfile, targetProfile] = await Promise.all([
      getCircleProfile(deps, callerId),
      Promise.resolve(toCircleProfile(target)),
    ]);
    await establishFriendship(deps, callerId, callerProfile, targetId, targetProfile);
    return { status: 200, body: { ok: true, friends: true } };
  }

  // Idempotent for a duplicate outgoing request.
  const existingOut = await deps.store.getCircleDoc(callerId, 'requestsOut', targetId);
  if (existingOut) return { status: 200, body: { ok: true, pending: true } };

  const callerProfile = await getCircleProfile(deps, callerId);
  const targetProfile = toCircleProfile(target);
  const requestedAt = new Date().toISOString();
  await Promise.all([
    deps.store.setCircleDoc(callerId, 'requestsOut', targetId, { profile: targetProfile, requestedAt }),
    deps.store.setCircleDoc(targetId, 'requestsIn', callerId, { profile: callerProfile, requestedAt }),
  ]);
  return { status: 200, body: { ok: true, pending: true } };
}

// GET /api/circle/requests
async function listRequests(deps, callerId) {
  const [incoming, outgoing] = await Promise.all([
    deps.store.listCircleDocs(callerId, 'requestsIn'),
    deps.store.listCircleDocs(callerId, 'requestsOut'),
  ]);
  return {
    incoming: incoming.map((doc) => doc.profile).filter(Boolean),
    outgoing: outgoing.map((doc) => doc.profile).filter(Boolean),
  };
}

// POST /api/circle/requests/:fromUserId/accept
async function acceptRequest(deps, callerId, fromUserId) {
  const incoming = await deps.store.getCircleDoc(callerId, 'requestsIn', fromUserId);
  if (!incoming) return { status: 404, body: { error: 'No pending request from this user.' } };
  const [callerProfile, fromProfile] = await Promise.all([
    getCircleProfile(deps, callerId),
    incoming.profile ? Promise.resolve(incoming.profile) : getCircleProfile(deps, fromUserId),
  ]);
  await establishFriendship(deps, callerId, callerProfile, fromUserId, fromProfile);
  return { status: 200, body: { ok: true, friends: true } };
}

// POST /api/circle/requests/:fromUserId/decline
async function declineRequest(deps, callerId, fromUserId) {
  await Promise.all([
    deps.store.deleteCircleDoc(callerId, 'requestsIn', fromUserId),
    deps.store.deleteCircleDoc(fromUserId, 'requestsOut', callerId),
  ]);
  return { status: 200, body: { ok: true } };
}

// GET /api/circle/friends — pinned-first, then displayName.
async function listFriends(deps, callerId) {
  const friends = await deps.store.listCircleDocs(callerId, 'friends');
  const mapped = friends
    .map((doc) => ({ profile: doc.profile, pinned: Boolean(doc.pinned) }))
    .filter((entry) => entry.profile);
  mapped.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(a.profile.displayName || '').localeCompare(String(b.profile.displayName || ''));
  });
  return { friends: mapped };
}

// PATCH /api/circle/friends/:friendId { pinned }
async function setPinned(deps, callerId, friendId, pinned) {
  const friend = await deps.store.getCircleDoc(callerId, 'friends', friendId);
  if (!friend) return { status: 404, body: { error: 'Friend not found' } };
  await deps.store.setCircleDoc(callerId, 'friends', friendId, { pinned: Boolean(pinned) });
  return { status: 200, body: { ok: true, pinned: Boolean(pinned) } };
}

// DELETE /api/circle/friends/:friendId — remove BOTH sides.
async function removeFriend(deps, callerId, friendId) {
  await Promise.all([
    deps.store.deleteCircleDoc(callerId, 'friends', friendId),
    deps.store.deleteCircleDoc(friendId, 'friends', callerId),
  ]);
  return { status: 200, body: { ok: true } };
}

// POST /api/circle/block { userId }
async function block(deps, callerId, userId) {
  if (!userId || userId === callerId) {
    return { status: 400, body: { error: 'You cannot block yourself.' } };
  }
  const profile = await getCircleProfile(deps, userId);
  await Promise.all([
    deps.store.deleteCircleDoc(callerId, 'friends', userId),
    deps.store.deleteCircleDoc(userId, 'friends', callerId),
    deps.store.deleteCircleDoc(callerId, 'requestsOut', userId),
    deps.store.deleteCircleDoc(callerId, 'requestsIn', userId),
    deps.store.deleteCircleDoc(userId, 'requestsOut', callerId),
    deps.store.deleteCircleDoc(userId, 'requestsIn', callerId),
  ]);
  await deps.store.setCircleDoc(callerId, 'blocked', userId, {
    profile: profile || null,
    blockedAt: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true, blocked: true } };
}

// DELETE /api/circle/block/:userId
async function unblock(deps, callerId, userId) {
  await deps.store.deleteCircleDoc(callerId, 'blocked', userId);
  return { status: 200, body: { ok: true } };
}

// POST /api/circle/share { toUserId, memoryId }
async function shareMemory(deps, callerId, toUserId, memoryId) {
  if (!toUserId || toUserId === callerId) {
    return { status: 400, body: { error: 'Invalid share target.' } };
  }
  if (await isBlockedEitherWay(deps, callerId, toUserId)) {
    return { status: 403, body: { error: 'This action is not allowed.' } };
  }
  if (!(await areFriends(deps, callerId, toUserId))) {
    return { status: 403, body: { error: 'You can only share memories with friends.' } };
  }

  // Load the CALLER's memory via the same store path GET /api/memories/:id uses.
  const memory = await deps.store.getSourceById(callerId, memoryId);
  if (!memory) return { status: 404, body: { error: 'Memory not found' } };

  const caller = await loadUser(deps, callerId);
  const shareId = crypto.randomUUID();
  const snapshot = stripUndefined({
    title: String(memory.title || 'Shared memory'),
    body: String(memory.body || ''),
    category: memory.category || 'General',
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    sourceUrl: memory.source_url || undefined,
  });
  const attribution = stripUndefined({
    fromUserId: callerId,
    fromUsername: caller?.username || undefined,
    fromDisplayName: caller?.displayName || undefined,
    originalMemoryId: String(memory.id),
    sharedAt: new Date().toISOString(),
  });
  await deps.store.setCircleDoc(toUserId, 'inbox', shareId, {
    id: shareId,
    kind: 'memory',
    snapshot,
    attribution,
    status: 'new',
  });
  return { status: 200, body: { ok: true, shareId } };
}

// GET /api/circle/inbox — newest first.
async function listInbox(deps, callerId) {
  const items = await deps.store.listCircleDocs(callerId, 'inbox');
  const mapped = items.map((item) => ({
    id: item.id,
    kind: item.kind || 'memory',
    snapshot: item.snapshot,
    attribution: item.attribution,
    status: item.status,
  }));
  mapped.sort((a, b) => sharedAtMs(b) - sharedAtMs(a));
  return { items: mapped };
}

// POST /api/circle/inbox/:shareId/save — materialize a real memory for the caller.
async function saveInboxItem(deps, callerId, shareId) {
  const item = await deps.store.getCircleDoc(callerId, 'inbox', shareId);
  if (!item) return { status: 404, body: { error: 'Shared item not found' } };
  const snap = item.snapshot || {};
  const attr = item.attribution || {};

  const source = {
    ...deps.newSource(String(snap.title || 'Shared memory'), 'note'),
    body: String(snap.body || ''),
    source_url: snap.sourceUrl || undefined,
    category: snap.category || 'General',
    tags: Array.from(new Set([...(Array.isArray(snap.tags) ? snap.tags : []), 'shared'])).slice(0, 12),
    sharedBy: deps.cleanObject({
      userId: attr.fromUserId,
      username: attr.fromUsername,
      displayName: attr.fromDisplayName,
      originalMemoryId: attr.originalMemoryId,
      sharedAt: attr.sharedAt,
    }),
  };
  await deps.store.addSource(callerId, source);
  await deps.writeNativeMemoryDocumentFromSource(callerId, source);
  await deps.store.setCircleDoc(callerId, 'inbox', shareId, { status: 'saved', savedMemoryId: source.id });
  return { status: 200, body: { ok: true, memoryId: source.id } };
}

// POST /api/circle/inbox/:shareId/ignore
async function ignoreInboxItem(deps, callerId, shareId) {
  const item = await deps.store.getCircleDoc(callerId, 'inbox', shareId);
  if (!item) return { status: 404, body: { error: 'Shared item not found' } };
  await deps.store.setCircleDoc(callerId, 'inbox', shareId, { status: 'ignored' });
  return { status: 200, body: { ok: true } };
}

module.exports = {
  toCircleProfile,
  getCircleProfile,
  search,
  sendRequest,
  listRequests,
  acceptRequest,
  declineRequest,
  listFriends,
  setPinned,
  removeFriend,
  block,
  unblock,
  shareMemory,
  listInbox,
  saveInboxItem,
  ignoreInboxItem,
};
