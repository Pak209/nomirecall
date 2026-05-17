const crypto = require('crypto');

const admin = require('firebase-admin');

const DEFAULT_FEED_ITEMS = [];

class MemoryStore {
  constructor() {
    this.mode = 'memory';
    this.usersByEmail = new Map();
    this.sourcesByUser = new Map();
    this.passwordResetTokens = new Map();
    this.xOAuthStates = new Map();
    this.xBookmarkConnections = new Map();
    this.feedItems = [...DEFAULT_FEED_ITEMS];
  }

  async getUserByEmail(email) {
    return this.usersByEmail.get(email) || null;
  }

  async getUserById(userId) {
    for (const user of this.usersByEmail.values()) {
      if (user.id === userId) return user;
    }
    return null;
  }

  async upsertUser(user) {
    this.usersByEmail.set(user.email, user);
    return user;
  }

  async deleteUserData(userId) {
    for (const [email, user] of this.usersByEmail.entries()) {
      if (user.id === userId) {
        this.usersByEmail.delete(email);
      }
    }
    this.sourcesByUser.delete(userId);
    this.xBookmarkConnections.delete(userId);
  }

  async addSource(userId, source) {
    const list = this.sourcesByUser.get(userId) || [];
    list.push(source);
    this.sourcesByUser.set(userId, list);
    return source;
  }

  async listSources(userId) {
    return this.sourcesByUser.get(userId) || [];
  }

  async getSourceById(userId, sourceId) {
    const list = this.sourcesByUser.get(userId) || [];
    return list.find((source) => source.id === sourceId) || null;
  }

  async updateSource(userId, sourceId, patch) {
    const list = this.sourcesByUser.get(userId) || [];
    const index = list.findIndex((source) => source.id === sourceId);
    if (index < 0) return null;
    const updated = { ...list[index], ...patch };
    list[index] = updated;
    this.sourcesByUser.set(userId, list);
    return updated;
  }

  async deleteSource(userId, sourceId) {
    const list = this.sourcesByUser.get(userId) || [];
    const next = list.filter((source) => source.id !== sourceId);
    const removed = next.length !== list.length;
    this.sourcesByUser.set(userId, next);
    return removed;
  }

  async countSources(userId) {
    return (this.sourcesByUser.get(userId) || []).length;
  }

  async getFeedItems() {
    return [...this.feedItems];
  }

  async upsertFeedItems(items) {
    const byId = new Map(this.feedItems.map((item) => [item.id, item]));
    for (const item of items) {
      byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
    }
    this.feedItems = Array.from(byId.values());
    return items;
  }

  async markFeedInBrain(feedItemId) {
    this.feedItems = this.feedItems.map((item) => (
      item.id === feedItemId ? { ...item, in_brain: true } : item
    ));
  }

  async savePasswordResetToken(tokenHash, record) {
    this.passwordResetTokens.set(tokenHash, record);
  }

  async getPasswordResetToken(tokenHash) {
    return this.passwordResetTokens.get(tokenHash) || null;
  }

  async markPasswordResetTokenUsed(tokenHash) {
    const current = this.passwordResetTokens.get(tokenHash);
    if (!current) return;
    this.passwordResetTokens.set(tokenHash, { ...current, usedAt: new Date().toISOString() });
  }

  async saveXOAuthState(state, record) {
    this.xOAuthStates.set(state, record);
  }

  async consumeXOAuthState(state) {
    const record = this.xOAuthStates.get(state) || null;
    if (record) this.xOAuthStates.delete(state);
    return record;
  }

  async getXBookmarkConnection(userId) {
    return this.xBookmarkConnections.get(userId) || null;
  }

  async upsertXBookmarkConnection(userId, connection) {
    const current = this.xBookmarkConnections.get(userId) || {};
    const next = { ...current, ...connection, userId, updatedAt: new Date().toISOString() };
    this.xBookmarkConnections.set(userId, next);
    return next;
  }

  async deleteXBookmarkConnection(userId) {
    return this.xBookmarkConnections.delete(userId);
  }
}

class FirestoreStore {
  constructor(db) {
    this.db = db;
    this.mode = 'firestore';
    this.feedItems = [...DEFAULT_FEED_ITEMS];
  }

  userCollection() {
    return this.db.collection('users');
  }

  sourceCollection() {
    return this.db.collection('sources');
  }

  passwordResetCollection() {
    return this.db.collection('password_reset_tokens');
  }

  xOAuthStateCollection() {
    return this.db.collection('x_oauth_states');
  }

  xBookmarkConnectionCollection() {
    return this.db.collection('x_bookmark_connections');
  }

  withoutUndefined(value) {
    return Object.fromEntries(
      Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
    );
  }

  async getUserByEmail(email) {
    const doc = await this.userCollection().doc(email).get();
    return doc.exists ? doc.data() : null;
  }

  async getUserById(userId) {
    const snapshot = await this.userCollection().where('id', '==', userId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  }

  async upsertUser(user) {
    await this.userCollection().doc(user.email).set(
      {
        ...user,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return user;
  }

  async deleteUserData(userId) {
    const users = await this.userCollection().where('id', '==', userId).get();
    const sources = await this.sourceCollection().where('userId', '==', userId).get();
    const xConnection = await this.xBookmarkConnectionCollection().doc(userId).get();
    const batch = this.db.batch();

    users.docs.forEach((doc) => batch.delete(doc.ref));
    sources.docs.forEach((doc) => batch.delete(doc.ref));
    if (xConnection.exists) batch.delete(xConnection.ref);

    if (!users.empty || !sources.empty || xConnection.exists) {
      await batch.commit();
    }
  }

  async addSource(userId, source) {
    await this.sourceCollection().doc(source.id).set(this.withoutUndefined({
      ...source,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    return source;
  }

  async listSources(userId) {
    const snapshot = await this.sourceCollection()
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getSourceById(userId, sourceId) {
    const doc = await this.sourceCollection().doc(sourceId).get();
    if (!doc.exists) return null;
    const source = { id: doc.id, ...doc.data() };
    if (source.userId !== userId) return null;
    return source;
  }

  async updateSource(userId, sourceId, patch) {
    const current = await this.getSourceById(userId, sourceId);
    if (!current) return null;
    await this.sourceCollection().doc(sourceId).set(
      this.withoutUndefined({
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true },
    );
    return this.getSourceById(userId, sourceId);
  }

  async deleteSource(userId, sourceId) {
    const current = await this.getSourceById(userId, sourceId);
    if (!current) return false;
    await this.sourceCollection().doc(sourceId).delete();
    return true;
  }

  async countSources(userId) {
    const snapshot = await this.sourceCollection().where('userId', '==', userId).get();
    return snapshot.size;
  }

  async getFeedItems() {
    return [...this.feedItems];
  }

  async upsertFeedItems(items) {
    const byId = new Map(this.feedItems.map((item) => [item.id, item]));
    for (const item of items) {
      byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
    }
    this.feedItems = Array.from(byId.values());
    return items;
  }

  async markFeedInBrain(feedItemId) {
    this.feedItems = this.feedItems.map((item) => (
      item.id === feedItemId ? { ...item, in_brain: true } : item
    ));
  }

  async savePasswordResetToken(tokenHash, record) {
    await this.passwordResetCollection().doc(tokenHash).set({
      ...record,
      updatedAt: new Date().toISOString(),
    });
  }

  async getPasswordResetToken(tokenHash) {
    const doc = await this.passwordResetCollection().doc(tokenHash).get();
    return doc.exists ? doc.data() : null;
  }

  async markPasswordResetTokenUsed(tokenHash) {
    await this.passwordResetCollection().doc(tokenHash).set(
      { usedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async saveXOAuthState(state, record) {
    await this.xOAuthStateCollection().doc(state).set({
      ...record,
      updatedAt: new Date().toISOString(),
    });
  }

  async consumeXOAuthState(state) {
    const ref = this.xOAuthStateCollection().doc(state);
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.delete();
    return doc.data();
  }

  async getXBookmarkConnection(userId) {
    const doc = await this.xBookmarkConnectionCollection().doc(userId).get();
    return doc.exists ? doc.data() : null;
  }

  async upsertXBookmarkConnection(userId, connection) {
    const ref = this.xBookmarkConnectionCollection().doc(userId);
    await ref.set(this.withoutUndefined({
      ...connection,
      userId,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    const doc = await ref.get();
    return doc.data();
  }

  async deleteXBookmarkConnection(userId) {
    await this.xBookmarkConnectionCollection().doc(userId).delete();
    return true;
  }
}

function initializeFirebaseAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountJson) {
    const credentials = JSON.parse(serviceAccountJson);
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: projectId || credentials.project_id,
    });
  }

  if (serviceAccountPath) {
    const credentials = require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: projectId || credentials.project_id,
    });
  }

  if (projectId) {
    return admin.initializeApp({ projectId });
  }

  return null;
}

function createStore() {
  try {
    const app = initializeFirebaseAdmin();
    if (!app) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Firebase Admin environment variables are required in production.');
      }
      return new MemoryStore();
    }
    const db = admin.firestore();
    return new FirestoreStore(db);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    console.warn(`[store] Firebase init failed, falling back to memory: ${error.message}`);
    return new MemoryStore();
  }
}

function newSource(title, sourceType) {
  return {
    id: crypto.randomUUID(),
    title,
    source_type: sourceType,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  createStore,
  newSource,
};
