const admin = require('firebase-admin');

const { buildMemoryChunks, listStoredChunks, timestampToIso } = require('./ai/memoryChunks');
const { listPersistedEdges } = require('./ai/memoryEdges');

function isDebugEnabled() {
  // Debug inspection is never available in production, regardless of the
  // ENABLE_NOMI_DEBUG flag. This prevents accidentally shipping the debug
  // surface (chunk/edge/topic-page inspection) to real users.
  if (process.env.NODE_ENV === 'production') return false;
  if (String(process.env.ENABLE_NOMI_DEBUG || '').toLowerCase() === 'true') return true;
  if (String(process.env.ENABLE_NOMI_DEBUG || '').toLowerCase() === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function preview(value = '', maxLength = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function chunkPayload(chunk) {
  return {
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    chunkTextPreview: preview(chunk.chunkText),
    contentHash: chunk.contentHash,
    sourceFields: chunk.sourceFields,
    embeddingStatus: chunk.embeddingStatus || 'not_embedded',
    embeddingModel: chunk.embeddingModel,
    embeddedAt: timestampToIso(chunk.embeddedAt),
    retryCount: Number(chunk.retryCount || 0),
    errorMessage: chunk.errorMessage || null,
  };
}

async function debugMemoryChunks(userId, memoryId, options = {}) {
  if (options.store?.listChunks) {
    const chunks = await options.store.listChunks(userId, { memoryId });
    return chunks.filter((chunk) => String(chunk.memoryId) === String(memoryId)).map(chunkPayload);
  }
  if (admin.apps.length) return (await listStoredChunks(userId, memoryId)).map(chunkPayload);

  const source = await options.store?.getSourceById?.(userId, memoryId);
  if (!source) return null;
  return buildMemoryChunks({ ...source, id: memoryId }).map((chunk) => chunkPayload({
    ...chunk,
    embeddingStatus: 'not_persisted',
  }));
}

function connectedMemoryId(edge, memoryId) {
  return edge.fromMemoryId === memoryId ? edge.toMemoryId : edge.fromMemoryId;
}

function edgePayload(edge, memoryId, memoriesById = new Map()) {
  const connectedId = connectedMemoryId(edge, memoryId);
  const memory = memoriesById.get(connectedId);
  return {
    edgeId: edge.edgeId || edge.id,
    connectedMemoryId: connectedId,
    connectedMemoryTitle: memory?.title || 'Untitled memory',
    score: edge.score,
    confidence: edge.confidence,
    reasonTypes: edge.reasonTypes || [],
    reasons: edge.reasons || [],
    sharedTags: edge.sharedTags || [],
    sharedConcepts: edge.sharedConcepts || [],
    sharedEntities: edge.sharedEntities || [],
    sharedProjects: edge.sharedProjects || [],
    semanticSimilarity: edge.semanticSimilarity,
    evidencePreview: Array.isArray(edge.evidence) ? edge.evidence.map((item) => preview(item, 220)) : [],
    lastRecomputedAt: timestampToIso(edge.lastRecomputedAt || edge.updatedAt),
  };
}

async function debugMemoryEdges(userId, memoryId, options = {}) {
  const memories = options.store?.listSources ? await options.store.listSources(userId) : [];
  const memoriesById = new Map(memories.map((memory) => [String(memory.id), memory]));
  const edges = await listPersistedEdges(userId, memoryId, options);
  return edges.map((edge) => edgePayload(edge, String(memoryId), memoriesById));
}

function topicPayload(page, includeDetails = false) {
  const base = {
    topicPageId: page.topicPageId || page.id,
    title: page.title,
    slug: page.slug,
    summary: page.summary,
    keyIdeas: page.keyIdeas || [],
    keyIdeaCitations: page.keyIdeaCitations || [],
    relatedMemoryIds: page.relatedMemoryIds || [],
    relatedEdgeIds: page.relatedEdgeIds || [],
    concepts: page.concepts || [],
    entities: page.entities || [],
    projects: page.projects || [],
    sourceCount: Number(page.sourceCount || 0),
    synthesisStatus: page.synthesisStatus,
    lastSynthesizedAt: timestampToIso(page.lastSynthesizedAt),
    retryCount: Number(page.retryCount || 0),
    errorMessage: page.errorMessage || null,
  };
  if (!includeDetails) return base;
  return {
    ...base,
    backlinks: page.backlinks || [],
    openQuestions: page.openQuestions || [],
    possibleRelatedTopics: page.possibleRelatedTopics || [],
    generatedBy: page.generatedBy,
    version: page.version,
  };
}

async function listDebugTopicPages(userId, options = {}) {
  if (options.store?.listTopicPages) return (await options.store.listTopicPages(userId)).map((page) => topicPayload(page));
  if (!admin.apps.length) return [];
  const snapshot = await admin.firestore().collection('users').doc(userId).collection('topicPages')
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map((doc) => topicPayload({ id: doc.id, ...doc.data() }));
}

async function getDebugTopicPage(userId, topicPageId, options = {}) {
  if (options.store?.getTopicPage) {
    const page = await options.store.getTopicPage(userId, topicPageId);
    return page ? topicPayload(page, true) : null;
  }
  if (!admin.apps.length) return null;
  const doc = await admin.firestore().collection('users').doc(userId).collection('topicPages').doc(topicPageId).get();
  return doc.exists ? topicPayload({ id: doc.id, ...doc.data() }, true) : null;
}

module.exports = {
  debugMemoryChunks,
  debugMemoryEdges,
  getDebugTopicPage,
  isDebugEnabled,
  listDebugTopicPages,
  preview,
};
