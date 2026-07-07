const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const { app } = require('../src/server');

async function signup(label) {
  const email = `ingest.dedup.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password: 'password123' });
  assert.equal(res.status, 201, 'signup should succeed');
  return { authHeader: { Authorization: `Bearer ${res.body.token}` }, email };
}

async function ingest(authHeader, body) {
  return request(app)
    .post('/api/ingest')
    .set(authHeader)
    .send(body);
}

test('ingesting identical content twice for the same user is deduped', async () => {
  const { authHeader } = await signup('same-user');
  const rawText = `Remember to review the Q3 roadmap draft ${Date.now()}.`;

  const first = await ingest(authHeader, {
    raw_text: rawText,
    title: 'Q3 roadmap note',
    type: 'note',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal(first.body.duplicate, false);
  assert.equal(typeof first.body.source_id, 'string');
  assert.ok(first.body.source_id.length > 0);

  const second = await ingest(authHeader, {
    raw_text: rawText,
    title: 'Q3 roadmap note',
    type: 'note',
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.success, true);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.source_id, first.body.source_id);

  const memories = await request(app)
    .get('/api/memories')
    .set(authHeader);
  assert.equal(memories.status, 200);
  const matches = memories.body.memories.filter((memory) => memory.rawText === rawText);
  assert.equal(matches.length, 1, 'only one memory should exist for the duplicated content');
});

test('identical content from two different users creates two separate memories', async () => {
  const userA = await signup('user-a');
  const userB = await signup('user-b');
  const rawText = `Shared note text captured by two people ${Date.now()}.`;

  const captureA = await ingest(userA.authHeader, {
    raw_text: rawText,
    title: 'Shared note',
    type: 'note',
  });
  assert.equal(captureA.status, 200);
  assert.equal(captureA.body.duplicate, false);

  const captureB = await ingest(userB.authHeader, {
    raw_text: rawText,
    title: 'Shared note',
    type: 'note',
  });
  assert.equal(captureB.status, 200);
  assert.equal(captureB.body.duplicate, false, 'a different user capturing the same content is not a duplicate');
  assert.notEqual(captureB.body.source_id, captureA.body.source_id);

  const memoriesA = await request(app)
    .get('/api/memories')
    .set(userA.authHeader);
  assert.equal(memoriesA.status, 200);
  const memoriesB = await request(app)
    .get('/api/memories')
    .set(userB.authHeader);
  assert.equal(memoriesB.status, 200);

  const matchesA = memoriesA.body.memories.filter((memory) => memory.rawText === rawText);
  const matchesB = memoriesB.body.memories.filter((memory) => memory.rawText === rawText);
  assert.equal(matchesA.length, 1, 'user A should have exactly one memory of the shared content');
  assert.equal(matchesB.length, 1, 'user B should have exactly one memory of the shared content');

  // User A must not see user B's memory (and vice versa) - no cross-user collision.
  assert.ok(!memoriesA.body.memories.some((memory) => memory.id === captureB.body.source_id));
  assert.ok(!memoriesB.body.memories.some((memory) => memory.id === captureA.body.source_id));
});

test('empty captures are not deduped against each other', async () => {
  const { authHeader } = await signup('empty-capture');

  const first = await ingest(authHeader, {
    raw_text: '',
    title: 'Blank capture one',
    type: 'note',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.duplicate, false);

  const second = await ingest(authHeader, {
    raw_text: '   ',
    title: 'Blank capture two',
    type: 'note',
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, false, 'empty/whitespace-only captures should never be flagged as duplicates');
  assert.notEqual(second.body.source_id, first.body.source_id);
});
