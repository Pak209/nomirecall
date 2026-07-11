const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const { app } = require('../src/server');

let userSeq = 0;
async function createUser(usernameHint) {
  userSeq += 1;
  const email = `circle.${usernameHint || 'user'}.${Date.now()}.${userSeq}@example.com`;
  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password: 'password123' });
  assert.equal(signup.status, 201, `signup for ${email} failed`);
  const auth = { Authorization: `Bearer ${signup.body.token}` };
  const user = { id: signup.body.user.id, email, auth, token: signup.body.token };
  if (usernameHint) {
    const patch = await request(app)
      .patch('/api/auth/profile')
      .set(auth)
      .send({ username: usernameHint, displayName: usernameHint });
    assert.equal(patch.status, 200, `profile patch for ${usernameHint} failed`);
    user.username = patch.body.user.username;
    user.displayName = patch.body.user.displayName;
  }
  return user;
}

async function ingestMemory(user, overrides = {}) {
  const res = await request(app)
    .post('/api/ingest')
    .set(user.auth)
    .send({
      raw_text: overrides.raw_text || 'A memory worth sharing with a friend.',
      title: overrides.title || 'Shared thoughts',
      type: 'note',
      category: overrides.category || 'Ideas',
      tags: overrides.tags || ['insight'],
    });
  assert.equal(res.status, 200);
  return res.body.source_id;
}

test('circle search: exact email hit, partial miss, self miss, and username hit', async () => {
  const alice = await createUser('alicesearch');
  const bob = await createUser('bobsearch');

  // Exact email hit — returns a minimal profile, never the email.
  const byEmail = await request(app)
    .get(`/api/circle/search?q=${encodeURIComponent(bob.email)}`)
    .set(alice.auth);
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.body.user.id, bob.id);
  assert.equal(byEmail.body.user.username, bob.username);
  assert.equal(byEmail.body.user.email, undefined, 'profile must never leak email');

  // Exact username hit (case-insensitive).
  const byUsername = await request(app)
    .get('/api/circle/search?q=BOBSEARCH')
    .set(alice.auth);
  assert.equal(byUsername.status, 200);
  assert.equal(byUsername.body.user.id, bob.id);

  // Partial miss — no fuzzy/list results (anti-enumeration).
  const partial = await request(app)
    .get('/api/circle/search?q=bobsear')
    .set(alice.auth);
  assert.equal(partial.status, 200);
  assert.equal(partial.body.user, null);

  // Self miss — searching for yourself returns nothing.
  const selfEmail = await request(app)
    .get(`/api/circle/search?q=${encodeURIComponent(alice.email)}`)
    .set(alice.auth);
  assert.equal(selfEmail.status, 200);
  assert.equal(selfEmail.body.user, null);
});

test('friend request -> accept produces a mutual friendship', async () => {
  const alice = await createUser('alicereq');
  const bob = await createUser('bobreq');

  const requested = await request(app)
    .post('/api/circle/requests')
    .set(alice.auth)
    .send({ toUserId: bob.id });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.pending, true);

  // Alice sees an outgoing request, Bob sees an incoming one.
  const aliceReqs = await request(app).get('/api/circle/requests').set(alice.auth);
  assert.equal(aliceReqs.body.outgoing.length, 1);
  assert.equal(aliceReqs.body.outgoing[0].id, bob.id);
  const bobReqs = await request(app).get('/api/circle/requests').set(bob.auth);
  assert.equal(bobReqs.body.incoming.length, 1);
  assert.equal(bobReqs.body.incoming[0].id, alice.id);

  const accepted = await request(app)
    .post(`/api/circle/requests/${alice.id}/accept`)
    .set(bob.auth);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.friends, true);

  const aliceFriends = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.equal(aliceFriends.body.friends.length, 1);
  assert.equal(aliceFriends.body.friends[0].profile.id, bob.id);
  const bobFriends = await request(app).get('/api/circle/friends').set(bob.auth);
  assert.equal(bobFriends.body.friends.length, 1);
  assert.equal(bobFriends.body.friends[0].profile.id, alice.id);

  // Requests are cleared once accepted.
  const aliceReqsAfter = await request(app).get('/api/circle/requests').set(alice.auth);
  assert.equal(aliceReqsAfter.body.outgoing.length, 0);
});

test('reverse request auto-accepts into a mutual friendship', async () => {
  const alice = await createUser('aliceauto');
  const bob = await createUser('bobauto');

  const first = await request(app)
    .post('/api/circle/requests')
    .set(alice.auth)
    .send({ toUserId: bob.id });
  assert.equal(first.body.pending, true);

  // Bob requests Alice back -> should auto-accept, not create a second request.
  const reverse = await request(app)
    .post('/api/circle/requests')
    .set(bob.auth)
    .send({ toUserId: alice.id });
  assert.equal(reverse.status, 200);
  assert.equal(reverse.body.friends, true);

  const aliceFriends = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.equal(aliceFriends.body.friends.length, 1);
  const bobPending = await request(app).get('/api/circle/requests').set(bob.auth);
  assert.equal(bobPending.body.incoming.length, 0);
  assert.equal(bobPending.body.outgoing.length, 0);
});

test('duplicate outgoing request is idempotent', async () => {
  const alice = await createUser('aliceidem');
  const bob = await createUser('bobidem');

  const first = await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  assert.equal(first.body.pending, true);
  const second = await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  assert.equal(second.status, 200);
  assert.equal(second.body.pending, true);

  const bobReqs = await request(app).get('/api/circle/requests').set(bob.auth);
  assert.equal(bobReqs.body.incoming.length, 1);
});

test('self request is rejected', async () => {
  const alice = await createUser('aliceself');
  const res = await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: alice.id });
  assert.equal(res.status, 400);
});

test('declining a request clears it from both sides', async () => {
  const alice = await createUser('alicedecline');
  const bob = await createUser('bobdecline');

  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  const declined = await request(app).post(`/api/circle/requests/${alice.id}/decline`).set(bob.auth);
  assert.equal(declined.status, 200);

  const aliceReqs = await request(app).get('/api/circle/requests').set(alice.auth);
  assert.equal(aliceReqs.body.outgoing.length, 0);
  const bobReqs = await request(app).get('/api/circle/requests').set(bob.auth);
  assert.equal(bobReqs.body.incoming.length, 0);

  // No friendship was formed.
  const aliceFriends = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.equal(aliceFriends.body.friends.length, 0);
});

test('accepting with no pending request returns 404', async () => {
  const alice = await createUser('alice404');
  const bob = await createUser('bob404');
  const res = await request(app).post(`/api/circle/requests/${bob.id}/accept`).set(alice.auth);
  assert.equal(res.status, 404);
});

test('sharing to a non-friend is rejected with 403', async () => {
  const alice = await createUser('aliceshareno');
  const bob = await createUser('bobshareno');
  const memoryId = await ingestMemory(alice);

  const res = await request(app)
    .post('/api/circle/share')
    .set(alice.auth)
    .send({ toUserId: bob.id, memoryId });
  assert.equal(res.status, 403);
});

test('friend share lands in inbox with attribution and can be saved as a real memory', async () => {
  const alice = await createUser('alicesharer');
  const bob = await createUser('bobsharer');

  // Become friends.
  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(bob.auth);

  const memoryId = await ingestMemory(alice, {
    title: 'Great article on focus',
    raw_text: 'Deep work compounds over time.',
    category: 'Productivity',
    tags: ['focus', 'work'],
  });

  const shared = await request(app)
    .post('/api/circle/share')
    .set(alice.auth)
    .send({ toUserId: bob.id, memoryId });
  assert.equal(shared.status, 200);
  assert.equal(shared.body.ok, true);
  assert.ok(shared.body.shareId);

  // Inbox item matches the response contract exactly.
  const inbox = await request(app).get('/api/circle/inbox').set(bob.auth);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.items.length, 1);
  const item = inbox.body.items[0];
  assert.equal(item.id, shared.body.shareId);
  assert.equal(item.kind, 'memory');
  assert.equal(item.status, 'new');
  assert.equal(item.snapshot.title, 'Great article on focus');
  assert.equal(item.snapshot.body, 'Deep work compounds over time.');
  assert.equal(item.snapshot.category, 'Productivity');
  assert.deepEqual(item.snapshot.tags, ['focus', 'work']);
  assert.equal(item.attribution.fromUserId, alice.id);
  assert.equal(item.attribution.fromUsername, alice.username);
  assert.equal(item.attribution.fromDisplayName, alice.displayName);
  assert.equal(item.attribution.originalMemoryId, memoryId);
  assert.ok(item.attribution.sharedAt);

  // The sharer's own inbox stays empty (no leakage back to the sender).
  const aliceInbox = await request(app).get('/api/circle/inbox').set(alice.auth);
  assert.equal(aliceInbox.body.items.length, 0);

  // Saving creates a real memory for Bob with attribution + a 'shared' tag.
  const saved = await request(app)
    .post(`/api/circle/inbox/${shared.body.shareId}/save`)
    .set(bob.auth);
  assert.equal(saved.status, 200);
  assert.ok(saved.body.memoryId);

  const memories = await request(app).get('/api/memories').set(bob.auth);
  assert.equal(memories.status, 200);
  const savedMemory = memories.body.memories.find((m) => m.id === saved.body.memoryId);
  assert.ok(savedMemory, 'saved memory should appear in Bob\'s memories');
  assert.ok(savedMemory.tags.includes('shared'));
  assert.equal(savedMemory.sharedBy.userId, alice.id);
  assert.equal(savedMemory.sharedBy.username, alice.username);
  assert.equal(savedMemory.sharedBy.originalMemoryId, memoryId);

  // The inbox item is now marked saved.
  const inboxAfter = await request(app).get('/api/circle/inbox').set(bob.auth);
  assert.equal(inboxAfter.body.items[0].status, 'saved');

  // Saving again is idempotent: same memoryId, no duplicate memory.
  const savedAgain = await request(app)
    .post(`/api/circle/inbox/${shared.body.shareId}/save`)
    .set(bob.auth);
  assert.equal(savedAgain.status, 200);
  assert.equal(savedAgain.body.memoryId, saved.body.memoryId);
  const memoriesAfter = await request(app).get('/api/memories').set(bob.auth);
  const copies = memoriesAfter.body.memories.filter((m) => m.tags.includes('shared'));
  assert.equal(copies.length, 1, 'double-save must not duplicate the memory');
});

test('ignoring an inbox item marks it ignored', async () => {
  const alice = await createUser('aliceignore');
  const bob = await createUser('bobignore');
  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(bob.auth);
  const memoryId = await ingestMemory(alice);
  const shared = await request(app).post('/api/circle/share').set(alice.auth).send({ toUserId: bob.id, memoryId });

  const ignored = await request(app).post(`/api/circle/inbox/${shared.body.shareId}/ignore`).set(bob.auth);
  assert.equal(ignored.status, 200);
  const inbox = await request(app).get('/api/circle/inbox').set(bob.auth);
  assert.equal(inbox.body.items[0].status, 'ignored');
});

test('blocking rejects requests + shares and hides from search; unblock restores', async () => {
  const alice = await createUser('aliceblock');
  const carol = await createUser('carolblock');

  // Alice blocks Carol.
  const blocked = await request(app).post('/api/circle/block').set(alice.auth).send({ userId: carol.id });
  assert.equal(blocked.status, 200);

  // Carol can no longer find Alice in search (target blocked the caller).
  const search = await request(app)
    .get(`/api/circle/search?q=${encodeURIComponent(alice.email)}`)
    .set(carol.auth);
  assert.equal(search.body.user, null);

  // Carol cannot send Alice a request.
  const req = await request(app).post('/api/circle/requests').set(carol.auth).send({ toUserId: alice.id });
  assert.equal(req.status, 403);

  // Even if they were somehow friends, a share is blocked (not friends here -> 403 anyway).
  const memoryId = await ingestMemory(carol);
  const share = await request(app).post('/api/circle/share').set(carol.auth).send({ toUserId: alice.id, memoryId });
  assert.equal(share.status, 403);

  // Unblocking restores discoverability.
  const unblocked = await request(app).delete(`/api/circle/block/${carol.id}`).set(alice.auth);
  assert.equal(unblocked.status, 200);
  const searchAfter = await request(app)
    .get(`/api/circle/search?q=${encodeURIComponent(alice.email)}`)
    .set(carol.auth);
  assert.equal(searchAfter.body.user.id, alice.id);

  // ...and the ability to send a friend request again.
  const rerequest = await request(app).post('/api/circle/requests').set(carol.auth).send({ toUserId: alice.id });
  assert.equal(rerequest.status, 200);
  assert.equal(rerequest.body.pending, true);
  const aliceReqs = await request(app).get('/api/circle/requests').set(alice.auth);
  assert.equal(aliceReqs.body.incoming.length, 1);
  assert.equal(aliceReqs.body.incoming[0].id, carol.id);
});

test('blocking a friend removes the friendship on both sides', async () => {
  const alice = await createUser('aliceblockfriend');
  const bob = await createUser('bobblockfriend');
  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(bob.auth);

  await request(app).post('/api/circle/block').set(alice.auth).send({ userId: bob.id });

  const aliceFriends = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.equal(aliceFriends.body.friends.length, 0);
  const bobFriends = await request(app).get('/api/circle/friends').set(bob.auth);
  assert.equal(bobFriends.body.friends.length, 0);
});

test('removing a friend then sharing is rejected with 403', async () => {
  const alice = await createUser('aliceremove');
  const bob = await createUser('bobremove');
  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(bob.auth);

  const removed = await request(app).delete(`/api/circle/friends/${bob.id}`).set(alice.auth);
  assert.equal(removed.status, 200);

  // Removed on both sides.
  const bobFriends = await request(app).get('/api/circle/friends').set(bob.auth);
  assert.equal(bobFriends.body.friends.length, 0);

  const memoryId = await ingestMemory(alice);
  const share = await request(app).post('/api/circle/share').set(alice.auth).send({ toUserId: bob.id, memoryId });
  assert.equal(share.status, 403);
});

test('pinned friends sort before unpinned, then by displayName', async () => {
  const alice = await createUser('alicepin');
  const zoe = await createUser('zoepin');
  const bill = await createUser('billpin');

  for (const friend of [zoe, bill]) {
    await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: friend.id });
    await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(friend.auth);
  }

  // Without pinning: alphabetical by displayName (billpin before zoepin).
  const unpinned = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.deepEqual(unpinned.body.friends.map((f) => f.profile.id), [bill.id, zoe.id]);

  // Pin zoe -> she jumps to the front despite the later displayName.
  const pinned = await request(app)
    .patch(`/api/circle/friends/${zoe.id}`)
    .set(alice.auth)
    .send({ pinned: true });
  assert.equal(pinned.status, 200);

  const ordered = await request(app).get('/api/circle/friends').set(alice.auth);
  assert.deepEqual(ordered.body.friends.map((f) => f.profile.id), [zoe.id, bill.id]);
  assert.equal(ordered.body.friends[0].pinned, true);
});

test('a fresh user sees empty circle lists (no leakage across users)', async () => {
  // Create activity between two other users first.
  const alice = await createUser('alicenoise');
  const bob = await createUser('bobnoise');
  await request(app).post('/api/circle/requests').set(alice.auth).send({ toUserId: bob.id });
  await request(app).post(`/api/circle/requests/${alice.id}/accept`).set(bob.auth);
  const memoryId = await ingestMemory(alice);
  await request(app).post('/api/circle/share').set(alice.auth).send({ toUserId: bob.id, memoryId });

  const stranger = await createUser('strangernoise');
  const friends = await request(app).get('/api/circle/friends').set(stranger.auth);
  assert.deepEqual(friends.body.friends, []);
  const requests = await request(app).get('/api/circle/requests').set(stranger.auth);
  assert.deepEqual(requests.body.incoming, []);
  assert.deepEqual(requests.body.outgoing, []);
  const inbox = await request(app).get('/api/circle/inbox').set(stranger.auth);
  assert.deepEqual(inbox.body.items, []);
});
