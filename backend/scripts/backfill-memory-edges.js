#!/usr/bin/env node
const dotenv = require('dotenv');
const admin = require('firebase-admin');

const { backfillMemoryEdgesForUser } = require('../src/ai/memoryEdges');
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
  const ids = await userIds();
  for (const userId of ids) {
    const result = await backfillMemoryEdgesForUser(userId, { maxEdges: Number(arg('maxEdges', 300)) });
    console.log(JSON.stringify({ userId, status: result.status, edgeCount: result.edgeCount }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
