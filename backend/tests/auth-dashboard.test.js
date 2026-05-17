const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';

const { app } = require('../src/server');

test('legal pages are public html routes', async () => {
  const privacy = await request(app).get('/privacy');
  assert.equal(privacy.status, 200);
  assert.match(privacy.headers['content-type'], /html/);
  assert.match(privacy.text, /Privacy Policy/);
  assert.match(privacy.text, /Firebase/);
  assert.match(privacy.text, /RevenueCat/);
  assert.match(privacy.text, /X post/);

  const terms = await request(app).get('/terms');
  assert.equal(terms.status, 200);
  assert.match(terms.headers['content-type'], /html/);
  assert.match(terms.text, /Terms of Use/);
  assert.match(terms.text, /Subscriptions and Purchases/);
});

test('health endpoint is live and reports persistence mode', async () => {
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.service, 'second-brain-backend');
  assert.match(health.body.persistence, /^(firestore|memory)$/);
});

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

test('x post preview accepts supported X URL variants without api key', async () => {
  const email = `x.preview.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);

  const authHeader = { Authorization: `Bearer ${signup.body.token}` };
  const previousToken = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;

  const urls = [
    'https://x.com/nomi/status/12345',
    'https://twitter.com/nomi/status/12345?s=20',
    'https://mobile.twitter.com/nomi/status/12345',
    'x.com/nomi/status/12345?ref=share',
  ];

  for (const url of urls) {
    const preview = await request(app)
      .post('/api/x-post/preview')
      .set(authHeader)
      .send({ url });

    assert.equal(preview.status, 200);
    assert.equal(preview.body.needsApiKey, true);
    assert.equal(preview.body.post.id, '12345');
    assert.equal(preview.body.post.url, 'https://x.com/nomi/status/12345');
  }

  const normalLink = await request(app)
    .post('/api/x-post/preview')
    .set(authHeader)
    .send({ url: 'https://example.com/read?next=https://x.com/nomi/status/12345' });

  if (previousToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = previousToken;

  assert.equal(normalLink.status, 400);
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

test('x bookmark connect reports missing oauth config', async () => {
  const email = `x.bookmarks.config.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);

  const previousClientId = process.env.X_CLIENT_ID;
  const previousRedirect = process.env.X_REDIRECT_URI;
  delete process.env.X_CLIENT_ID;
  delete process.env.X_REDIRECT_URI;

  const response = await request(app)
    .get('/api/x/bookmarks/connect')
    .set({ Authorization: `Bearer ${signup.body.token}` });

  if (previousClientId === undefined) delete process.env.X_CLIENT_ID;
  else process.env.X_CLIENT_ID = previousClientId;
  if (previousRedirect === undefined) delete process.env.X_REDIRECT_URI;
  else process.env.X_REDIRECT_URI = previousRedirect;

  assert.equal(response.status, 503);
  assert.equal(response.body.configured, false);
});

test('x bookmark oauth callback and manual sync imports new bookmarks', async () => {
  const email = `x.bookmarks.sync.${Date.now()}@example.com`;
  const password = 'password123';

  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);
  const authHeader = { Authorization: `Bearer ${signup.body.token}` };

  const previousEnv = {
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
    X_TOKEN_ENCRYPTION_KEY: process.env.X_TOKEN_ENCRYPTION_KEY,
  };
  const previousFetch = global.fetch;
  process.env.X_CLIENT_ID = 'client-id';
  delete process.env.X_CLIENT_SECRET;
  process.env.X_REDIRECT_URI = 'https://nomi.example.com/api/x/oauth/callback';
  process.env.X_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

  const connect = await request(app)
    .get('/api/x/bookmarks/connect')
    .set(authHeader);
  assert.equal(connect.status, 200);
  assert.equal(connect.body.configured, true);

  const authorizationUrl = new URL(connect.body.authorizationUrl);
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);
  assert.match(authorizationUrl.searchParams.get('scope'), /bookmark\.read/);

  let fetchCall = 0;
  global.fetch = async (url) => {
    fetchCall += 1;
    const rawUrl = String(url);
    if (rawUrl.includes('/oauth2/token') && fetchCall === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token-1',
          refresh_token: 'refresh-token-1',
          expires_in: 7200,
          scope: 'tweet.read users.read bookmark.read offline.access',
        }),
      };
    }
    if (rawUrl.includes('/2/users/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { id: 'x-user-1', username: 'nomi_user', name: 'Nomi User' },
        }),
      };
    }
    if (rawUrl.includes('/oauth2/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token-2',
          refresh_token: 'refresh-token-2',
          expires_in: 7200,
        }),
      };
    }
    if (rawUrl.includes('/2/users/x-user-1/bookmarks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            id: '987',
            author_id: 'author-1',
            text: 'OpenAI bookmark about Codex workflows https://t.co/codex',
            created_at: '2026-05-15T20:39:00.000Z',
            attachments: { media_keys: ['media-1'] },
            entities: {
              urls: [{
                url: 'https://t.co/codex',
                expanded_url: 'https://example.com/codex',
                display_url: 'example.com/codex',
              }],
            },
          }],
          includes: {
            users: [{ id: 'author-1', username: 'testingcatalog', name: 'Testing Catalog' }],
            media: [{
              media_key: 'media-1',
              type: 'photo',
              url: 'https://pbs.twimg.com/media/test.jpg',
            }],
          },
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${rawUrl}`);
  };

  const callback = await request(app)
    .get(`/api/x/oauth/callback?code=test-code&state=${state}`);
  assert.equal(callback.status, 200);
  assert.match(callback.text, /X bookmarks connected/);

  const status = await request(app)
    .get('/api/x/bookmarks/status')
    .set(authHeader);
  assert.equal(status.status, 200);
  assert.equal(status.body.connected, true);
  assert.equal(status.body.username, 'nomi_user');

  const sync = await request(app)
    .post('/api/x/bookmarks/sync')
    .set(authHeader)
    .send({ limit: 10 });
  assert.equal(sync.status, 200);
  assert.equal(sync.body.imported, 1);
  assert.equal(sync.body.skipped, 0);

  const repeatSync = await request(app)
    .post('/api/x/bookmarks/sync')
    .set(authHeader)
    .send({ limit: 10 });
  assert.equal(repeatSync.status, 200);
  assert.equal(repeatSync.body.imported, 0);
  assert.equal(repeatSync.body.skipped, 1);

  const memories = await request(app)
    .get('/api/memories?type=tweet')
    .set(authHeader);
  assert.equal(memories.status, 200);
  assert.equal(memories.body.memories.length, 1);
  assert.equal(memories.body.memories[0].authorUsername, 'testingcatalog');
  assert.match(memories.body.memories[0].body, /Codex workflows/);
  assert.deepEqual(memories.body.memories[0].media, [{
    type: 'photo',
    url: 'https://pbs.twimg.com/media/test.jpg',
  }]);

  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = previousFetch;
});
