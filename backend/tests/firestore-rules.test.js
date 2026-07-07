const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// This test exercises the ROOT firestore.rules against the Firestore emulator.
// It only runs when the emulator is available (FIRESTORE_EMULATOR_HOST set,
// e.g. via `npm run test:rules`). Under a plain `node --test tests/*.js` run
// with no emulator, it skips cleanly so the default suite stays green.

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = 'nomi-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');

test('firestore.rules enforce per-user isolation', async (t) => {
  if (!EMULATOR_HOST) {
    t.skip('FIRESTORE_EMULATOR_HOST not set — run via `npm run test:rules`');
    return;
  }

  const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
  } = require('@firebase/rules-unit-testing');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST.split(':')[0],
      port: Number(EMULATOR_HOST.split(':')[1]),
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
    },
  });

  try {
    // Seed a memory for user A using an admin (rules-bypassing) context.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/userA/memories/mem1')
        .set({ userId: 'userA', text: 'A private memory' });
    });

    const aliceDb = testEnv.authenticatedContext('userA').firestore();
    const bobDb = testEnv.authenticatedContext('userB').firestore();

    // (a) User B cannot read user A's memory document.
    await assertFails(bobDb.doc('users/userA/memories/mem1').get());

    // Sanity: owner CAN read their own memory.
    await assertSucceeds(aliceDb.doc('users/userA/memories/mem1').get());

    // (b) User A cannot create a memory under their own path with a
    // mismatched userId field — the rules require request.resource.data.userId == userId.
    await assertFails(
      aliceDb.doc('users/userA/memories/mem2').set({ userId: 'userB', text: 'spoofed' })
    );

    // Sanity: a matching userId create succeeds.
    await assertSucceeds(
      aliceDb.doc('users/userA/memories/mem3').set({ userId: 'userA', text: 'ok' })
    );
  } finally {
    await testEnv.cleanup();
  }
});
