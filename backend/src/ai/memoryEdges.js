const crypto = require('crypto');
const admin = require('firebase-admin');

const { listUserChunks } = require('./memoryChunks');
const { listUserMemories } = require('./queryMemories');

const EDGE_VERSION = 'v1';
const MIN_EDGE_SCORE = 0.5;
const GENERIC_EDGE_TAGS = new Set([
  'bookmark',
  'bookmarks',
  'capture',
  'general',
  'http',
  'https',
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
  'tweet',
  'tweets',
  'twitter',
  'unknown',
  'url',
  'urls',
  'x',
  'x_bookmark',
  'xpost',
  'xposts',
]);

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function timestampValue() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function canonicalEdgeId(a, b) {
  return [String(a), String(b)].sort().join('__');
}

function overlap(a = [], b = []) {
  const left = new Map(asArray(a).map((item) => [normalize(item), item]));
  return asArray(b).filter((item) => left.has(normalize(item)));
}

function meaningfulTags(tags = []) {
  return asArray(tags).filter((tag) => !GENERIC_EDGE_TAGS.has(normalize(tag)));
}

function isMeaningfulCategory(category = '') {
  const normalized = normalize(category);
  return Boolean(normalized) && !GENERIC_EDGE_TAGS.has(normalized);
}

function confidenceFor(score) {
  if (score >= 0.78) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const left = Number(a[index] || 0);
    const right = Number(b[index] || 0);
    dot += left * right;
    leftMagnitude += left * left;
    rightMagnitude += right * right;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function groupEmbeddedChunksByMemory(chunks = []) {
  const grouped = new Map();
  for (const chunk of chunks) {
    if (!chunk.memoryId || !Array.isArray(chunk.embedding)) continue;
    const entries = grouped.get(chunk.memoryId) || [];
    entries.push(chunk);
    grouped.set(chunk.memoryId, entries);
  }
  return grouped;
}

function maxChunkSimilarity(left = [], right = []) {
  let max = 0;
  for (const leftChunk of left) {
    for (const rightChunk of right) {
      max = Math.max(max, cosineSimilarity(leftChunk.embedding, rightChunk.embedding));
    }
  }
  return max ? Number(max.toFixed(4)) : undefined;
}

async function semanticSimilaritiesForMemories(userId, memories = [], options = {}) {
  if (options.semanticSimilarities) return options.semanticSimilarities;
  const chunks = options.chunks || await listUserChunks(userId, options);
  const chunksByMemory = groupEmbeddedChunksByMemory(chunks);
  const similarities = new Map();
  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const left = memories[i];
      const right = memories[j];
      const similarity = maxChunkSimilarity(chunksByMemory.get(left.id), chunksByMemory.get(right.id));
      if (similarity !== undefined) similarities.set(canonicalEdgeId(left.id, right.id), similarity);
    }
  }
  return similarities;
}

function memorySignature(memory = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: memory.title,
    summary: memory.summary,
    tags: memory.tags,
    concepts: memory.concepts,
    entities: memory.entities,
    projectIds: memory.projectIds,
    category: memory.category,
  })).digest('hex');
}

function scoreMemoryPair(from, to, options = {}) {
  const sharedTags = overlap(meaningfulTags(from.tags), meaningfulTags(to.tags));
  const sharedConcepts = overlap(from.concepts, to.concepts);
  const sharedEntities = overlap(from.entities, to.entities);
  const sharedProjects = overlap(from.projectIds, to.projectIds);
  const sameCategory = isMeaningfulCategory(from.category)
    && normalize(from.category) === normalize(to.category);
  const semanticSimilarity = typeof options.semanticSimilarity === 'number' ? options.semanticSimilarity : undefined;

  let score = 0;
  const reasonTypes = [];
  const reasons = [];
  if (sharedConcepts.length) {
    score += Math.min(0.3, sharedConcepts.length * 0.15);
    reasonTypes.push('shared_concepts');
    reasons.push(`Shared concepts: ${sharedConcepts.slice(0, 4).join(', ')}`);
  }
  if (sharedEntities.length) {
    score += Math.min(0.25, sharedEntities.length * 0.13);
    reasonTypes.push('shared_entities');
    reasons.push(`Shared entities: ${sharedEntities.slice(0, 4).join(', ')}`);
  }
  if (sharedTags.length) {
    score += Math.min(0.18, sharedTags.length * 0.08);
    reasonTypes.push('shared_tags');
    reasons.push(`Shared tags: ${sharedTags.slice(0, 4).join(', ')}`);
  }
  if (sharedProjects.length) {
    score += Math.min(0.2, sharedProjects.length * 0.2);
    reasonTypes.push('shared_projects');
    reasons.push('Linked to the same project');
  }
  if (sameCategory) {
    score += 0.08;
    reasonTypes.push('same_category');
    reasons.push(`Same category: ${from.category}`);
  }
  if (semanticSimilarity !== undefined && semanticSimilarity >= 0.8) {
    score += Math.min(0.5, 0.42 + ((semanticSimilarity - 0.8) * 0.8));
    reasonTypes.push('semantic_similarity');
    reasons.push('Similar embedded meaning');
  } else if (semanticSimilarity !== undefined && semanticSimilarity >= 0.72 && score >= 0.2) {
    score += Math.min(0.25, (semanticSimilarity - 0.7) * 0.8);
    reasonTypes.push('semantic_similarity');
    reasons.push('Similar embedded meaning');
  }

  score = Math.min(1, Number(score.toFixed(4)));
  return {
    score,
    confidence: confidenceFor(score),
    reasonTypes: Array.from(new Set(reasonTypes)),
    reasons: Array.from(new Set(reasons)).slice(0, 5),
    evidence: [
      from.summary || from.rawText || from.title,
      to.summary || to.rawText || to.title,
    ].filter(Boolean).map((value) => String(value).slice(0, 240)),
    sharedTags,
    sharedConcepts,
    sharedEntities,
    sharedProjects,
    semanticSimilarity,
  };
}

function buildMemoryEdge(userId, from, to, options = {}) {
  const edgeId = canonicalEdgeId(from.id, to.id);
  const [fromMemoryId, toMemoryId] = edgeId.split('__');
  const score = scoreMemoryPair(from, to, options);
  if (score.score < Number(options.minScore || MIN_EDGE_SCORE)) return null;
  return {
    edgeId,
    userId,
    fromMemoryId,
    toMemoryId,
    ...score,
    generatedBy: 'nomi-memory-edge-service',
    version: EDGE_VERSION,
    sourceSignature: crypto.createHash('sha256').update(`${memorySignature(from)}:${memorySignature(to)}`).digest('hex'),
    createdAt: timestampValue(),
    updatedAt: timestampValue(),
    lastRecomputedAt: timestampValue(),
  };
}

function edgeRef(userId, edgeId) {
  return admin.firestore().collection('users').doc(userId).collection('memoryEdges').doc(edgeId);
}

async function writeEdges(userId, edges, options = {}) {
  if (options.store?.upsertMemoryEdges) return options.store.upsertMemoryEdges(userId, edges);
  if (!admin.apps.length) return edges;
  const batch = admin.firestore().batch();
  const collection = admin.firestore().collection('users').doc(userId).collection('memoryEdges');
  const nextIds = new Set(edges.map((edge) => edge.edgeId));
  for (const edge of edges) {
    batch.set(edgeRef(userId, edge.edgeId), edge, { merge: true });
  }
  if (options.deleteStale === true) {
    const existing = await collection.where('generatedBy', '==', 'nomi-memory-edge-service').get();
    for (const doc of existing.docs) {
      if (!nextIds.has(doc.id)) batch.delete(doc.ref);
    }
  }
  await batch.commit();
  return edges;
}

async function listPersistedEdges(userId, memoryId, options = {}) {
  if (options.store?.listMemoryEdges) return options.store.listMemoryEdges(userId, memoryId);
  if (!admin.apps.length) return [];
  const collection = admin.firestore().collection('users').doc(userId).collection('memoryEdges');
  const [fromSnapshot, toSnapshot] = await Promise.all([
    collection.where('fromMemoryId', '==', memoryId).limit(25).get(),
    collection.where('toMemoryId', '==', memoryId).limit(25).get(),
  ]);
  const edges = new Map();
  for (const doc of [...fromSnapshot.docs, ...toSnapshot.docs]) edges.set(doc.id, { edgeId: doc.id, ...doc.data() });
  return Array.from(edges.values()).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

async function recomputeEdgesForMemory(userId, memoryId, options = {}) {
  const memories = options.memories || await listUserMemories(userId, options);
  const center = memories.find((memory) => memory.id === String(memoryId));
  if (!center) return { status: 'failed', memoryId, edgeCount: 0, error: 'Memory not found.' };
  const semanticSimilarities = await semanticSimilaritiesForMemories(userId, memories, options);
  const edges = memories
    .filter((memory) => memory.id && memory.id !== center.id && memory.isArchived !== true)
    .map((memory) => buildMemoryEdge(userId, center, memory, {
      ...options,
      semanticSimilarity: semanticSimilarities.get(canonicalEdgeId(center.id, memory.id)),
    }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(options.limit || 20))));
  await writeEdges(userId, edges, { ...options, deleteStale: options.deleteStale === true });
  return { status: 'success', memoryId, edgeCount: edges.length, edges };
}

async function backfillMemoryEdgesForUser(userId, options = {}) {
  const memories = options.memories || await listUserMemories(userId, options);
  const active = memories.filter((memory) => memory.id && memory.isArchived !== true);
  const semanticSimilarities = await semanticSimilaritiesForMemories(userId, active, options);
  const edgeMap = new Map();
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const edgeId = canonicalEdgeId(active[i].id, active[j].id);
      const edge = buildMemoryEdge(userId, active[i], active[j], {
        ...options,
        semanticSimilarity: semanticSimilarities.get(edgeId),
      });
      if (edge) edgeMap.set(edge.edgeId, edge);
    }
  }
  const edges = Array.from(edgeMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(1000, Number(options.maxEdges || 300))));
  await writeEdges(userId, edges, { ...options, deleteStale: options.deleteStale !== false });
  return { status: 'success', edgeCount: edges.length, edges };
}

module.exports = {
  GENERIC_EDGE_TAGS,
  MIN_EDGE_SCORE,
  backfillMemoryEdgesForUser,
  buildMemoryEdge,
  canonicalEdgeId,
  cosineSimilarity,
  groupEmbeddedChunksByMemory,
  listPersistedEdges,
  maxChunkSimilarity,
  recomputeEdgesForMemory,
  scoreMemoryPair,
  semanticSimilaritiesForMemories,
};
