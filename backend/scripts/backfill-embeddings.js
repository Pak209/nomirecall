#!/usr/bin/env node
const dotenv = require('dotenv');
const admin = require('firebase-admin');

const { backfillEmbeddingsForUser } = require('../src/ai/memoryChunks');
const { initializeFirebaseAdmin } = require('../src/store');

dotenv.config();

function initFirebase() {
  if (admin.apps.length) return;
  const app = initializeFirebaseAdmin();
  if (!app) {
    throw new Error('Firebase Admin env is required for backfill. Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID.');
  }
}

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function userIds() {
  const explicit = arg('userId');
  if (explicit) return [explicit];
  const snapshot = await admin.firestore().collection('users').limit(Number(arg('userLimit', 100))).get();
  return snapshot.docs.map((doc) => doc.id);
}

async function main() {
  initFirebase();
  const limit = Number(arg('limit', 25));
  const ids = await userIds();
  for (const userId of ids) {
    const result = await backfillEmbeddingsForUser(userId, { limit });
    console.log(JSON.stringify({ userId, ...result }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
