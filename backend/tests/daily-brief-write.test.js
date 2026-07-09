const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
// Force the deterministic fallback path (no AI) — the bug reproduces there too.
delete process.env.OPENAI_API_KEY;
delete process.env.NOMI_OPENAI_API_KEY;

const admin = require('firebase-admin');

// --- In-memory Firestore fake whose set() rejects undefined like the real SDK.
// REGRESSION (2026-07-08 TestFlight bake): brief docs aggregated fields that can
// be undefined (project docs without `name`, usage metadata without counts),
// and the real admin SDK rejects the whole write with "Value for argument
// 'data' is not a valid Firestore document." The fake enforces the same rule so
// this suite fails if any undefined ever reaches a brief write again.

function assertNoUndefined(value, path = 'data') {
  if (value === undefined) {
    throw new Error(`Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field ${path}).`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, entry] of Object.entries(value)) {
      assertNoUndefined(entry, `${path}.${key}`);
    }
  }
}

function createFakeFirestore() {
  const docs = new Map(); // full path -> data

  function docRef(path) {
    return {
      id: path.split('/').pop(),
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, id: path.split('/').pop(), data: () => (data ? { ...data } : undefined) };
      },
      async set(data, options = {}) {
        assertNoUndefined(data); // <- the real SDK's behavior under test
        const existing = docs.get(path);
        docs.set(path, options.merge && existing ? { ...existing, ...data } : data);
      },
      collection(name) {
        return collectionRef(`${path}/${name}`);
      },
    };
  }

  function collectionRef(path) {
    const listDocs = () => [...docs.entries()]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([key, data]) => ({ id: key.split('/').pop(), data: () => ({ ...data }), exists: true }));
    return {
      doc(id) { return docRef(`${path}/${id}`); },
      orderBy() { return this; },
      limit() { return this; },
      where() { return this; },
      async get() { return { docs: listDocs() }; },
    };
  }

  return { collection: (name) => collectionRef(name), _docs: docs };
}

const fakeFirestore = createFakeFirestore();
function firestoreFactory() { return fakeFirestore; }
firestoreFactory.FieldValue = { serverTimestamp: () => new Date().toISOString() };

Object.defineProperty(admin, 'apps', { configurable: true, get: () => [{ name: '[TEST]' }] });
Object.defineProperty(admin, 'firestore', { configurable: true, value: firestoreFactory });

const { generateDailyBriefForUser, dateKeyFor } = require('../src/ai/dailyBriefs');

test('brief write survives a project doc without a name (undefined stripped, not rejected)', async () => {
  const userId = 'user-brief-1';
  const dateKey = dateKeyFor(new Date(), 'UTC');
  const nowIso = new Date().toISOString();

  // A memory captured today WITH an AI summary (produces `text: undefined` in
  // memorySummaryForAI) and a project MISSING `name` (produces
  // `projectName: undefined` in the fallback brief's suggestedProjectLinks).
  fakeFirestore._docs.set(`users/${userId}/memories/mem-1`, {
    title: 'Memory with summary',
    rawText: 'Original raw text for the memory.',
    capturedAt: nowIso,
    ai: { summary: 'Already summarized.', tags: ['launch'] },
  });
  fakeFirestore._docs.set(`users/${userId}/projects/proj-unnamed`, {
    status: 'active',
    // no `name` field — the exact shape that made the real SDK reject the write
  });

  const brief = await generateDailyBriefForUser(userId, dateKey, {});

  assert.ok(brief, 'brief should be generated and returned');
  assert.equal(brief.dateKey, dateKey);
  assert.equal(brief.savedCount, 1);

  const stored = fakeFirestore._docs.get(`users/${userId}/dailyBriefs/${dateKey}`);
  assert.ok(stored, 'brief document must be written');
  // The link row survives with its undefined projectName omitted, not the whole
  // write rejected.
  assert.equal(stored.suggestedProjectLinks.length, 1);
  assert.equal(stored.suggestedProjectLinks[0].projectId, 'proj-unnamed');
  assert.ok(!('projectName' in stored.suggestedProjectLinks[0]) || stored.suggestedProjectLinks[0].projectName !== undefined);
  assertNoUndefined(stored);
});

test('empty day still writes a valid "no saves" brief', async () => {
  const userId = 'user-brief-empty';
  const dateKey = dateKeyFor(new Date(), 'UTC');

  const brief = await generateDailyBriefForUser(userId, dateKey, {});

  assert.equal(brief.savedCount, 0);
  assert.equal(brief.title, 'No saves today');
  const stored = fakeFirestore._docs.get(`users/${userId}/dailyBriefs/${dateKey}`);
  assert.ok(stored);
  assertNoUndefined(stored);
});

// REGRESSION (TestFlight bake): opening the brief in the morning cached
// "No saves today" with status generated, freezing the brief for the whole
// day even after memories were captured/synced later.
test('a cached EMPTY brief is regenerated once saves arrive (no force needed)', async () => {
  const userId = 'user-brief-stale';
  const dateKey = dateKeyFor(new Date(), 'UTC');

  const first = await generateDailyBriefForUser(userId, dateKey, {});
  assert.equal(first.savedCount, 0, 'first open of an empty day: no saves');

  // A memory arrives later the same day (e.g. an X bookmark sync).
  fakeFirestore._docs.set(`users/${userId}/memories/mem-later`, {
    title: 'Bookmark synced later today',
    rawText: 'Synced after the empty brief was cached.',
    createdAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  });

  const second = await generateDailyBriefForUser(userId, dateKey, {});
  assert.equal(second.savedCount, 1, 'cached empty brief must be regenerated, not served');
  assert.notEqual(second.title, 'No saves today');
});

// REGRESSION (TestFlight bake): X bookmarks carry the TWEET's original post
// date as capturedAt, so bookmarking an old tweet today was excluded from
// today's brief. A memory counts for a day if its content date OR its save
// date lands on that day.
test('an old tweet bookmarked today counts toward today brief', async () => {
  const userId = 'user-brief-bookmark';
  const dateKey = dateKeyFor(new Date(), 'UTC');

  fakeFirestore._docs.set(`users/${userId}/memories/mem-old-tweet`, {
    title: 'Old tweet, bookmarked today',
    rawText: 'Tweet text from months ago.',
    capturedAt: '2026-03-01T12:00:00.000Z', // tweet's original post date
    createdAt: new Date().toISOString(),     // synced/saved today
  });

  const brief = await generateDailyBriefForUser(userId, dateKey, {});
  assert.equal(brief.savedCount, 1, 'bookmark synced today must count toward today');
  assert.deepEqual(brief.memoryIds, ['mem-old-tweet']);
});

test('a cached POPULATED brief is still served from cache (no regeneration cost)', async () => {
  const userId = 'user-brief-cached';
  const dateKey = dateKeyFor(new Date(), 'UTC');

  fakeFirestore._docs.set(`users/${userId}/memories/mem-first`, {
    title: 'First save',
    rawText: 'Captured before the first brief.',
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const first = await generateDailyBriefForUser(userId, dateKey, {});
  assert.equal(first.savedCount, 1);

  // Another memory arrives; without forceRegenerate the cached populated brief
  // is returned unchanged (cost control — this is the pre-existing contract).
  fakeFirestore._docs.set(`users/${userId}/memories/mem-second`, {
    title: 'Second save',
    rawText: 'Captured after the brief generated.',
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const second = await generateDailyBriefForUser(userId, dateKey, {});
  assert.equal(second.savedCount, 1, 'populated brief stays cached until forceRegenerate');
});
