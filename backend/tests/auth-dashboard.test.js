const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';

const { app } = require('../src/server');

test('email signup + signin + password reset flow', async () => {
  const email = `auth.test.${Date.now()}@example.com`;
  const password = 'password123';
  const newPassword = 'newpassword456';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);
  assert.equal(typeof signup.body.token, 'string');
  assert.equal(signup.body.user.email, email);

  const forgot = await request(app)
    .post('/api/auth/password/forgot')
    .send({ email });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.ok, true);
  assert.equal(typeof forgot.body.debugResetToken, 'string');

  const reset = await request(app)
    .post('/api/auth/password/reset')
    .send({ token: forgot.body.debugResetToken, password: newPassword });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.ok, true);

  const signin = await request(app)
    .post('/api/auth/email')
    .send({ email, password: newPassword });
  assert.equal(signin.status, 200);
  assert.equal(typeof signin.body.token, 'string');
});

test('dashboard endpoints return expected shape', async () => {
  const email = `dashboard.test.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);
  const token = signup.body.token;
  assert.ok(token);

  const authHeader = { Authorization: `Bearer ${token}` };

  const summary = await request(app).get('/api/dashboard/summary').set(authHeader);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary, null);

  const memory = await request(app).get('/api/dashboard/memory').set(authHeader);
  assert.equal(memory.status, 200);
  assert.equal(memory.body.memory, null);

  const recent = await request(app).get('/api/dashboard/recent').set(authHeader);
  assert.equal(recent.status, 200);
  assert.ok(Array.isArray(recent.body.items));

  const categories = await request(app).get('/api/dashboard/categories').set(authHeader);
  assert.equal(categories.status, 200);
  assert.ok(Array.isArray(categories.body.categories));
});

test('x discovery reports missing api key without calling X', async () => {
  const email = `x.no-key.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);

  const authHeader = { Authorization: `Bearer ${signup.body.token}` };
  const interests = await request(app)
    .patch('/api/auth/interests')
    .set(authHeader)
    .send({ interests: ['ai_tech'] });
  assert.equal(interests.status, 200);

  const previousToken = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;

  const discover = await request(app)
    .get('/api/x/discover?topics=ai_tech&limit=5')
    .set(authHeader);

  if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = previousToken;
  assert.equal(discover.status, 200);
  assert.equal(discover.body.needsApiKey, true);
  assert.deepEqual(discover.body.items, []);
});

test('x discovery maps posts and saves selected post to brain', async () => {
  const email = `x.discover.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);
  const authHeader = { Authorization: `Bearer ${signup.body.token}` };

  const previousToken = process.env.X_BEARER_TOKEN;
  const previousFetch = global.fetch;
  process.env.X_BEARER_TOKEN = 'test-token';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [{
        id: '123',
        author_id: 'u1',
        text: 'AI product launch with a useful demo https://t.co/demo',
        created_at: '2026-05-08T12:00:00.000Z',
        entities: { urls: [{ url: 'https://t.co/demo', expanded_url: 'https://example.com/demo', display_url: 'example.com/demo' }] },
      }],
      includes: { users: [{ id: 'u1', username: 'nomi_test', name: 'Nomi Test' }] },
    }),
  });

  const discover = await request(app)
    .get('/api/x/discover?topics=ai_tech&limit=5')
    .set(authHeader);
  assert.equal(discover.status, 200);
  assert.equal(discover.body.needsApiKey, false);
  assert.equal(discover.body.items.length, 1);
  assert.equal(discover.body.items[0].id, 'x_123');
  assert.equal(discover.body.items[0].authorUsername, 'nomi_test');

  const ingest = await request(app)
    .post('/api/feed/x_123/ingest')
    .set(authHeader);
  assert.equal(ingest.status, 200);
  assert.equal(ingest.body.success, true);

  const memories = await request(app)
    .get('/api/memories?type=tweet')
    .set(authHeader);
  assert.equal(memories.status, 200);
  assert.equal(memories.body.memories.length, 1);
  assert.equal(memories.body.memories[0].authorUsername, 'nomi_test');
  assert.match(memories.body.memories[0].body, /AI product launch/);

  if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = previousToken;
  global.fetch = previousFetch;
});
