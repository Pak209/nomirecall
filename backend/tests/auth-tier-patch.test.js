const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const WEBHOOK_SECRET = 'test-revenuecat-webhook-secret-tier-patch';
process.env.REVENUECAT_WEBHOOK_SECRET ||= WEBHOOK_SECRET;

const { app } = require('../src/server');

async function createUser() {
  const email = `tier.patch.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password: 'password123' });
  assert.equal(signup.status, 201);
  return {
    authHeader: { Authorization: `Bearer ${signup.body.token}` },
    userId: signup.body.user.id,
  };
}

async function tierFor(authHeader) {
  const me = await request(app).get('/api/auth/me').set(authHeader);
  assert.equal(me.status, 200);
  return me.body.user.tier;
}

async function webhookUpgrade(userId, tier) {
  const res = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', process.env.REVENUECAT_WEBHOOK_SECRET)
    .send({
      event: {
        id: `evt_tier_patch_${tier}_${Date.now()}`,
        type: 'INITIAL_PURCHASE',
        app_user_id: userId,
        entitlement_ids: [tier],
        product_id: `${tier}_monthly`,
      },
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.tier, tier);
}

// REGRESSION GUARD (audit launch blocker: "tier can't be client-asserted"):
// an authenticated user must never be able to elevate their own tier through
// PATCH /api/auth/tier. Paid tiers are applied exclusively by the RevenueCat
// webhook.
test('clients cannot self-upgrade to brain, pro, or admin via PATCH /api/auth/tier', async () => {
  const user = await createUser();
  assert.equal(await tierFor(user.authHeader), 'free');

  for (const tier of ['brain', 'pro', 'admin']) {
    const res = await request(app)
      .patch('/api/auth/tier')
      .set(user.authHeader)
      .send({ tier });
    assert.equal(res.status, 403, `self-upgrade to ${tier} must be rejected`);
    assert.match(res.body.error, /managed by the subscription provider/);
    assert.equal(await tierFor(user.authHeader), 'free', `tier must stay free after attempted ${tier} self-upgrade`);
  }
});

test('clients can still self-downgrade to free (e.g. restore found no subscription)', async () => {
  const user = await createUser();
  await webhookUpgrade(user.userId, 'pro');
  assert.equal(await tierFor(user.authHeader), 'pro');

  const res = await request(app)
    .patch('/api/auth/tier')
    .set(user.authHeader)
    .send({ tier: 'free' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(await tierFor(user.authHeader), 'free');
});

test('the webhook remains the working upgrade path after a self-downgrade', async () => {
  const user = await createUser();

  // Round-trip: webhook up → client down → webhook up again. Proves the
  // restriction only removed client-side elevation, not the real flow.
  await webhookUpgrade(user.userId, 'brain');
  assert.equal(await tierFor(user.authHeader), 'brain');

  const down = await request(app)
    .patch('/api/auth/tier')
    .set(user.authHeader)
    .send({ tier: 'free' });
  assert.equal(down.status, 200);
  assert.equal(await tierFor(user.authHeader), 'free');

  await webhookUpgrade(user.userId, 'pro');
  assert.equal(await tierFor(user.authHeader), 'pro');
});
