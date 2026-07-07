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
    this.xBookmarkSyncStates = new Map();
    this.chunksByUser = new Map();
    this.memoryEdgesByUser = new Map();
    this.topicPagesByUser = new Map();
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

  async listUsers(options = {}) {
    return Array.from(this.usersByEmail.values()).slice(0, Number(options.limit || 500));
  }

  async updateUserById(userId, patch) {
    for (const [email, user] of this.usersByEmail.entries()) {
      if (user.id === userId) {
        const updated = { ...user, ...patch, updatedAt: new Date().toISOString() };
        this.usersByEmail.set(email, updated);
        return updated;
      }
    }
    return null;
  }

  async upsertUser(user) {
    this.usersByEmail.set(user.email, user);
    return user;
  }

  async applyRevenueCatTier(userId, { tier, eventId, eventType } = {}) {
    for (const [email, user] of this.usersByEmail.entries()) {
      if (user.id === userId) {
        const updated = {
          ...user,
          tier,
          lastRevenueCatEventId: eventId || null,
          lastRevenueCatEventType: eventType || null,
          updatedAt: new Date().toISOString(),
        };
        this.usersByEmail.set(email, updated);
        return { updated: true, tier };
      }
    }
    return { updated: false, reason: 'user_not_found' };
  }

  async deleteUserData(userId) {
    for (const [email, user] of this.usersByEmail.entries()) {
      if (user.id === userId) {
        this.usersByEmail.delete(email);
      }
    }
    this.sourcesByUser.delete(userId);
    this.chunksByUser.delete(userId);
    this.memoryEdgesByUser.delete(userId);
    this.topicPagesByUser.delete(userId);
    this.xBookmarkConnections.delete(userId);
    this.xBookmarkSyncStates.delete(userId);
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

  async upsertChunks(userId, memoryId, chunks) {
    const byMemory = this.chunksByUser.get(userId) || new Map();
    byMemory.set(String(memoryId), chunks.map((chunk) => ({ ...chunk, memoryId: String(memoryId) })));
    this.chunksByUser.set(userId, byMemory);
    return chunks;
  }

  async listChunks(userId, options = {}) {
    const byMemory = this.chunksByUser.get(userId) || new Map();
    if (options.memoryId) return byMemory.get(String(options.memoryId)) || [];
    return Array.from(byMemory.values()).flat();
  }

  async deleteChunks(userId, memoryId) {
    const byMemory = this.chunksByUser.get(userId) || new Map();
    const deletedCount = (byMemory.get(String(memoryId)) || []).length;
    byMemory.delete(String(memoryId));
    this.chunksByUser.set(userId, byMemory);
    return { deletedCount };
  }

  async upsertMemoryEdges(userId, edges) {
    const byId = this.memoryEdgesByUser.get(userId) || new Map();
    for (const edge of edges) byId.set(edge.edgeId || edge.id, edge);
    this.memoryEdgesByUser.set(userId, byId);
    return edges;
  }

  async listMemoryEdges(userId, memoryId) {
    const edges = Array.from((this.memoryEdgesByUser.get(userId) || new Map()).values());
    if (!memoryId) return edges;
    return edges
      .filter((edge) => edge.fromMemoryId === memoryId || edge.toMemoryId === memoryId)
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  async upsertTopicPages(userId, pages) {
    const byId = this.topicPagesByUser.get(userId) || new Map();
    for (const page of pages) byId.set(page.topicPageId || page.id, page);
    this.topicPagesByUser.set(userId, byId);
    return pages;
  }

  async listTopicPages(userId) {
    return Array.from((this.topicPagesByUser.get(userId) || new Map()).values());
  }

  async getTopicPage(userId, topicPageId) {
    return (this.topicPagesByUser.get(userId) || new Map()).get(String(topicPageId)) || null;
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

  async getXBookmarkSyncState(userId) {
    return this.xBookmarkSyncStates.get(userId) || null;
  }

  async updateXBookmarkSyncState(userId, patch) {
    const current = this.xBookmarkSyncStates.get(userId) || defaultXBookmarkSyncState();
    const next = { ...current, ...patch, userId, updatedAt: new Date().toISOString() };
    this.xBookmarkSyncStates.set(userId, next);
    return next;
  }

  async listXBookmarkSyncCandidates(options = {}) {
    const limit = Number(options.limit || 500);
    return Array.from(this.xBookmarkConnections.entries()).slice(0, limit).map(([userId, connection]) => ({
      userId,
      connection,
      syncState: this.xBookmarkSyncStates.get(userId) || defaultXBookmarkSyncState(),
    }));
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
    return sanitizeFirestoreValue(value);
  }

  async getUserByEmail(email) {
    const doc = await this.userCollection().doc(email).get();
    return doc.exists ? doc.data() : null;
  }

  async getUserById(userId) {
    const direct = await this.userCollection().doc(userId).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const snapshot = await this.userCollection().where('id', '==', userId).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  }

  async listUsers(options = {}) {
    const limit = Math.max(1, Math.min(1000, Number(options.limit || 500)));
    const snapshot = await this.userCollection().limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async updateUserById(userId, patch) {
    const direct = await this.userCollection().doc(userId).get();
    if (direct.exists) {
      await direct.ref.set(this.withoutUndefined({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }), { merge: true });
      const updated = await direct.ref.get();
      return { id: updated.id, ...updated.data() };
    }

    const snapshot = await this.userCollection().where('id', '==', userId).limit(1).get();
    if (snapshot.empty) return null;
    await snapshot.docs[0].ref.set(this.withoutUndefined({
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }), { merge: true });
    const updated = await snapshot.docs[0].ref.get();
    return updated.data();
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

  async applyRevenueCatTier(userId, { tier, eventId, eventType } = {}) {
    const patch = this.withoutUndefined({
      tier,
      lastRevenueCatEventId: eventId || null,
      lastRevenueCatEventType: eventType || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const direct = await this.userCollection().doc(userId).get();
    if (direct.exists) {
      await direct.ref.set(patch, { merge: true });
      return { updated: true, tier };
    }

    const snapshot = await this.userCollection().where('id', '==', userId).limit(1).get();
    if (snapshot.empty) return { updated: false, reason: 'user_not_found' };
    await snapshot.docs[0].ref.set(patch, { merge: true });
    return { updated: true, tier };
  }

  async deleteUserData(userId) {
    const directUser = await this.userCollection().doc(userId).get();
    const users = await this.userCollection().where('id', '==', userId).get();
    const firebaseUsers = await this.userCollection().where('firebaseUid', '==', userId).get();
    const sources = await this.sourceCollection().where('userId', '==', userId).get();
    const xConnection = await this.xBookmarkConnectionCollection().doc(userId).get();
    const xStates = await this.xOAuthStateCollection().where('userId', '==', userId).get();
    const xSyncState = await this.userCollection().doc(userId).collection('sync').doc('xBookmarks').get();
    const batch = this.db.batch();

    const userRefs = new Map();
    if (directUser.exists) userRefs.set(directUser.ref.path, directUser.ref);
    users.docs.forEach((doc) => userRefs.set(doc.ref.path, doc.ref));
    firebaseUsers.docs.forEach((doc) => userRefs.set(doc.ref.path, doc.ref));

    sources.docs.forEach((doc) => batch.delete(doc.ref));
    if (xConnection.exists) batch.delete(xConnection.ref);
    if (xSyncState.exists) batch.delete(xSyncState.ref);
    xStates.docs.forEach((doc) => batch.delete(doc.ref));

    if (!sources.empty || xConnection.exists || xSyncState.exists || !xStates.empty) {
      await batch.commit();
    }

    for (const ref of userRefs.values()) {
      await this.deleteDocumentTree(ref);
    }

    await this.deleteStorageFiles(userId);
  }

  async deleteDocumentTree(ref) {
    if (typeof this.db.recursiveDelete === 'function') {
      await this.db.recursiveDelete(ref);
      return;
    }
    const subcollections = await ref.listCollections();
    for (const collection of subcollections) {
      const snapshot = await collection.get();
      for (const doc of snapshot.docs) {
        await this.deleteDocumentTree(doc.ref);
      }
    }
    await ref.delete();
  }

  async deleteStorageFiles(userId) {
    if (!admin.apps.length) return;
    try {
      const bucket = admin.storage().bucket();
      await bucket.deleteFiles({
        prefix: `users/${userId}/`,
        force: true,
      });
    } catch (error) {
      if (!/bucket|storage/i.test(error.message || '')) throw error;
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

  async getXBookmarkSyncState(userId) {
    const doc = await this.userCollection()
      .doc(userId)
      .collection('sync')
      .doc('xBookmarks')
      .get();
    return doc.exists ? doc.data() : null;
  }

  async updateXBookmarkSyncState(userId, patch) {
    const ref = this.userCollection().doc(userId).collection('sync').doc('xBookmarks');
    const current = await ref.get();
    const next = this.withoutUndefined({
      ...(current.exists ? current.data() : defaultXBookmarkSyncState()),
      ...patch,
      provider: 'x',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await ref.set(next, { merge: true });
    const doc = await ref.get();
    return doc.data();
  }

  async listXBookmarkSyncCandidates(options = {}) {
    const limit = Math.max(1, Math.min(1000, Number(options.limit || 500)));
    const snapshot = await this.xBookmarkConnectionCollection().limit(limit).get();
    const candidates = [];
    for (const doc of snapshot.docs) {
      const userId = doc.id;
      const syncState = await this.getXBookmarkSyncState(userId);
      candidates.push({
        userId,
        connection: { userId, ...doc.data() },
        syncState: syncState || defaultXBookmarkSyncState(),
      });
    }
    return candidates;
  }
}

function defaultXBookmarkSyncState() {
  return {
    provider: 'x',
    enabled: false,
    lastSyncedAt: null,
    lastSuccessfulSyncAt: null,
    lastFailedSyncAt: null,
    lastErrorMessage: null,
    lastScheduledSyncAt: null,
    lastManualSyncAt: null,
    lastResult: null,
    lastError: null,
    importedCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
    nextEligibleSyncAt: null,
    totalImported: 0,
    totalFailed: 0,
    syncInProgress: false,
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(sanitizeFirestoreValue)
      .filter((entry) => entry !== undefined);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, sanitizeFirestoreValue(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value;
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
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  if (serviceAccountPath) {
    const credentials = require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: projectId || credentials.project_id,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  if (projectId) {
    return admin.initializeApp({ projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
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
  initializeFirebaseAdmin,
  newSource,
};
