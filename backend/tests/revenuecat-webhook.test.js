const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const WEBHOOK_SECRET = 'test-revenuecat-webhook-secret';
process.env.REVENUECAT_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { app } = require('../src/server');

async function createUser() {
  const email = `rc.webhook.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'password123';
  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password });
  assert.equal(signup.status, 201);
  return {
    email,
    password,
    token: signup.body.token,
    userId: signup.body.user.id,
  };
}

async function tierFor(token) {
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  return me.body.user.tier;
}

test('valid webhook: INITIAL_PURCHASE of brain_pro_monthly upgrades user to pro', async () => {
  const user = await createUser();
  assert.equal(await tierFor(user.token), 'free');

  const res = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_initial_purchase_1',
        type: 'INITIAL_PURCHASE',
        app_user_id: user.userId,
        product_id: 'brain_pro_monthly',
        entitlement_ids: ['brain'],
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.updated, true);
  assert.equal(res.body.tier, 'pro');

  assert.equal(await tierFor(user.token), 'pro');
});

test('invalid/missing Authorization header returns 401 and does not mutate state', async () => {
  const user = await createUser();

  // First give the user a paid tier so we can detect any unwanted mutation.
  const upgrade = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_setup_brain',
        type: 'INITIAL_PURCHASE',
        app_user_id: user.userId,
        product_id: 'brain_monthly',
      },
    });
  assert.equal(upgrade.status, 200);
  assert.equal(await tierFor(user.token), 'brain');

  // Missing Authorization header.
  const missing = await request(app)
    .post('/api/webhooks/revenuecat')
    .send({
      event: {
        id: 'evt_no_auth',
        type: 'CANCELLATION',
        app_user_id: user.userId,
        product_id: 'brain_monthly',
      },
    });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error, 'Invalid webhook signature');

  // Wrong Authorization header.
  const wrong = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', 'wrong-secret')
    .send({
      event: {
        id: 'evt_bad_auth',
        type: 'CANCELLATION',
        app_user_id: user.userId,
        product_id: 'brain_monthly',
      },
    });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'Invalid webhook signature');

  // Tier is unchanged despite the two rejected downgrade attempts.
  assert.equal(await tierFor(user.token), 'brain');
});

test('CANCELLATION downgrades a paid user to free', async () => {
  const user = await createUser();

  const purchase = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_purchase_pro',
        type: 'INITIAL_PURCHASE',
        app_user_id: user.userId,
        product_id: 'brain_pro_monthly',
      },
    });
  assert.equal(purchase.status, 200);
  assert.equal(await tierFor(user.token), 'pro');

  const cancel = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_cancel',
        type: 'CANCELLATION',
        app_user_id: user.userId,
        product_id: 'brain_pro_monthly',
      },
    });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.ok, true);
  assert.equal(cancel.body.updated, true);
  assert.equal(cancel.body.tier, 'free');

  assert.equal(await tierFor(user.token), 'free');
});

test('TEST event is acknowledged without a state change', async () => {
  const user = await createUser();

  const res = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_test',
        type: 'TEST',
        app_user_id: user.userId,
      },
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.ignored, true);
  assert.equal(await tierFor(user.token), 'free');
});

test('unknown app_user_id still returns 200 (so RevenueCat stops retrying)', async () => {
  const res = await request(app)
    .post('/api/webhooks/revenuecat')
    .set('Authorization', WEBHOOK_SECRET)
    .send({
      event: {
        id: 'evt_unknown_user',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'no-such-user-id',
        product_id: 'brain_monthly',
      },
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.updated, false);
});

test('webhook returns 503 when REVENUECAT_WEBHOOK_SECRET is unset', async () => {
  const user = await createUser();
  const saved = process.env.REVENUECAT_WEBHOOK_SECRET;
  delete process.env.REVENUECAT_WEBHOOK_SECRET;
  try {
    const res = await request(app)
      .post('/api/webhooks/revenuecat')
      .set('Authorization', saved)
      .send({
        event: {
          id: 'evt_unconfigured',
          type: 'INITIAL_PURCHASE',
          app_user_id: user.userId,
          product_id: 'brain_pro_monthly',
        },
      });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'RevenueCat webhook not configured');
  } finally {
    process.env.REVENUECAT_WEBHOOK_SECRET = saved;
  }

  // Restoring the secret, the user remains untouched (still free).
  assert.equal(await tierFor(user.token), 'free');
});
