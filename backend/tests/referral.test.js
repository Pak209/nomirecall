const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-not-for-production';

const { app, _store: store } = require('../src/server');
const { getUserAIUsageTier } = require('../src/ai/aiUsage');

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

let userSeq = 0;
async function createUser(hint) {
  userSeq += 1;
  const email = `referral.${hint || 'user'}.${Date.now()}.${userSeq}@example.com`;
  const signup = await request(app)
    .post('/api/auth/email/signup')
    .send({ email, password: 'password123' });
  assert.equal(signup.status, 201, `signup for ${email} failed`);
  const auth = { Authorization: `Bearer ${signup.body.token}` };
  return { id: signup.body.user.id, email, auth, token: signup.body.token };
}

function referralMe(user) {
  return request(app).get('/api/referral/me').set(user.auth);
}

function redeem(user, code) {
  return request(app).post('/api/referral/redeem').set(user.auth).send({ code });
}

function daysFromNow(iso) {
  return (Date.parse(iso) - Date.now()) / DAY_MS;
}

test('referral code generation is stable per user and unique across users', async () => {
  const alice = await createUser('alicegen');
  const bob = await createUser('bobgen');

  const first = await referralMe(alice);
  assert.equal(first.status, 200);
  assert.match(first.body.code, CODE_RE, 'code uses the unambiguous 8-char alphabet');
  assert.equal(first.body.redeemed, false);
  assert.equal(first.body.grantedDays, 0);
  assert.equal(first.body.proTrialUntil, null);

  // Stable: a second call returns the SAME persisted code, not a new one.
  const second = await referralMe(alice);
  assert.equal(second.status, 200);
  assert.equal(second.body.code, first.body.code, 'code must be stable across calls');

  // Unique: a different user gets a different code.
  const bobMe = await referralMe(bob);
  assert.equal(bobMe.status, 200);
  assert.match(bobMe.body.code, CODE_RE);
  assert.notEqual(bobMe.body.code, first.body.code, 'codes must be unique across users');
});

test('redeem happy path grants BOTH sides a 7-day Pro trial and lifts the free AI tier', async () => {
  const referrer = await createUser('referrerhappy');
  const redeemer = await createUser('redeemerhappy');

  const referrerMe = await referralMe(referrer);
  assert.equal(referrerMe.status, 200);
  const code = referrerMe.body.code;

  const res = await redeem(redeemer, code);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.referrerRewarded, true);
  assert.ok(daysFromNow(res.body.proTrialUntil) > 6.9 && daysFromNow(res.body.proTrialUntil) <= 7.01,
    'redeemer trial is ~7 days out');

  // Redeemer side: /api/referral/me reflects the trial + redeemed flag.
  const redeemerMe = await referralMe(redeemer);
  assert.equal(redeemerMe.status, 200);
  assert.equal(redeemerMe.body.redeemed, true);
  assert.ok(daysFromNow(redeemerMe.body.proTrialUntil) > 6.9);

  // Referrer side: /api/referral/me shows +7 granted days and its own trial.
  const referrerMeAfter = await referralMe(referrer);
  assert.equal(referrerMeAfter.status, 200);
  assert.equal(referrerMeAfter.body.grantedDays, 7);
  assert.ok(daysFromNow(referrerMeAfter.body.proTrialUntil) > 6.9);

  // Both sides expose proTrialUntil on /api/auth/me.
  const redeemerAuth = await request(app).get('/api/auth/me').set(redeemer.auth);
  assert.equal(redeemerAuth.status, 200);
  assert.ok(daysFromNow(redeemerAuth.body.user.proTrialUntil) > 6.9);
  assert.equal(redeemerAuth.body.user.tier, 'free', 'trial never mutates the paid-tier field');
  const referrerAuth = await request(app).get('/api/auth/me').set(referrer.auth);
  assert.equal(referrerAuth.status, 200);
  assert.ok(daysFromNow(referrerAuth.body.user.proTrialUntil) > 6.9);

  // Real tier surface: a free user with an active trial is served the 'pro' AI tier.
  const usage = await request(app).get('/api/ai/usage').set(redeemer.auth);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.tier, 'pro', 'active trial lifts a free user to the pro AI tier');
});

test('getUserAIUsageTier: future trial lifts free -> pro, expired trial stays free', async () => {
  const future = new Date(Date.now() + 3 * DAY_MS).toISOString();
  const past = new Date(Date.now() - DAY_MS).toISOString();

  assert.equal(getUserAIUsageTier({ tier: 'free', proTrialUntil: future }), 'pro');
  assert.equal(getUserAIUsageTier({ proTrialUntil: future }), 'pro');
  assert.equal(getUserAIUsageTier({ tier: 'free', proTrialUntil: past }), 'free', 'expired trial -> free');
  assert.equal(getUserAIUsageTier({ tier: 'free' }), 'free');
  // Accepts a Date instance as well as an ISO string.
  assert.equal(getUserAIUsageTier({ proTrialUntil: new Date(Date.now() + DAY_MS) }), 'pro');
});

test('paid tiers keep precedence over an active trial', async () => {
  const future = new Date(Date.now() + 30 * DAY_MS).toISOString();
  // A paid 'brain' user with an active trial stays 'brain' — the trial only ever
  // lifts free users; it never downgrades or overrides a paid tier.
  assert.equal(getUserAIUsageTier({ tier: 'brain', proTrialUntil: future }), 'brain');
  assert.equal(getUserAIUsageTier({ tier: 'pro', proTrialUntil: future }), 'pro');
  assert.equal(getUserAIUsageTier({ tier: 'admin', proTrialUntil: future }), 'admin');
});

test('redeem rejects self-redemption with 400', async () => {
  const user = await createUser('selfredeem');
  const me = await referralMe(user);
  assert.equal(me.status, 200);

  const res = await redeem(user, me.body.code);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /your own referral code/i);
});

test('redeem rejects a second redemption with 409', async () => {
  const referrerA = await createUser('doubleA');
  const referrerB = await createUser('doubleB');
  const redeemer = await createUser('doubleredeemer');

  const codeA = (await referralMe(referrerA)).body.code;
  const codeB = (await referralMe(referrerB)).body.code;

  const first = await redeem(redeemer, codeA);
  assert.equal(first.status, 200);

  const second = await redeem(redeemer, codeB);
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already redeemed/i);
});

test('redeem rejects an unknown code with 404', async () => {
  const redeemer = await createUser('unknowncode');
  const res = await redeem(redeemer, 'ZZZZZZZZ');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /does not exist/i);
});

test('redeem rejects an account older than the redemption window with 403', async () => {
  const referrer = await createUser('windowreferrer');
  const redeemer = await createUser('windowredeemer');
  const code = (await referralMe(referrer)).body.code;

  // Age the redeemer past the 7-day window by patching createdAt via the store.
  const oldCreatedAt = new Date(Date.now() - 8 * DAY_MS).toISOString();
  await store.updateUserById(redeemer.id, { createdAt: oldCreatedAt });

  const res = await redeem(redeemer, code);
  assert.equal(res.status, 403);
  assert.match(res.body.error, /referral window has closed/i);
});

test('referrer 90-day cap blocks only the referrer bonus; redeemer still gets days', async () => {
  const referrer = await createUser('cappedreferrer');
  const redeemer = await createUser('cappedredeemer');
  const code = (await referralMe(referrer)).body.code;

  // Max out the referrer's running total via the store.
  await store.updateUserById(referrer.id, { referralGrantedDays: 90 });
  const before = await referralMe(referrer);
  assert.equal(before.body.grantedDays, 90);
  assert.equal(before.body.proTrialUntil, null, 'referrer has no trial before redemption');

  const res = await redeem(redeemer, code);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.referrerRewarded, false, 'capped referrer earns no bonus');
  assert.ok(daysFromNow(res.body.proTrialUntil) > 6.9, 'redeemer still gets their 7 days');

  // Referrer is untouched: no trial granted, running total unchanged.
  const after = await referralMe(referrer);
  assert.equal(after.body.grantedDays, 90, 'capped referrer total is unchanged');
  assert.equal(after.body.proTrialUntil, null, 'capped referrer trial is unchanged');
});
