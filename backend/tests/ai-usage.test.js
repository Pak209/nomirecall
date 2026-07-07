const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';

const {
  canProcessAIMemory,
  getDailyAiLimitForTier,
  getAIProcessingLimitForUser,
  getUserAIUsageTier,
  recordAIProcessingUsage,
  resetInMemoryAIUsage,
} = require('../src/ai/aiUsage');
const { batchStatus } = require('../src/ai/processMemory');

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function storeFor(user) {
  return {
    getUserById: async () => user,
  };
}

test('AI usage tier is derived flexibly from user fields', () => {
  assert.equal(getUserAIUsageTier({}), 'free');
  assert.equal(getUserAIUsageTier({ isEarlyAccess: true }), 'early_access');
  assert.equal(getUserAIUsageTier({ earlyAccessEnabled: true }), 'early_access');
  assert.equal(getUserAIUsageTier({ aiTier: 'early_access' }), 'early_access');
  assert.equal(getUserAIUsageTier({ tier: 'early_access' }), 'early_access');
  assert.equal(getUserAIUsageTier({ entitlements: ['early_access'] }), 'early_access');
  assert.equal(getUserAIUsageTier({ subscriptionStatus: 'early_access' }), 'early_access');
  assert.equal(getUserAIUsageTier({ isAdmin: true }), 'admin');
  assert.equal(getUserAIUsageTier({ aiTier: 'admin' }), 'admin');
  assert.equal(getUserAIUsageTier({ aiTier: 'dev' }), 'admin');
  assert.equal(getUserAIUsageTier({ role: 'admin' }), 'admin');
  assert.equal(getUserAIUsageTier({ tier: 'admin' }), 'admin');
});

test('BASELINE BUG: brain/pro tiers currently fall through to the free tier and free daily limit', () => {
  // BASELINE BUG TEST: brain/pro tiers currently fall through to the free limit.
  // Phase 2 Task 2.1 will UPDATE (not duplicate) this test to assert the fixed mapping.
  assert.equal(getUserAIUsageTier({ tier: 'brain' }), 'free');
  assert.equal(getUserAIUsageTier({ tier: 'pro' }), 'free');

  const previous = {
    NOMI_AI_DAILY_LIMIT_FREE: process.env.NOMI_AI_DAILY_LIMIT_FREE,
  };
  delete process.env.NOMI_AI_DAILY_LIMIT_FREE;

  const freeLimit = getDailyAiLimitForTier('free');
  assert.equal(getDailyAiLimitForTier(getUserAIUsageTier({ tier: 'brain' })), freeLimit);
  assert.equal(getDailyAiLimitForTier(getUserAIUsageTier({ tier: 'pro' })), freeLimit);

  restoreEnv(previous);
});

test('AI daily limits use production env names with older aliases as fallback', () => {
  const previous = {
    NOMI_AI_DAILY_LIMIT_FREE: process.env.NOMI_AI_DAILY_LIMIT_FREE,
    NOMI_AI_DAILY_LIMIT_EARLY_ACCESS: process.env.NOMI_AI_DAILY_LIMIT_EARLY_ACCESS,
    NOMI_AI_DAILY_LIMIT_ADMIN: process.env.NOMI_AI_DAILY_LIMIT_ADMIN,
  };
  process.env.NOMI_AI_DAILY_LIMIT_FREE = '11';
  process.env.NOMI_AI_DAILY_LIMIT_EARLY_ACCESS = '51';
  process.env.NOMI_AI_DAILY_LIMIT_ADMIN = '151';

  assert.equal(getDailyAiLimitForTier('free'), 11);
  assert.equal(getDailyAiLimitForTier('early_access'), 51);
  assert.equal(getDailyAiLimitForTier('admin'), 151);

  restoreEnv(previous);
});

test('free users default to 10 successful AI processed memories per UTC day', async () => {
  resetInMemoryAIUsage();
  const previous = {
    NOMI_AI_FREE_DAILY_LIMIT: process.env.NOMI_AI_FREE_DAILY_LIMIT,
    NOMI_AI_DISABLE_LIMITS: process.env.NOMI_AI_DISABLE_LIMITS,
  };
  delete process.env.NOMI_AI_FREE_DAILY_LIMIT;
  delete process.env.NOMI_AI_DISABLE_LIMITS;

  const userId = `free-${Date.now()}`;
  const options = { store: storeFor({ id: userId, tier: 'free' }) };
  let limit = await getAIProcessingLimitForUser(userId, options);
  assert.equal(limit.tier, 'free');
  assert.equal(limit.limit, 10);
  assert.equal(limit.remaining, 10);

  await recordAIProcessingUsage(userId, { processedCount: 10 }, options);
  limit = await getAIProcessingLimitForUser(userId, options);
  assert.equal(limit.used, 10);
  assert.equal(limit.remaining, 0);

  const allowed = await canProcessAIMemory(userId, 1, options);
  assert.equal(allowed.allowed, false);
  assert.equal(allowed.reason, 'AI_DAILY_LIMIT_REACHED');

  restoreEnv(previous);
});

test('early access and admin users use their configured daily AI limits', async () => {
  resetInMemoryAIUsage();
  const previous = {
    NOMI_AI_EARLY_ACCESS_DAILY_LIMIT: process.env.NOMI_AI_EARLY_ACCESS_DAILY_LIMIT,
    NOMI_AI_ADMIN_DAILY_LIMIT: process.env.NOMI_AI_ADMIN_DAILY_LIMIT,
  };
  delete process.env.NOMI_AI_EARLY_ACCESS_DAILY_LIMIT;
  delete process.env.NOMI_AI_ADMIN_DAILY_LIMIT;

  const early = await getAIProcessingLimitForUser('early-user', {
    store: storeFor({ id: 'early-user', tier: 'early_access' }),
  });
  assert.equal(early.tier, 'early_access');
  assert.equal(early.limit, 50);
  assert.equal(early.remaining, 50);

  const admin = await getAIProcessingLimitForUser('admin-user', {
    store: storeFor({ id: 'admin-user', role: 'admin' }),
  });
  assert.equal(admin.tier, 'admin');
  assert.equal(admin.limit, 150);
  assert.equal(admin.remaining, 150);

  restoreEnv(previous);
});

test('daily brief and project summary counts consume the same backend AI quota', async () => {
  resetInMemoryAIUsage();
  const userId = `mixed-${Date.now()}`;
  const options = { store: storeFor({ id: userId, aiTier: 'free' }) };

  await recordAIProcessingUsage(userId, {
    processedCount: 8,
    briefGeneratedCount: 1,
    projectSummaryCount: 1,
  }, options);

  const limit = await getAIProcessingLimitForUser(userId, options);
  assert.equal(limit.used, 10);
  assert.equal(limit.remaining, 0);

  const allowed = await canProcessAIMemory(userId, 1, options);
  assert.equal(allowed.allowed, false);
  assert.equal(allowed.reason, 'AI_DAILY_LIMIT_REACHED');
});

test('batch process status reports partial_success when quota is reached mid-batch', () => {
  assert.equal(batchStatus({
    processedCount: 10,
    skippedCount: 0,
    failedCount: 0,
    limitReached: true,
  }), 'partial_success');
  assert.equal(batchStatus({
    processedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    limitReached: true,
  }), 'limit_reached');
});

test('skipped and failed AI processing attempts do not consume successful daily usage', async () => {
  resetInMemoryAIUsage();
  const userId = `counts-${Date.now()}`;
  const options = { store: storeFor({ id: userId, tier: 'free' }) };

  await recordAIProcessingUsage(userId, {
    processedCount: 3,
    skippedCount: 4,
    failedCount: 5,
  }, options);

  const limit = await getAIProcessingLimitForUser(userId, options);
  assert.equal(limit.used, 3);
  assert.equal(limit.remaining, 7);
});

test('daily AI limits can be disabled backend-side while usage is still recorded', async () => {
  resetInMemoryAIUsage();
  const previous = {
    NOMI_AI_DISABLE_LIMITS: process.env.NOMI_AI_DISABLE_LIMITS,
  };
  process.env.NOMI_AI_DISABLE_LIMITS = 'true';

  const userId = `disabled-${Date.now()}`;
  const options = { store: storeFor({ id: userId, tier: 'free' }) };
  await recordAIProcessingUsage(userId, { processedCount: 25 }, options);

  const limit = await getAIProcessingLimitForUser(userId, options);
  assert.equal(limit.used, 25);
  assert.equal(limit.remaining, 0);

  const allowed = await canProcessAIMemory(userId, 1, options);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.limitsDisabled, true);

  restoreEnv(previous);
});
