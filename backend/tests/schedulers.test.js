const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '';
process.env.NODE_ENV = 'test';

const {
  runScheduledDailyBriefGeneration,
  runScheduledXBookmarkSync,
} = require('../src/server');

test('scheduled X bookmark sync skips users without X token data', async () => {
  const result = await runScheduledXBookmarkSync({
    force: true,
    candidates: [{
      userId: 'no-token-user',
      connection: { xUserId: 'x-1' },
      syncState: { enabled: true },
    }],
    syncUser: async () => {
      throw new Error('should not sync users without token data');
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.processedUsers, 0);
  assert.equal(result.skippedUsers, 1);
  assert.equal(result.failedUsers, 0);
});

test('scheduled X bookmark sync handles one failed user without stopping all users', async () => {
  const result = await runScheduledXBookmarkSync({
    force: true,
    candidates: [
      {
        userId: 'good-user',
        connection: { xUserId: 'x-good', encryptedRefreshToken: 'encrypted' },
        syncState: { enabled: true },
      },
      {
        userId: 'bad-user',
        connection: { xUserId: 'x-bad', encryptedRefreshToken: 'encrypted' },
        syncState: { enabled: true },
      },
    ],
    syncUser: async (userId) => {
      if (userId === 'bad-user') throw new Error('token refresh failed');
      return {
        status: 'success',
        importedCount: 2,
        duplicateCount: 0,
        failedCount: 0,
      };
    },
  });

  assert.equal(result.status, 'partial_success');
  assert.equal(result.processedUsers, 2);
  assert.equal(result.failedUsers, 1);
  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[1].status, 'failed');
});

test('scheduled Daily Brief generation is disabled unless forced or enabled by env', async () => {
  const previous = process.env.NOMI_DAILY_BRIEF_SCHEDULER_ENABLED;
  process.env.NOMI_DAILY_BRIEF_SCHEDULER_ENABLED = 'false';

  const result = await runScheduledDailyBriefGeneration({
    users: [{ id: 'brief-user' }],
    generateBrief: async () => {
      throw new Error('should not generate while disabled');
    },
  });

  assert.equal(result.status, 'disabled');
  assert.equal(result.processedUsers, 0);

  if (previous === undefined) delete process.env.NOMI_DAILY_BRIEF_SCHEDULER_ENABLED;
  else process.env.NOMI_DAILY_BRIEF_SCHEDULER_ENABLED = previous;
});

test('scheduled Daily Brief generation reuses generated brief shape from generator', async () => {
  const result = await runScheduledDailyBriefGeneration({
    force: true,
    dateKey: '2026-05-18',
    users: [{ id: 'brief-user' }],
    generateBrief: async () => ({
      status: 'generated',
      savedCount: 3,
      usedAi: true,
    }),
  });

  assert.equal(result.status, 'success');
  assert.equal(result.processedUsers, 1);
  assert.equal(result.results[0].status, 'generated');
  assert.equal(result.results[0].memoryCount, 3);
  assert.equal(result.results[0].usedAi, true);
});
