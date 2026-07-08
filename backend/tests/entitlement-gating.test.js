const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const { app } = require('../src/server');

// Helper: create a fresh user and return an Authorization header for them.
async function signup(label) {
  const email = `entitlement.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password: 'password123' });
  assert.equal(res.status, 201, 'signup should succeed');
  return { authHeader: { Authorization: `Bearer ${res.body.token}` }, email };
}

// Helper: set the signed-in user's tier via the app's own PATCH route (black-box).
async function setTier(authHeader, tier) {
  const res = await request(app)
    .patch('/api/auth/tier')
    .set(authHeader)
    .send({ tier });
  assert.equal(res.status, 200, `setting tier=${tier} should succeed`);
}

// The exact 403 message requireTier('brain') emits. Used to distinguish a
// tier-gate rejection from any other (unrelated) 403.
const BRAIN_GATE_ERROR = 'This feature requires a Nomi brain subscription.';

test('free-tier user is blocked from on-demand brief generation (403)', async () => {
  const { authHeader } = await signup('free');
  // New email/password users default to the free tier — no tier set needed.

  const res = await request(app)
    .post('/api/daily-briefs/generate-today')
    .set(authHeader)
    .send({});

  assert.equal(res.status, 403, 'free tier should be blocked at the gate');
  assert.equal(res.body.error, BRAIN_GATE_ERROR);
});

test('brain-tier user is allowed PAST the brief-generation gate', async () => {
  const { authHeader } = await signup('brain');
  await setTier(authHeader, 'brain');

  const res = await request(app)
    .post('/api/daily-briefs/generate-today')
    .set(authHeader)
    .send({});

  // AI mocking is not set up, so the handler may return 200/500/503 — the point
  // is only that the tier gate did NOT reject the request. Assert it is neither a
  // 403 nor the specific tier-gate error, keeping the test robust to handler behavior.
  assert.notEqual(res.status, 403, 'brain tier should not hit the 403 gate');
  assert.notEqual(res.body && res.body.error, BRAIN_GATE_ERROR);
});

test('pro-tier user is allowed PAST the brief-generation gate', async () => {
  const { authHeader } = await signup('pro');
  await setTier(authHeader, 'pro');

  const res = await request(app)
    .post('/api/daily-briefs/generate-today')
    .set(authHeader)
    .send({});

  assert.notEqual(res.status, 403, 'pro tier should not hit the 403 gate');
  assert.notEqual(res.body && res.body.error, BRAIN_GATE_ERROR);
});

test('free-tier user is blocked from generate-for-date and :dateKey/generate (403)', async () => {
  const { authHeader } = await signup('free-other-routes');

  const forDate = await request(app)
    .post('/api/daily-briefs/generate-for-date')
    .set(authHeader)
    .send({ dateKey: '2026-07-07' });
  assert.equal(forDate.status, 403);
  assert.equal(forDate.body.error, BRAIN_GATE_ERROR);

  const byDateKey = await request(app)
    .post('/api/daily-briefs/2026-07-07/generate')
    .set(authHeader)
    .send({});
  assert.equal(byDateKey.status, 403);
  assert.equal(byDateKey.body.error, BRAIN_GATE_ERROR);
});

test('reading briefs stays open to free-tier users (not tier-gated)', async () => {
  const { authHeader } = await signup('free-read');

  // GET list must not be blocked by a tier gate. It may 200 or 503 (feature
  // availability), but must never be a 403 tier rejection.
  const list = await request(app).get('/api/daily-briefs').set(authHeader);
  assert.notEqual(list.status, 403, 'reading brief list must stay open to free users');
  assert.notEqual(list.body && list.body.error, BRAIN_GATE_ERROR);
});

test('free-quota AI endpoints are NOT tier-gated (no 403 tier rejection)', async () => {
  const { authHeader } = await signup('free-ai');

  // A free user hitting the AI query endpoint must never be rejected with the
  // brain-tier gate error. (It may 200 with a low-confidence answer, or hit the
  // daily quota — both are fine; a tier-gate 403 would be the regression.)
  const query = await request(app)
    .post('/api/brain/query')
    .set(authHeader)
    .send({ question: 'anything at all' });
  assert.notEqual(query.body && query.body.error, BRAIN_GATE_ERROR, 'AI query must not be tier-gated');

  // process-unprocessed is likewise a quota-limited free feature, not premium-exclusive.
  const process = await request(app)
    .post('/api/memories/process-unprocessed')
    .set(authHeader)
    .send({});
  assert.notEqual(process.body && process.body.error, BRAIN_GATE_ERROR, 'AI processing must not be tier-gated');
});
