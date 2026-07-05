const crypto = require('crypto');
const admin = require('firebase-admin');

const { aiConfig } = require('./aiConfig');
const { createAIProvider } = require('./aiProvider');

const DEFAULT_CHUNK_SIZE = 1400;
const DEFAULT_CHUNK_OVERLAP = 180;
const GENERIC_CHUNK_TAGS = new Set([
  'bookmark',
  'bookmarks',
  'capture',
  'general',
  'import',
  'imported',
  'link',
  'links',
  'manual',
  'manual_note',
  'note',
  'other',
  'post',
  'social',
  'text',
  'thread',
  'tiktok',
  'tweet',
  'tweets',
  'twitter',
  'unknown',
  'url',
  'urls',
  'video',
  'x',
  'x_bookmark',
  'xpost',
  'xposts',
]);

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function omitUndefined(value) {
  if (Array.isArray(value)) return value.map(omitUndefined).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, omitUndefined(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value === undefined ? undefined : value;
}

function asArray(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function meaningfulTags(tags = []) {
  return asArray(tags).filter((tag) => !GENERIC_CHUNK_TAGS.has(normalize(tag)));
}

function hashContent(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function timestampValue() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function timestampToIso(value) {
  if (!value) return undefined;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function sourceFieldsForMemory(memory = {}) {
  const ai = memory.ai || {};
  return omitUndefined({
    title: compact(memory.title || 'Untitled memory'),
    summary: compact(ai.summary || memory.summary || ''),
    category: compact(memory.category || ai.category || 'General'),
    tags: meaningfulTags(ai.tags?.length ? ai.tags : memory.tags),
    concepts: asArray(ai.concepts?.length ? ai.concepts : memory.concepts),
    entities: asArray(ai.entities?.length ? ai.entities : memory.entities),
    sourceType: compact(memory.sourceType || memory.source_type || memory.type || 'unknown'),
    sourceUrl: memory.sourceUrl || memory.sourceURL || memory.source_url || undefined,
    sourceId: memory.sourceId || memory.externalId || undefined,
    projectIds: asArray(memory.projectIds),
  });
}

function textForChunking(memory = {}) {
  const fields = sourceFieldsForMemory(memory);
  return [
    fields.title ? `Title: ${fields.title}` : null,
    fields.summary ? `Summary: ${fields.summary}` : null,
    compact(memory.cleanText || memory.rawText || memory.content || memory.body || memory.text)
      ? `Content: ${compact(memory.cleanText || memory.rawText || memory.content || memory.body || memory.text)}`
      : null,
    fields.category ? `Category: ${fields.category}` : null,
    fields.tags.length ? `Tags: ${fields.tags.join(', ')}` : null,
    fields.concepts.length ? `Concepts: ${fields.concepts.join(', ')}` : null,
    fields.entities.length ? `Entities: ${fields.entities.join(', ')}` : null,
    fields.sourceType ? `Source type: ${fields.sourceType}` : null,
    fields.sourceUrl ? `Source URL: ${fields.sourceUrl}` : null,
    fields.projectIds.length ? `Projects: ${fields.projectIds.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

function splitText(value = '', options = {}) {
  const text = compact(value);
  if (!text) return [];
  const size = Math.max(500, Number(options.chunkSize || DEFAULT_CHUNK_SIZE));
  const overlap = Math.max(0, Math.min(size - 1, Number(options.chunkOverlap || DEFAULT_CHUNK_OVERLAP)));
  if (text.length <= size) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf('. ', end),
        text.lastIndexOf('\n', end),
        text.lastIndexOf(' ', end),
      );
      if (boundary > start + Math.floor(size * 0.55)) end = boundary + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.filter(Boolean);
}

function buildMemoryChunks(memory = {}, options = {}) {
  const memoryId = String(memory.id || memory.memoryId || '');
  const sourceFields = sourceFieldsForMemory(memory);
  const text = textForChunking(memory);
  return splitText(text, options).map((chunkText, chunkIndex) => {
    const contentHash = hashContent([
      memoryId,
      chunkIndex,
      chunkText,
      JSON.stringify(sourceFields),
    ].join('\n'));
    return {
      memoryId,
      chunkId: `${memoryId || 'memory'}-${chunkIndex}-${contentHash.slice(0, 12)}`,
      chunkIndex,
      chunkText,
      contentHash,
      sourceFields,
      createdAt: timestampToIso(memory.createdAt),
      updatedAt: timestampToIso(memory.updatedAt),
    };
  });
}

function memoryRef(userId, memoryId) {
  return admin.firestore().collection('users').doc(userId).collection('memories').doc(memoryId);
}

async function listStoredChunks(userId, memoryId) {
  if (!admin.apps.length) return [];
  const snapshot = await memoryRef(userId, memoryId).collection('chunks').get();
  return snapshot.docs.map((doc) => ({ chunkId: doc.id, ...doc.data() }));
}

async function writeChunks(userId, memoryId, chunks, options = {}) {
  if (options.store?.upsertChunks) return options.store.upsertChunks(userId, memoryId, chunks);
  if (!admin.apps.length) return chunks;
  const db = admin.firestore();
  const ref = memoryRef(userId, memoryId);
  const existing = await ref.collection('chunks').get();
  const nextIds = new Set(chunks.map((chunk) => chunk.chunkId));
  const batch = db.batch();
  for (const doc of existing.docs) {
    if (!nextIds.has(doc.id)) batch.delete(doc.ref);
  }
  for (const chunk of chunks) {
    batch.set(ref.collection('chunks').doc(chunk.chunkId), {
      ...chunk,
      updatedAt: timestampValue(),
      createdAt: chunk.createdAt || timestampValue(),
    }, { merge: true });
  }
  await batch.commit();
  return chunks;
}

async function generateEmbedding(text, options = {}) {
  if (options.embeddingProvider?.embedText) return options.embeddingProvider.embedText(text);
  if (options.aiProvider?.embedText) return options.aiProvider.embedText(text);
  const config = aiConfig();
  if (!config.openaiApiKey || config.provider !== 'openai') {
    throw new Error('Embeddings are not configured.');
  }
  return createAIProvider(config).embedText(text);
}

async function embedChunks(chunks, options = {}) {
  const config = aiConfig();
  const model = options.embeddingModel || config.embeddingModel;
  const embedded = [];
  for (const chunk of chunks) {
    try {
      const vector = await generateEmbedding(chunk.chunkText, options);
      embedded.push({
        ...chunk,
        embedding: vector,
        embeddingModel: model,
        embeddingStatus: 'complete',
        embeddedAt: timestampValue(),
        retryCount: Number(chunk.retryCount || 0),
        errorMessage: null,
      });
    } catch (error) {
      embedded.push({
        ...chunk,
        embeddingStatus: 'failed',
        embeddingModel: model,
        retryCount: Number(chunk.retryCount || 0) + 1,
        errorMessage: error.message || 'Embedding failed.',
      });
    }
  }
  return embedded;
}

async function indexMemoryForRetrieval(userId, memoryId, options = {}) {
  const memory = options.memory || await (async () => {
    if (!admin.apps.length) return null;
    const doc = await memoryRef(userId, memoryId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  })();
  if (!memory) return { status: 'failed', memoryId, error: 'Memory not found.' };

  const nextChunks = buildMemoryChunks({ id: memoryId, ...memory }, options);
  const existing = options.existingChunks || await listStoredChunks(userId, memoryId);
  const existingByHash = new Map(existing.map((chunk) => [chunk.contentHash, chunk]));
  const merged = nextChunks.map((chunk) => {
    const match = existingByHash.get(chunk.contentHash);
    return match?.embeddingStatus === 'complete' && Array.isArray(match.embedding)
      ? { ...chunk, ...match, chunkId: chunk.chunkId, chunkIndex: chunk.chunkIndex, chunkText: chunk.chunkText, sourceFields: chunk.sourceFields }
      : { ...chunk, embeddingStatus: 'pending', embeddingModel: options.embeddingModel || aiConfig().embeddingModel, retryCount: Number(match?.retryCount || 0) };
  });

  const needsEmbedding = merged.filter((chunk) => chunk.embeddingStatus !== 'complete');
  const embeddedById = new Map();
  if (needsEmbedding.length) {
    const newlyEmbedded = await embedChunks(needsEmbedding, options);
    newlyEmbedded.forEach((chunk) => embeddedById.set(chunk.chunkId, chunk));
  }
  const embedded = merged.map((chunk) => embeddedById.get(chunk.chunkId) || chunk);
  await writeChunks(userId, memoryId, embedded, options);
  if (admin.apps.length) {
    const failed = embedded.filter((chunk) => chunk.embeddingStatus === 'failed').length;
    await memoryRef(userId, memoryId).set({
      embeddingStatus: failed === embedded.length ? 'failed' : 'complete',
      embeddingModel: options.embeddingModel || aiConfig().embeddingModel,
      embeddedAt: timestampValue(),
      updatedAt: timestampValue(),
      embeddingErrorMessage: failed ? `${failed} chunk embedding failure(s).` : null,
    }, { merge: true });
  }

  return {
    status: embedded.some((chunk) => chunk.embeddingStatus === 'complete') ? 'complete' : 'failed',
    memoryId,
    chunkCount: embedded.length,
    embeddedCount: embedded.filter((chunk) => chunk.embeddingStatus === 'complete').length,
    failedCount: embedded.filter((chunk) => chunk.embeddingStatus === 'failed').length,
  };
}

async function deleteMemoryChunks(userId, memoryId, options = {}) {
  if (options.store?.deleteChunks) return options.store.deleteChunks(userId, memoryId);
  if (!admin.apps.length) return { deletedCount: 0 };
  const snapshot = await memoryRef(userId, memoryId).collection('chunks').get();
  const batch = admin.firestore().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return { deletedCount: snapshot.size };
}

async function listUserChunks(userId, options = {}) {
  if (options.store?.listChunks) return options.store.listChunks(userId, options);
  if (!admin.apps.length) return [];
  const memories = await admin.firestore().collection('users').doc(userId).collection('memories')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(1, Math.min(500, Number(options.memoryLimit || 250))))
    .get();
  const chunks = [];
  for (const doc of memories.docs) {
    const memory = { id: doc.id, ...doc.data() };
    const snapshot = await doc.ref.collection('chunks').get();
    for (const chunkDoc of snapshot.docs) {
      chunks.push({ ...chunkDoc.data(), chunkId: chunkDoc.id, memory });
    }
  }
  return chunks;
}

async function backfillEmbeddingsForUser(userId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  const memories = options.memories || (admin.apps.length
    ? (await admin.firestore().collection('users').doc(userId).collection('memories').orderBy('createdAt', 'desc').limit(limit).get())
      .docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    : await options.store?.listSources?.(userId) || []);
  const summary = { processedCount: 0, skippedCount: 0, failedCount: 0, errors: [] };
  for (const memory of memories.slice(0, limit)) {
    try {
      const result = await indexMemoryForRetrieval(userId, memory.id, { ...options, memory });
      if (result.status === 'complete') summary.processedCount += 1;
      else summary.failedCount += 1;
    } catch (error) {
      summary.failedCount += 1;
      summary.errors.push({ memoryId: memory.id, error: error.message || String(error) });
    }
  }
  summary.status = summary.failedCount ? (summary.processedCount ? 'partial_success' : 'failed') : 'success';
  return summary;
}

module.exports = {
  GENERIC_CHUNK_TAGS,
  backfillEmbeddingsForUser,
  buildMemoryChunks,
  deleteMemoryChunks,
  embedChunks,
  hashContent,
  indexMemoryForRetrieval,
  listStoredChunks,
  listUserChunks,
  sourceFieldsForMemory,
  timestampToIso,
};
