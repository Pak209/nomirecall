const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMemoryChunks, embedChunks } = require('../src/ai/memoryChunks');
const { answerQuestionFromMemories } = require('../src/ai/queryMemories');
const { buildMemoryEdge, backfillMemoryEdgesForUser } = require('../src/ai/memoryEdges');
const { backfillTopicPagesForUser, clusterMemories } = require('../src/ai/topicPages');

const previousOpenAIKey = process.env.OPENAI_API_KEY;

test.before(() => {
  delete process.env.OPENAI_API_KEY;
});

test.after(() => {
  if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKey;
});

function vec(text) {
  const normalized = String(text || '').toLowerCase();
  return [
    normalized.includes('stocks') || normalized.includes('equities') ? 1 : 0,
    normalized.includes('pricing') ? 1 : 0,
    normalized.includes('travel') ? 1 : 0,
  ];
}

const memories = [
  {
    id: 'mem-stocks',
    title: 'Strong equities note',
    rawText: 'Look at resilient balance sheets, recurring revenue, and durable cash flows.',
    summary: 'Stocks to watch have strong moats and recurring revenue.',
    tags: ['stocks', 'investing'],
    concepts: ['Equities'],
    entities: ['Apple'],
    projectIds: ['project-investing'],
    createdAt: '2026-05-10T00:00:00.000Z',
  },
  {
    id: 'mem-pricing',
    title: 'SaaS pricing',
    rawText: 'Atlas pricing should include a team tier.',
    tags: ['pricing'],
    concepts: ['SaaS pricing'],
    projectIds: ['project-atlas'],
    createdAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'mem-stocks-2',
    title: 'Portfolio quality checklist',
    rawText: 'Quality companies have pricing power and cash generation.',
    tags: ['stocks'],
    concepts: ['Equities'],
    entities: ['Apple'],
    projectIds: ['project-investing'],
    createdAt: '2026-05-12T00:00:00.000Z',
  },
];

test('chunks are created with source metadata and stable content hashes', () => {
  const chunks = buildMemoryChunks(memories[0], { chunkSize: 500 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].memoryId, 'mem-stocks');
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[0].sourceFields.title, 'Strong equities note');
  assert.deepEqual(chunks[0].sourceFields.tags, ['stocks', 'investing']);
  assert.equal(typeof chunks[0].contentHash, 'string');
});

test('chunk metadata filters generic import tags but keeps meaningful user tags', () => {
  const chunks = buildMemoryChunks({
    id: 'mem-x-post',
    title: 'X bookmark',
    rawText: 'Claude learning note from an imported post.',
    tags: ['xpost', 'bookmark', 'Claude', 'learning'],
  });
  assert.deepEqual(chunks[0].sourceFields.tags, ['Claude', 'learning']);
  assert.doesNotMatch(chunks[0].chunkText, /Tags:.*xpost|Tags:.*bookmark/i);
  assert.match(chunks[0].chunkText, /Claude|learning/i);
});

test('embeddings can be generated with a mocked provider', async () => {
  const chunks = buildMemoryChunks(memories[0]);
  const embedded = await embedChunks(chunks, {
    embeddingProvider: { embedText: async (text) => vec(text) },
    embeddingModel: 'mock-embedding',
  });
  assert.equal(embedded[0].embeddingStatus, 'complete');
  assert.deepEqual(embedded[0].embedding, [1, 0, 0]);
  assert.equal(embedded[0].embeddingModel, 'mock-embedding');
});

test('hybrid retrieval uses embedded chunks and keeps cited sources mapped to parent memories', async () => {
  const chunks = (await Promise.all(memories.map(async (memory) => embedChunks(buildMemoryChunks(memory), {
    embeddingProvider: { embedText: async (text) => vec(text) },
    embeddingModel: 'mock-embedding',
  })))).flat();

  const store = {
    async listSources() { return memories; },
    async listChunks() { return chunks; },
  };

  const result = await answerQuestionFromMemories('user-1', 'Which equities look strong?', {
    store,
    embeddingProvider: { embedText: async (text) => vec(text) },
  });

  assert.equal(result.retrievalMode, 'hybrid-embedding');
  assert.equal(result.sources[0].memoryId, 'mem-stocks');
  assert.match(result.sources[0].snippet, /Stocks|recurring|balance/i);
});

test('fallback retrieval still works when embeddings are missing', async () => {
  const store = {
    async listSources() { return memories; },
    async listChunks() { return []; },
  };
  const result = await answerQuestionFromMemories('user-1', 'Atlas pricing', { store });
  assert.equal(result.retrievalMode, 'keyword-semantic-lite');
  assert.equal(result.sources[0].memoryId, 'mem-pricing');
});

test('memory edges are generated for related memories and avoid weak unrelated pairs', async () => {
  const strong = buildMemoryEdge('user-1', memories[0], memories[2]);
  const weak = buildMemoryEdge('user-1', memories[0], memories[1]);
  assert.ok(strong);
  assert.equal(strong.edgeId, 'mem-stocks__mem-stocks-2');
  assert.match(strong.reasons.join(' '), /Shared/);
  assert.equal(weak, null);
});

test('generic tags do not create noisy memory edges', () => {
  const genericA = {
    id: 'mem-generic-a',
    title: 'Imported X post',
    rawText: 'A note about product pricing.',
    tags: ['xpost', 'bookmark', 'link'],
    concepts: [],
    entities: [],
    projectIds: [],
    category: 'General',
  };
  const genericB = {
    id: 'mem-generic-b',
    title: 'Another bookmark',
    rawText: 'A recipe idea unrelated to product strategy.',
    tags: ['xpost', 'bookmark', 'link'],
    concepts: [],
    entities: [],
    projectIds: [],
    category: 'General',
  };

  assert.equal(buildMemoryEdge('user-1', genericA, genericB), null);
});

test('edge backfill is safe to rerun and does not duplicate canonical pairs', async () => {
  const store = { async listSources() { return memories; } };
  const first = await backfillMemoryEdgesForUser('user-1', { store });
  const second = await backfillMemoryEdgesForUser('user-1', { store });
  assert.equal(first.edgeCount, second.edgeCount);
  assert.equal(new Set(first.edges.map((edge) => edge.edgeId)).size, first.edgeCount);
});

test('topic pages are created from related memory clusters and cite real memories', async () => {
  const clusters = clusterMemories(memories, { minMemories: 2 });
  assert.ok(clusters.length >= 1);
  const result = await backfillTopicPagesForUser('user-1', {
    memories,
    clusters,
    aiProvider: {
      synthesizeTopicPage: async ({ title }) => ({
        title,
        summary: 'This should be replaced by grounded server-side summary.',
        keyIdeas: [
          {
            idea: 'The saved investing memories focus on recurring revenue and quality companies.',
            supportingMemoryIds: ['mem-stocks', 'mem-stocks-2'],
          },
          {
            idea: 'This unsupported idea should be dropped.',
            supportingMemoryIds: ['not-real'],
          },
        ],
        openQuestions: [],
        possibleRelatedTopics: [],
      }),
    },
  });
  assert.equal(result.topicPageCount >= 1, true);
  assert.ok(result.pages[0].relatedMemoryIds.every((id) => memories.some((memory) => memory.id === id)));
  assert.deepEqual(result.pages[0].keyIdeas, [
    'The saved investing memories focus on recurring revenue and quality companies.',
  ]);
  assert.deepEqual(result.pages[0].keyIdeaCitations, [
    {
      idea: 'The saved investing memories focus on recurring revenue and quality companies.',
      supportingMemoryIds: ['mem-stocks', 'mem-stocks-2'],
    },
  ]);
  assert.match(result.pages[0].summary, /Across \d+ saved memories/);
  assert.doesNotMatch(result.pages[0].summary, /replaced by grounded/);
  assert.equal(new Set(result.pages.map((page) => page.slug)).size, result.pages.length);
});

test('topic clustering skips generic labels by default', () => {
  const genericMemories = [
    { id: 'mem-1', title: 'Link 1', tags: ['bookmark'], category: 'General' },
    { id: 'mem-2', title: 'Link 2', tags: ['bookmark'], category: 'General' },
    { id: 'mem-3', title: 'Link 3', tags: ['bookmark'], category: 'General' },
  ];
  const clusters = clusterMemories(genericMemories);
  assert.deepEqual(clusters, []);
});
