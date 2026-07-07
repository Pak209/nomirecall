const assert = require('node:assert/strict');
const test = require('node:test');

const { createStore } = require('../src/store');
const {
  indexMemoryForRetrieval,
  buildMemoryChunks,
} = require('../src/ai/memoryChunks');

// These tests exercise the injected-store (non-Firestore) re-index path that
// the PATCH /api/memories/:id handler now uses after an edit:
//   indexMemoryForRetrieval(userId, id, { store, memory: updated })
//     -> writeChunks -> store.upsertChunks (replace semantics)
// No Firestore emulator is required: with no Firebase env configured and
// NODE_ENV !== 'production', createStore() returns the in-memory MemoryStore,
// and admin.apps.length is 0 so indexMemoryForRetrieval takes the store path.

const USER_ID = 'user-reindex';

// Deterministic mock embedding provider so we never need real OpenAI creds and
// re-embedding on edit is observable. The vector encodes the text length so a
// changed chunk yields a changed embedding.
function mockEmbeddingProvider() {
  let calls = 0;
  return {
    get callCount() {
      return calls;
    },
    async embedText(text) {
      calls += 1;
      return [text.length, calls, 0.5];
    },
  };
}

function longText(marker, count) {
  // Produce text large enough to split into multiple chunks (chunk size 1400).
  return Array.from({ length: count }, (_, i) => `${marker} sentence ${i}.`).join(' ');
}

test('editing a memory re-indexes chunks to reflect the NEW content', async () => {
  const store = createStore();
  const embeddingProvider = mockEmbeddingProvider();

  const original = {
    id: 'mem-edit-1',
    title: 'Original title',
    rawText: 'The original body mentions apples and oranges.',
    tags: ['fruit'],
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  await indexMemoryForRetrieval(USER_ID, original.id, {
    store,
    memory: original,
    embeddingProvider,
  });

  const before = await store.listChunks(USER_ID, { memoryId: 'mem-edit-1' });
  assert.ok(before.length > 0, 'original indexing should produce chunks');
  assert.ok(
    before.some((chunk) => /apples and oranges/.test(chunk.chunkText)),
    'chunks should contain original content',
  );

  // Simulate an edit: the body text changes entirely.
  const edited = {
    ...original,
    rawText: 'The edited body talks about spaceships and rockets.',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };

  await indexMemoryForRetrieval(USER_ID, edited.id, {
    store,
    memory: edited,
    embeddingProvider,
  });

  const after = await store.listChunks(USER_ID, { memoryId: 'mem-edit-1' });
  assert.ok(
    after.some((chunk) => /spaceships and rockets/.test(chunk.chunkText)),
    're-index should reflect the NEW content',
  );
  assert.ok(
    !after.some((chunk) => /apples and oranges/.test(chunk.chunkText)),
    'stale original content must not remain after re-index',
  );
  // The changed text must have been re-embedded (contentHash no longer matches).
  const editedChunk = after.find((chunk) => /spaceships and rockets/.test(chunk.chunkText));
  assert.equal(editedChunk.embeddingStatus, 'complete');
  assert.ok(Array.isArray(editedChunk.embedding), 'edited chunk should carry a fresh embedding');
});

test('re-index leaves NO orphaned chunks when the edited memory shrinks', async () => {
  const store = createStore();
  const embeddingProvider = mockEmbeddingProvider();

  // A large memory that splits into multiple chunks.
  const large = {
    id: 'mem-edit-2',
    title: 'Large note',
    rawText: longText('bananas', 400),
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  await indexMemoryForRetrieval(USER_ID, large.id, {
    store,
    memory: large,
    embeddingProvider,
  });

  const before = await store.listChunks(USER_ID, { memoryId: 'mem-edit-2' });
  const expectedBefore = buildMemoryChunks({ id: 'mem-edit-2', ...large });
  assert.ok(before.length > 1, 'large memory should produce multiple chunks');
  assert.equal(before.length, expectedBefore.length);

  // Edit shrinks the memory to a single short chunk.
  const small = {
    ...large,
    rawText: 'Now just a tiny note.',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };

  await indexMemoryForRetrieval(USER_ID, small.id, {
    store,
    memory: small,
    embeddingProvider,
  });

  const after = await store.listChunks(USER_ID, { memoryId: 'mem-edit-2' });
  const expectedAfter = buildMemoryChunks({ id: 'mem-edit-2', ...small });

  // Chunk count matches the new (smaller) content exactly — no orphans left over.
  assert.equal(after.length, expectedAfter.length, 'chunk count must match new content');
  assert.ok(after.length < before.length, 'shrinking edit should reduce chunk count');

  // Chunk ids match the new content set exactly (no stale ids from the old set).
  const afterIds = new Set(after.map((chunk) => chunk.chunkId));
  const expectedIds = new Set(expectedAfter.map((chunk) => chunk.chunkId));
  assert.deepEqual([...afterIds].sort(), [...expectedIds].sort());
  const beforeIds = new Set(before.map((chunk) => chunk.chunkId));
  for (const staleId of beforeIds) {
    if (!expectedIds.has(staleId)) {
      assert.ok(!afterIds.has(staleId), `orphaned chunk ${staleId} must be removed`);
    }
  }

  // Sanity: no lingering 'bananas' content anywhere in the store for this memory.
  assert.ok(
    !after.some((chunk) => /bananas/.test(chunk.chunkText)),
    'no stale content should remain after shrinking re-index',
  );
});

test('listChunks scoped to the memory does not leak other memories', async () => {
  const store = createStore();
  const embeddingProvider = mockEmbeddingProvider();

  await indexMemoryForRetrieval(USER_ID, 'mem-a', {
    store,
    memory: { id: 'mem-a', title: 'A', rawText: 'alpha content', createdAt: '2026-06-01T00:00:00.000Z' },
    embeddingProvider,
  });
  await indexMemoryForRetrieval(USER_ID, 'mem-b', {
    store,
    memory: { id: 'mem-b', title: 'B', rawText: 'beta content', createdAt: '2026-06-01T00:00:00.000Z' },
    embeddingProvider,
  });

  // Edit only mem-a; mem-b chunks must be untouched.
  await indexMemoryForRetrieval(USER_ID, 'mem-a', {
    store,
    memory: { id: 'mem-a', title: 'A', rawText: 'gamma content', createdAt: '2026-06-01T00:00:00.000Z' },
    embeddingProvider,
  });

  const aChunks = await store.listChunks(USER_ID, { memoryId: 'mem-a' });
  const bChunks = await store.listChunks(USER_ID, { memoryId: 'mem-b' });

  assert.ok(aChunks.some((chunk) => /gamma content/.test(chunk.chunkText)));
  assert.ok(!aChunks.some((chunk) => /alpha content/.test(chunk.chunkText)));
  assert.ok(bChunks.some((chunk) => /beta content/.test(chunk.chunkText)), 'mem-b must be unaffected');
});
