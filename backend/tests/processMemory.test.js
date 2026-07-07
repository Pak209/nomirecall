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
        return { docs: [] };
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
