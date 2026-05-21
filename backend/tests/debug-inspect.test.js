const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';

const { app, _store: store } = require('../src/server');

async function signup(prefix) {
  const response = await request(app)
    .post('/api/auth/email/signup')
    .send({ email: `${prefix}.${Date.now()}.${Math.random()}@example.com`, password: 'password123' });
  assert.equal(response.status, 201);
  return {
    userId: response.body.user.id,
    auth: { Authorization: `Bearer ${response.body.token}` },
  };
}

async function ingest(auth, input) {
  const response = await request(app)
    .post('/api/ingest')
    .set(auth)
    .send({
      raw_text: input.rawText,
      title: input.title,
      type: 'note',
      category: input.category || 'Research',
      tags: input.tags || [],
    });
  assert.equal(response.status, 200);
  return response.body.source_id;
}

test('debug endpoints are blocked when debug mode is disabled', async () => {
  const previous = process.env.ENABLE_NOMI_DEBUG;
  process.env.ENABLE_NOMI_DEBUG = 'false';
  const user = await signup('debug.blocked');
  const response = await request(app)
    .get('/api/debug/topic-pages')
    .set(user.auth);
  assert.equal(response.status, 404);
  if (previous === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previous;
});

test('query trace returns scoring info without changing brain query shape', async () => {
  const previous = process.env.ENABLE_NOMI_DEBUG;
  process.env.ENABLE_NOMI_DEBUG = 'true';
  const user = await signup('debug.trace');
  const memoryId = await ingest(user.auth, {
    title: 'Project Atlas pricing',
    rawText: 'Project Atlas pricing has a team tier and beta invite discounts.',
    tags: ['atlas', 'pricing'],
  });

  const normal = await request(app)
    .post('/api/brain/query')
    .set(user.auth)
    .send({ question: 'What about Atlas pricing?' });
  assert.equal(normal.status, 200);
  assert.equal(normal.body.sources[0].memoryId, memoryId);
  assert.equal(normal.body.matchedChunks, undefined);

  const trace = await request(app)
    .get('/api/debug/brain/query-trace')
    .query({ question: 'What about Atlas pricing?' })
    .set(user.auth);
  assert.equal(trace.status, 200);
  assert.equal(trace.body.retrievalMode, 'keyword-semantic-lite');
  assert.equal(trace.body.fallbackUsed, true);
  assert.equal(trace.body.returnedCount, 1);
  assert.equal(trace.body.citedMemoryIds[0], memoryId);
  assert.ok(trace.body.candidates[0].finalScore > 0);
  assert.match(trace.body.candidates[0].relevanceReason, /Matched/i);

  if (previous === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previous;
});

test('memory chunks debug endpoint only reads current user chunks and previews text', async () => {
  const previous = process.env.ENABLE_NOMI_DEBUG;
  process.env.ENABLE_NOMI_DEBUG = 'true';
  const owner = await signup('debug.chunks.owner');
  const other = await signup('debug.chunks.other');
  const memoryId = await ingest(owner.auth, {
    title: 'Chunkable note',
    rawText: 'This is a private saved memory with enough text to inspect as a chunk preview.',
    tags: ['private'],
  });

  await store.upsertChunks(owner.userId, memoryId, [{
    memoryId,
    chunkId: 'chunk-1',
    chunkIndex: 0,
    chunkText: 'This is a private saved memory with enough text to inspect as a chunk preview.',
    contentHash: 'hash-1',
    embeddingStatus: 'complete',
    embeddingModel: 'mock-embedding',
    embeddedAt: '2026-05-20T00:00:00.000Z',
    retryCount: 0,
  }]);

  const ownerResponse = await request(app)
    .get(`/api/debug/memories/${memoryId}/chunks`)
    .set(owner.auth);
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerResponse.body.chunks.length, 1);
  assert.equal(ownerResponse.body.chunks[0].chunkText, undefined);
  assert.match(ownerResponse.body.chunks[0].chunkTextPreview, /private saved memory/);

  const otherResponse = await request(app)
    .get(`/api/debug/memories/${memoryId}/chunks`)
    .set(other.auth);
  assert.equal(otherResponse.status, 200);
  assert.deepEqual(otherResponse.body.chunks, []);

  if (previous === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previous;
});

test('memory edges and topic pages debug endpoints are user-scoped', async () => {
  const previous = process.env.ENABLE_NOMI_DEBUG;
  process.env.ENABLE_NOMI_DEBUG = 'true';
  const owner = await signup('debug.knowledge.owner');
  const other = await signup('debug.knowledge.other');
  const firstId = await ingest(owner.auth, {
    title: 'Equities checklist',
    rawText: 'Look for durable cash flows and pricing power.',
    tags: ['stocks'],
  });
  const secondId = await ingest(owner.auth, {
    title: 'Portfolio quality',
    rawText: 'Quality companies often show recurring revenue and pricing power.',
    tags: ['stocks'],
  });

  await store.upsertMemoryEdges(owner.userId, [{
    edgeId: `${firstId}__${secondId}`,
    fromMemoryId: firstId,
    toMemoryId: secondId,
    score: 0.77,
    confidence: 'medium',
    reasonTypes: ['shared_tags', 'semantic_similarity'],
    reasons: ['Shared tags: stocks', 'Similar embedded meaning'],
    sharedTags: ['stocks'],
    sharedConcepts: [],
    sharedEntities: [],
    sharedProjects: [],
    semanticSimilarity: 0.83,
    evidence: ['Look for durable cash flows...', 'Quality companies often show...'],
    lastRecomputedAt: '2026-05-20T00:00:00.000Z',
  }]);

  await store.upsertTopicPages(owner.userId, [{
    topicPageId: 'topic-stocks',
    title: 'Stocks',
    slug: 'stocks',
    summary: 'Grounded summary from saved memories.',
    keyIdeas: ['Pricing power matters.'],
    relatedMemoryIds: [firstId, secondId],
    relatedEdgeIds: [`${firstId}__${secondId}`],
    concepts: ['Equities'],
    entities: [],
    projects: [],
    sourceCount: 2,
    synthesisStatus: 'complete',
    lastSynthesizedAt: '2026-05-20T00:00:00.000Z',
    retryCount: 0,
  }]);

  const edges = await request(app)
    .get(`/api/debug/memories/${firstId}/edges`)
    .set(owner.auth);
  assert.equal(edges.status, 200);
  assert.equal(edges.body.edges.length, 1);
  assert.equal(edges.body.edges[0].connectedMemoryId, secondId);
  assert.deepEqual(edges.body.edges[0].sharedTags, ['stocks']);

  const topics = await request(app)
    .get('/api/debug/topic-pages')
    .set(owner.auth);
  assert.equal(topics.status, 200);
  assert.equal(topics.body.topicPages.length, 1);
  assert.equal(topics.body.topicPages[0].topicPageId, 'topic-stocks');

  const topic = await request(app)
    .get('/api/debug/topic-pages/topic-stocks')
    .set(owner.auth);
  assert.equal(topic.status, 200);
  assert.equal(topic.body.topicPage.relatedMemoryIds.length, 2);

  const otherEdges = await request(app)
    .get(`/api/debug/memories/${firstId}/edges`)
    .set(other.auth);
  assert.equal(otherEdges.status, 200);
  assert.deepEqual(otherEdges.body.edges, []);

  const otherTopics = await request(app)
    .get('/api/debug/topic-pages')
    .set(other.auth);
  assert.equal(otherTopics.status, 200);
  assert.deepEqual(otherTopics.body.topicPages, []);

  if (previous === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previous;
});
