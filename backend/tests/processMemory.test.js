const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.NOMI_AI_PROVIDER = 'openai';
process.env.NOMI_AI_DISABLE_LIMITS = 'true';
process.env.NOMI_AI_MIN_PROCESS_CHARS = '1';

const admin = require('firebase-admin');

// --- Minimal in-memory Firestore fake -------------------------------------
// processMemory.js talks to Firestore only through:
//   admin.firestore().collection('users').doc(userId).collection('memories').doc(memoryId)
//     -> .get() / .set(data, { merge })
//   admin.firestore().collection('users').doc(userId).collection('usage').doc(usageDocId)
//     -> .get() / .set(data, { merge })
// This fake supports exactly that nested shape, generically, using a flat
// Map keyed by the full path so any collection/doc nesting depth works.

function createFakeFirestore() {
  const store = new Map();

  function docRef(path) {
    return {
      async get() {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          id: path.split('/').pop(),
          data: () => (data ? { ...data } : undefined),
        };
      },
      async set(data, options = {}) {
        const existing = store.get(path);
        if (options.merge && existing) {
          store.set(path, deepMerge(existing, data));
        } else {
          store.set(path, data);
        }
      },
      collection(name) {
        return collectionRef(`${path}/${name}`);
      },
    };
  }

  function collectionRef(path) {
    return {
      doc(id) {
        return docRef(`${path}/${id}`);
      },
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      async get() {
        // Return every doc stored directly under this collection path, i.e.
        // keys of the form `${path}/<docId>` with no further nesting.
        const docs = [];
        for (const [key, data] of store.entries()) {
          if (!key.startsWith(`${path}/`)) continue;
          const rest = key.slice(path.length + 1);
          if (rest.includes('/')) continue; // skip nested sub-collection docs
          docs.push({
            id: rest,
            exists: data !== undefined,
            data: () => ({ ...data }),
          });
        }
        return { docs };
      },
    };
  }

  function deepMerge(target, patch) {
    const result = { ...target };
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) {
        result[key] = deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return {
    collection(name) {
      return collectionRef(name);
    },
    _store: store,
  };
}

const fakeFirestoreInstance = createFakeFirestore();

function fakeFirestore() {
  return fakeFirestoreInstance;
}
fakeFirestore.FieldValue = { serverTimestamp: () => new Date().toISOString() };

// Force admin.apps.length > 0 (processMemory.js throws otherwise) and route
// admin.firestore() to our in-memory fake instead of a real Firebase project.
Object.defineProperty(admin, 'apps', {
  configurable: true,
  get: () => [{ name: '[TEST]' }],
});
Object.defineProperty(admin, 'firestore', {
  configurable: true,
  value: fakeFirestore,
});

// --- Mock the AI provider used by processMemory.js ------------------------
// processMemory.js does `const { createAIProvider } = require('./aiProvider')`
// at module-load time, so the swap must happen before processMemory.js is
// first required (destructuring captures the reference at that point).
const aiProviderModule = require('../src/ai/aiProvider');

let mockProcessMemoryImpl = async () => {
  throw new Error('mockProcessMemoryImpl not configured for this test');
};

aiProviderModule.createAIProvider = () => ({
  processMemory: (input) => mockProcessMemoryImpl(input),
});

const {
  processMemoryForAI,
  processMemoryIds,
  retryFailedMemoriesForUser,
} = require('../src/ai/processMemory');

function seedMemory(userId, memoryId, memory) {
  fakeFirestoreInstance._store.set(`users/${userId}/memories/${memoryId}`, memory);
}

function getMemory(userId, memoryId) {
  return fakeFirestoreInstance._store.get(`users/${userId}/memories/${memoryId}`);
}

test('processMemoryForAI marks memory failed (not stuck processing) when the AI provider call rejects/times out', async () => {
  const userId = 'user-timeout';
  const memoryId = 'mem-timeout';
  seedMemory(userId, memoryId, {
    rawText: 'This is a sufficiently long piece of memory text to process.',
  });

  mockProcessMemoryImpl = async () => {
    throw new Error('OpenAI request timed out');
  };

  const result = await processMemoryForAI(userId, memoryId, {});

  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'OpenAI request timed out');

  const stored = getMemory(userId, memoryId);
  // Document current behavior: processing ends in 'failed', not stuck at 'processing'.
  assert.equal(stored.ai.processingStatus, 'failed');
  assert.equal(stored.ai.errorMessage, 'OpenAI request timed out');
  assert.equal(stored.ai.retryCount, 1);
});

test('processMemoryIds records a partial batch failure: 2 processed, 1 failed, usage recorded for 2 not 3', async () => {
  const userId = 'user-batch';
  ['mem-good-1', 'mem-fail', 'mem-good-2'].forEach((memoryId) => {
    seedMemory(userId, memoryId, {
      rawText: `Sufficiently long memory text for ${memoryId} to be processed by AI.`,
    });
  });

  mockProcessMemoryImpl = async (input) => {
    if (input.memoryId === 'mem-fail') {
      throw new Error('provider failure for mem-fail');
    }
    return {
      summary: `summary for ${input.memoryId}`,
      category: 'note',
      tags: [],
      concepts: [],
      entities: [],
    };
  };

  const summary = await processMemoryIds(userId, ['mem-good-1', 'mem-fail', 'mem-good-2'], {});

  assert.equal(summary.processedCount, 2);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.errors.length, 1);

  // Usage/quota is recorded (via aiUsage's in-memory fallback since Firestore
  // usage docs route through the fake store too) for exactly the 2 processed
  // and 1 failed items -- not 3 processed.
  assert.equal(summary.usage.processedCount, 2);
  assert.equal(summary.usage.failedCount, 1);

  assert.equal(getMemory(userId, 'mem-good-1').ai.processingStatus, 'processed');
  assert.equal(getMemory(userId, 'mem-fail').ai.processingStatus, 'failed');
  assert.equal(getMemory(userId, 'mem-good-2').ai.processingStatus, 'processed');
});

test('retryFailedMemoriesForUser retries a failed memory under the retry cap and reprocesses it', async () => {
  const userId = 'user-retry-under-cap';
  const memoryId = 'mem-retry';
  seedMemory(userId, memoryId, {
    createdAt: '2026-01-01T00:00:00.000Z',
    rawText: 'A sufficiently long failed memory that should be retried by AI.',
    ai: { processingStatus: 'failed', retryCount: 1, errorMessage: 'earlier failure' },
  });

  const seen = [];
  mockProcessMemoryImpl = async (input) => {
    seen.push(input.memoryId);
    return {
      summary: `recovered summary for ${input.memoryId}`,
      category: 'note',
      tags: [],
      concepts: [],
      entities: [],
    };
  };

  const summary = await retryFailedMemoriesForUser(userId, {});

  assert.equal(summary.retriedCount, 1);
  assert.equal(summary.cappedCount, 0);
  assert.equal(summary.processedCount, 1);
  assert.deepEqual(seen, [memoryId]);
  assert.equal(getMemory(userId, memoryId).ai.processingStatus, 'processed');
});

test('retryFailedMemoriesForUser does NOT retry a memory at/over the retry cap (capped, provider never called)', async () => {
  const userId = 'user-retry-capped';
  seedMemory(userId, 'mem-under-cap', {
    createdAt: '2026-01-02T00:00:00.000Z',
    rawText: 'A failed memory still under the retry cap and eligible for retry.',
    ai: { processingStatus: 'failed', retryCount: 2, errorMessage: 'boom' },
  });
  seedMemory(userId, 'mem-at-cap', {
    createdAt: '2026-01-01T00:00:00.000Z',
    rawText: 'A permanently failing memory that has already hit the retry cap.',
    ai: { processingStatus: 'failed', retryCount: 3, errorMessage: 'permanent boom' },
  });

  const seen = [];
  mockProcessMemoryImpl = async (input) => {
    seen.push(input.memoryId);
    return {
      summary: `recovered summary for ${input.memoryId}`,
      category: 'note',
      tags: [],
      concepts: [],
      entities: [],
    };
  };

  const summary = await retryFailedMemoriesForUser(userId, {});

  // Only the under-cap memory is retried; the capped one is counted, not retried.
  assert.equal(summary.retriedCount, 1);
  assert.equal(summary.cappedCount, 1);
  assert.equal(summary.processedCount, 1);

  // The mock provider must NEVER be called for the capped memory.
  assert.ok(seen.includes('mem-under-cap'));
  assert.ok(!seen.includes('mem-at-cap'), 'capped memory must not be reprocessed by the provider');

  // The capped memory is left untouched at its terminal failed state.
  assert.equal(getMemory(userId, 'mem-at-cap').ai.processingStatus, 'failed');
  assert.equal(getMemory(userId, 'mem-at-cap').ai.retryCount, 3);
});

test('retryFailedMemoriesForUser honors an explicit maxRetries (the value the route clamps to <= 3)', async () => {
  const userId = 'user-retry-explicit-cap';
  seedMemory(userId, 'mem-rc-2', {
    createdAt: '2026-01-02T00:00:00.000Z',
    rawText: 'Failed memory with retryCount 2, eligible only when maxRetries > 2.',
    ai: { processingStatus: 'failed', retryCount: 2, errorMessage: 'boom' },
  });
  seedMemory(userId, 'mem-rc-3', {
    createdAt: '2026-01-01T00:00:00.000Z',
    rawText: 'Failed memory with retryCount 3, at the hard cap of 3.',
    ai: { processingStatus: 'failed', retryCount: 3, errorMessage: 'boom' },
  });

  const seen = [];
  mockProcessMemoryImpl = async (input) => {
    seen.push(input.memoryId);
    return { summary: 's', category: 'note', tags: [], concepts: [], entities: [] };
  };

  // The server route clamps any client-supplied maxRetries to at most 3, so the
  // effective value reaching this function is never above 3. With maxRetries=3,
  // the retryCount===3 memory is still excluded (capped), proving the cap holds
  // even at the clamped ceiling.
  const summary = await retryFailedMemoriesForUser(userId, { maxRetries: 3 });

  assert.equal(summary.retriedCount, 1);
  assert.equal(summary.cappedCount, 1);
  assert.ok(seen.includes('mem-rc-2'));
  assert.ok(!seen.includes('mem-rc-3'), 'retryCount at the hard cap must never be retried');
});
