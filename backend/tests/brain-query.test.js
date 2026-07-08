const assert = require('node:assert/strict');
const test = require('node:test');

const { answerQuestionFromMemories } = require('../src/ai/queryMemories');
const aiProviderModule = require('../src/ai/aiProvider');

const previousOpenAIKey = process.env.OPENAI_API_KEY;
const previousNomiOpenAIKey = process.env.NOMI_OPENAI_API_KEY;
const previousNomiAIProvider = process.env.NOMI_AI_PROVIDER;

test.before(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.NOMI_OPENAI_API_KEY;
});

test.after(() => {
  if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKey;
  if (previousNomiOpenAIKey === undefined) delete process.env.NOMI_OPENAI_API_KEY;
  else process.env.NOMI_OPENAI_API_KEY = previousNomiOpenAIKey;
  if (previousNomiAIProvider === undefined) delete process.env.NOMI_AI_PROVIDER;
  else process.env.NOMI_AI_PROVIDER = previousNomiAIProvider;
});

function memoryStore(memories) {
  return {
    async listSources() {
      return memories;
    },
  };
}

const memories = [
  {
    id: 'mem-atlas-pricing',
    title: 'Atlas pricing research',
    rawText: 'Atlas pricing should include a team tier and beta discount notes.',
    tags: ['atlas', 'pricing'],
    concepts: ['SaaS pricing'],
    projectIds: ['project-atlas'],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'mem-atlas-onboarding',
    title: 'Atlas onboarding plan',
    rawText: 'Design partner onboarding needs welcome email drafts and setup calls.',
    tags: ['atlas', 'onboarding'],
    projectIds: ['project-atlas'],
    createdAt: '2026-05-02T00:00:00.000Z',
  },
  {
    id: 'mem-personal-travel',
    title: 'Tokyo travel ideas',
    rawText: 'A ramen route and neighborhood walking list for Tokyo.',
    tags: ['travel'],
    projectIds: ['project-travel'],
    createdAt: '2026-05-03T00:00:00.000Z',
  },
];

test('brain query still answers globally without project scope', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
  });

  assert.equal(result.retrievalMode, 'keyword-semantic-lite');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].memoryId, 'mem-personal-travel');
  assert.equal(result.scope, undefined);
});

test('project-scoped brain query returns project-linked memories', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.equal(result.scope.type, 'project');
  assert.equal(result.scope.projectId, 'project-atlas');
  assert.equal(result.scope.projectTitle, 'Atlas Launch');
  assert.equal(result.sources[0].memoryId, 'mem-atlas-pricing');
  assert.match(result.sources[0].relevanceReason, /Linked to project/);
});

test('project-scoped brain query does not return unrelated project memories by default', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.confidence, 'low');
  assert.match(result.answer, /in this project/i);
});

test('cross-user project scope cannot leak another user project memories', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-2',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing'],
    },
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.confidence, 'low');
  assert.match(result.answer, /in this project/i);
});

test('project-scoped brain query can use explicit global fallback', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    allowGlobalFallback: true,
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].memoryId, 'mem-personal-travel');
});

test('embedding provider failure falls back to keyword retrieval without throwing', async () => {
  // Provide a stored chunk with a complete embedding so retrieveHybridMemories
  // actually reaches the embedQuestion() call instead of short-circuiting on
  // an empty chunk list.
  const storeWithChunks = {
    ...memoryStore(memories),
    async listChunks() {
      return [
        {
          chunkId: 'chunk-atlas-pricing-1',
          memoryId: 'mem-atlas-pricing',
          chunkText: 'Atlas pricing should include a team tier and beta discount notes.',
          embedding: [0.1, 0.2, 0.3],
          embeddingStatus: 'complete',
        },
      ];
    },
  };
  const embeddingProvider = {
    async embedText() {
      throw new Error('embedding provider unavailable');
    },
  };

  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: storeWithChunks,
    embeddingProvider,
  });

  // embedQuestion() catches the rejection and retrieveHybridMemories returns
  // no candidates, so answerQuestionFromMemories falls back to the plain
  // keyword retriever (see queryMemories.js around lines 594-601 / 717-736).
  assert.equal(result.retrievalMode, 'keyword-semantic-lite');
  assert.ok(result.sources.length > 0, 'keyword fallback should still return results');
  assert.ok(
    result.sources.some((source) => source.memoryId === 'mem-atlas-pricing'),
    'keyword fallback should surface the atlas pricing memory',
  );
});

// Task 1.1: validates that AI-provided relatedMemoryIds are filtered against
// the retrieved memory set so hallucinated citations never reach the client.
test('AI-provided relatedMemoryIds are validated against retrieved memories', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.NOMI_AI_PROVIDER = 'openai';
  // queryMemories.js destructures `createAIProvider` from aiProvider.js at
  // require time, so re-assigning that export later would not affect the
  // already-bound local reference. Instead we patch the prototype method
  // that createAIProvider(...) ultimately calls (`new OpenAIProvider(config)`),
  // which is shared across any reference to the constructor.
  const originalAnswerMemoryQuestion = aiProviderModule.OpenAIProvider.prototype.answerMemoryQuestion;
  aiProviderModule.OpenAIProvider.prototype.answerMemoryQuestion = async function mockAnswerMemoryQuestion() {
    return {
      answer: 'Atlas pricing includes a team tier.',
      confidence: 'high',
      // 'mem-atlas-pricing' is a real retrieved memory; 'hallucinated-mem-999'
      // is not present anywhere in the retrieved set.
      relatedMemoryIds: ['mem-atlas-pricing', 'hallucinated-mem-999'],
    };
  };
  t.after(() => {
    aiProviderModule.OpenAIProvider.prototype.answerMemoryQuestion = originalAnswerMemoryQuestion;
    delete process.env.OPENAI_API_KEY;
    delete process.env.NOMI_AI_PROVIDER;
  });

  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: memoryStore(memories),
  });

  // queryMemories.js filters ai.relatedMemoryIds down to only the IDs present
  // in the retrieved memory set, so the hallucinated id is dropped while the
  // genuinely retrieved id is preserved.
  assert.deepEqual(result.relatedMemoryIds, ['mem-atlas-pricing']);
  assert.ok(
    !result.sources.some((source) => source.memoryId === 'hallucinated-mem-999'),
    'hallucinated id should not appear in retrieved sources, confirming it was never actually retrieved',
  );
});
