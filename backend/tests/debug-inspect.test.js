const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const { app, _store: store } = require('../src/server');
const { isDebugEnabled } = require('../src/debugInspect');

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

test('user A cannot fetch user B data through debug routes even with debug enabled', async () => {
  const previous = process.env.ENABLE_NOMI_DEBUG;
  process.env.ENABLE_NOMI_DEBUG = 'true';

  const userA = await signup('debug.boundary.a');
  const userB = await signup('debug.boundary.b');

  // User B owns a memory with chunks, an edge, and a topic page.
  const bMemoryOne = await ingest(userB.auth, {
    title: 'B private research',
    rawText: 'User B private saved memory about semiconductor supply chains and pricing.',
    tags: ['secret'],
  });
  const bMemoryTwo = await ingest(userB.auth, {
    title: 'B second note',
    rawText: 'Another private note by user B about pricing power and moats.',
    tags: ['secret'],
  });

  await store.upsertChunks(userB.userId, bMemoryOne, [{
    memoryId: bMemoryOne,
    chunkId: 'b-chunk-1',
    chunkIndex: 0,
    chunkText: 'User B private saved memory about semiconductor supply chains and pricing.',
    contentHash: 'b-hash-1',
    embeddingStatus: 'complete',
    embeddingModel: 'mock-embedding',
    embeddedAt: '2026-05-20T00:00:00.000Z',
    retryCount: 0,
  }]);

  await store.upsertMemoryEdges(userB.userId, [{
    edgeId: `${bMemoryOne}__${bMemoryTwo}`,
    fromMemoryId: bMemoryOne,
    toMemoryId: bMemoryTwo,
    score: 0.9,
    confidence: 'high',
    reasonTypes: ['shared_tags'],
    reasons: ['Shared tags: secret'],
    sharedTags: ['secret'],
    sharedConcepts: [],
    sharedEntities: [],
    sharedProjects: [],
    semanticSimilarity: 0.9,
    evidence: ['User B private...', 'Another private note...'],
    lastRecomputedAt: '2026-05-20T00:00:00.000Z',
  }]);

  await store.upsertTopicPages(userB.userId, [{
    topicPageId: 'b-topic-secret',
    title: 'B Secret Topic',
    slug: 'b-secret',
    summary: 'User B only grounded summary.',
    keyIdeas: ['Do not leak this.'],
    relatedMemoryIds: [bMemoryOne, bMemoryTwo],
    relatedEdgeIds: [`${bMemoryOne}__${bMemoryTwo}`],
    concepts: ['Semiconductors'],
    entities: [],
    projects: [],
    sourceCount: 2,
    synthesisStatus: 'complete',
    lastSynthesizedAt: '2026-05-20T00:00:00.000Z',
    retryCount: 0,
  }]);

  // User A, authenticated with their own token, targets user B's ids directly.
  const aChunks = await request(app)
    .get(`/api/debug/memories/${bMemoryOne}/chunks`)
    .set(userA.auth);
  assert.equal(aChunks.status, 200);
  assert.deepEqual(aChunks.body.chunks, [], 'must not leak user B chunks');

  const aEdges = await request(app)
    .get(`/api/debug/memories/${bMemoryOne}/edges`)
    .set(userA.auth);
  assert.equal(aEdges.status, 200);
  assert.deepEqual(aEdges.body.edges, [], 'must not leak user B edges');

  const aTopics = await request(app)
    .get('/api/debug/topic-pages')
    .set(userA.auth);
  assert.equal(aTopics.status, 200);
  assert.deepEqual(aTopics.body.topicPages, [], 'must not leak user B topic list');

  // Fetching user B's topic page by id from user A returns not-found (no existence leak).
  const aTopic = await request(app)
    .get('/api/debug/topic-pages/b-topic-secret')
    .set(userA.auth);
  assert.equal(aTopic.status, 404);

  // Sanity: user B still sees their own data, so the boundary is not just "everything empty".
  const bChunks = await request(app)
    .get(`/api/debug/memories/${bMemoryOne}/chunks`)
    .set(userB.auth);
  assert.equal(bChunks.status, 200);
  assert.equal(bChunks.body.chunks.length, 1);

  const bTopic = await request(app)
    .get('/api/debug/topic-pages/b-topic-secret')
    .set(userB.auth);
  assert.equal(bTopic.status, 200);
  assert.equal(bTopic.body.topicPage.topicPageId, 'b-topic-secret');

  if (previous === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previous;
});

test('isDebugEnabled() is false in production even when ENABLE_NOMI_DEBUG is true', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDebug = process.env.ENABLE_NOMI_DEBUG;

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_NOMI_DEBUG = 'true';
  assert.equal(isDebugEnabled(), false, 'debug must be off in production regardless of the flag');

  process.env.NODE_ENV = 'test';
  process.env.ENABLE_NOMI_DEBUG = 'true';
  assert.equal(isDebugEnabled(), true, 'debug still works outside production when flag is true');

  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousDebug === undefined) delete process.env.ENABLE_NOMI_DEBUG;
  else process.env.ENABLE_NOMI_DEBUG = previousDebug;
});
