const crypto = require('crypto');
const admin = require('firebase-admin');

const { aiConfig } = require('./aiConfig');
const { createAIProvider } = require('./aiProvider');
const { indexMemoryForRetrieval } = require('./memoryChunks');
const { recomputeEdgesForMemory } = require('./memoryEdges');
const {
  canProcessAIMemory,
  getAIProcessingLimitForUser,
  limitReachedPayload,
  recordAIProcessingUsage,
  usageMetadata,
} = require('./aiUsage');

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTrackingFromUrls(value = '') {
  return String(value || '').replace(/https?:\/\/\S+/gi, (rawUrl) => {
    const trailing = rawUrl.match(/[),.;!?]+$/)?.[0] || '';
    const urlText = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    try {
      const url = new URL(urlText);
      [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'mc_cid',
        'mc_eid',
      ].forEach((key) => url.searchParams.delete(key));
      return `${url.toString()}${trailing}`;
    } catch {
      return rawUrl;
    }
  });
}

function hashContent(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function extractCleanTextFromMemory(memory = {}) {
  const sourceText = [
    memory.rawText,
    memory.text,
    memory.content,
    memory.body,
    memory.title,
  ].map((value) => String(value || '').trim()).find(Boolean) || '';

  const cleanText = normalizeWhitespace(stripTrackingFromUrls(sourceText));
  const config = aiConfig();
  const shouldProcess = cleanText.length >= config.minProcessChars;

  return {
    cleanText,
    contentHash: hashContent(cleanText),
    shouldProcess,
    skipReason: shouldProcess ? undefined : 'Memory text is too short to process.',
  };
}

function memoryReference(userId, memoryId) {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin is not configured for native memory AI processing.');
  }
  return admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('memories')
    .doc(memoryId);
}

function memoriesCollection(userId) {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin is not configured for native memory AI processing.');
  }
  return admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('memories');
}

function serverTimestampOrIso() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function cleanPatch(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(cleanPatch).filter((item) => item !== undefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, cleanPatch(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value;
}

async function markMemoryAIProcessingStatus(userId, memoryId, status, patch = {}) {
  const ref = memoryReference(userId, memoryId);
  await ref.set(cleanPatch({
    ...patch,
    ai: {
      ...(patch.ai || {}),
      processingStatus: status,
      processedAt: ['processed', 'failed', 'skipped'].includes(status) ? serverTimestampOrIso() : undefined,
    },
    updatedAt: serverTimestampOrIso(),
  }), { merge: true });
}

function aiInputFromMemory(memory, memoryId, userId, cleanText) {
  return {
    memoryId,
    userId,
    sourceType: memory.sourceType || memory.type,
    sourceUrl: memory.sourceUrl || memory.sourceURL || memory.source_url,
    title: memory.title,
    rawText: memory.rawText || memory.content || memory.body,
    cleanText,
    author: memory.author || {
      username: memory.authorUsername || memory.sourceUsername,
      displayName: memory.authorDisplayName,
    },
    capturedAt: memory.capturedAt || memory.sourceDate || memory.createdAt,
  };
}

function safeTopLevelPatch(memory, ai) {
  const patch = {};
  if (!String(memory.summary || '').trim() && ai.summary) patch.summary = ai.summary;
  if (!String(memory.category || '').trim() && ai.category) patch.category = ai.category;
  if ((!Array.isArray(memory.tags) || memory.tags.length === 0) && ai.tags?.length) patch.tags = ai.tags;
  if ((!Array.isArray(memory.concepts) || memory.concepts.length === 0) && ai.concepts?.length) patch.concepts = ai.concepts;
  if ((!Array.isArray(memory.entities) || memory.entities.length === 0) && ai.entities?.length) patch.entities = ai.entities;
  return patch;
}

function batchStatus(summary) {
  if (summary.limitReached && summary.processedCount === 0 && summary.skippedCount === 0 && summary.failedCount === 0) {
    return 'limit_reached';
  }
  if (summary.limitReached || summary.failedCount > 0) {
    return summary.processedCount > 0 || summary.skippedCount > 0 ? 'partial_success' : 'failed';
  }
  return 'success';
}

async function processMemoryForAI(userId, memoryId, options = {}) {
  let ref;
  let memory;
  const config = aiConfig();

  try {
    ref = memoryReference(userId, memoryId);
    const doc = await ref.get();
    if (!doc.exists) {
      return { status: 'failed', memoryId, error: 'Memory not found.' };
    }
    memory = { id: doc.id, ...doc.data() };
  } catch (error) {
    return { status: 'failed', memoryId, error: error.message || String(error) };
  }

  const extraction = extractCleanTextFromMemory(memory);
  const unchanged = memory.ai?.processingVersion === config.processingVersion
    && memory.contentHash === extraction.contentHash
    && ['processed', 'skipped'].includes(memory.ai?.processingStatus);

  if (!options.forceReprocess && unchanged) {
    await markMemoryAIProcessingStatus(userId, memoryId, 'skipped', {
      cleanText: extraction.cleanText,
      contentHash: extraction.contentHash,
      ai: {
        processingVersion: config.processingVersion,
        errorMessage: null,
      },
    });
    await recordAIProcessingUsage(userId, { skippedCount: 1 }, options).catch((usageError) => {
      console.warn(`[ai-usage] failed to record skipped processing user=${userId}: ${usageError.message}`);
    });
    return { status: 'skipped', memoryId };
  }

  if (!extraction.shouldProcess) {
    await markMemoryAIProcessingStatus(userId, memoryId, 'skipped', {
      cleanText: extraction.cleanText,
      contentHash: extraction.contentHash,
      ai: {
        processingVersion: config.processingVersion,
        errorMessage: extraction.skipReason,
      },
    });
    await recordAIProcessingUsage(userId, { skippedCount: 1 }, options).catch((usageError) => {
      console.warn(`[ai-usage] failed to record skipped processing user=${userId}: ${usageError.message}`);
    });
    return { status: 'skipped', memoryId, error: extraction.skipReason };
  }

  if (!config.openaiApiKey || config.provider !== 'openai') {
    const error = !config.openaiApiKey
      ? 'OPENAI_API_KEY is not configured.'
      : `Unsupported NOMI_AI_PROVIDER "${config.provider}".`;
    await markMemoryAIProcessingStatus(userId, memoryId, 'failed', {
      cleanText: extraction.cleanText,
      contentHash: extraction.contentHash,
      ai: {
        processingVersion: config.processingVersion,
        errorMessage: error,
        retryCount: Number(memory.ai?.retryCount || 0) + 1,
      },
    });
    await recordAIProcessingUsage(userId, { failedCount: 1 }, options).catch((usageError) => {
      console.warn(`[ai-usage] failed to record failed processing user=${userId}: ${usageError.message}`);
    });
    return { status: 'failed', memoryId, error };
  }

  if (!options.skipUsageLimit) {
    const limitInfo = await canProcessAIMemory(userId, 1, options);
    if (!limitInfo.allowed) {
      return {
        status: 'limited',
        memoryId,
        ...limitReachedPayload(limitInfo),
      };
    }
  }

  await markMemoryAIProcessingStatus(userId, memoryId, 'processing', {
    cleanText: extraction.cleanText,
    contentHash: extraction.contentHash,
    ai: {
      processingVersion: config.processingVersion,
      errorMessage: null,
      retryCount: Number(memory.ai?.retryCount || 0),
    },
  });

  try {
    const provider = createAIProvider(config);
    const cleanText = extraction.cleanText.slice(0, config.maxInputChars);
    const ai = await provider.processMemory(aiInputFromMemory(memory, memoryId, userId, cleanText));
    const aiPatch = {
      ...ai,
      processingStatus: 'processed',
      processedAt: serverTimestampOrIso(),
      errorMessage: null,
      retryCount: Number(memory.ai?.retryCount || 0),
    };

    await ref.set(cleanPatch({
      cleanText: extraction.cleanText,
      contentHash: extraction.contentHash,
      ai: aiPatch,
      ...safeTopLevelPatch(memory, ai),
      updatedAt: serverTimestampOrIso(),
    }), { merge: true });

    const updatedDoc = await ref.get();
    const updatedMemory = updatedDoc.exists ? { id: updatedDoc.id, ...updatedDoc.data() } : { id: memoryId, ...memory, ai: aiPatch };
    await indexMemoryForRetrieval(userId, memoryId, { ...options, memory: updatedMemory }).catch((indexError) => {
      console.warn(`[ai] retrieval indexing failed user=${userId} memory=${memoryId}: ${indexError.message}`);
    });
    await recomputeEdgesForMemory(userId, memoryId, options).catch((edgeError) => {
      console.warn(`[ai] edge recompute failed user=${userId} memory=${memoryId}: ${edgeError.message}`);
    });

    await recordAIProcessingUsage(userId, { processedCount: 1 }, options).catch((usageError) => {
      console.warn(`[ai-usage] failed to record processed memory user=${userId}: ${usageError.message}`);
    });
    return { status: 'processed', memoryId };
  } catch (error) {
    const message = error.message || 'AI memory processing failed.';
    console.warn(`[ai] process memory failed user=${userId} memory=${memoryId}: ${message}`);
    await markMemoryAIProcessingStatus(userId, memoryId, 'failed', {
      cleanText: extraction.cleanText,
      contentHash: extraction.contentHash,
      ai: {
        processingVersion: config.processingVersion,
        errorMessage: message,
        retryCount: Number(memory.ai?.retryCount || 0) + 1,
      },
    });
    await recordAIProcessingUsage(userId, { failedCount: 1 }, options).catch((usageError) => {
      console.warn(`[ai-usage] failed to record failed processing user=${userId}: ${usageError.message}`);
    });
    return { status: 'failed', memoryId, error: message };
  }
}

async function processMemoryIds(userId, memoryIds, options = {}) {
  const usedBefore = await canProcessAIMemory(userId, 1, options);
  const summary = {
    processedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    limitReached: false,
    errors: [],
  };

  for (const memoryId of memoryIds) {
    const result = await processMemoryForAI(userId, memoryId, options);
    if (result.status === 'processed') summary.processedCount += 1;
    else if (result.status === 'skipped') summary.skippedCount += 1;
    else if (result.status === 'limited') {
      summary.limitReached = true;
      summary.errors.push(result.error);
      break;
    }
    else {
      summary.failedCount += 1;
      if (result.error) summary.errors.push(result.error);
    }
  }

  const usedAfter = await getAIProcessingLimitForUser(userId, options);
  summary.usage = usageMetadata(usedBefore, usedAfter);
  summary.status = batchStatus(summary);
  return summary;
}

async function processUnprocessedMemoriesForUser(userId, options = {}) {
  const config = aiConfig();
  const limitInfo = await canProcessAIMemory(userId, 1, options);
  if (!limitInfo.allowed) {
    return {
      status: 'limit_reached',
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      limitReached: true,
      errors: ['AI_DAILY_LIMIT_REACHED'],
      usage: usageMetadata(limitInfo, limitInfo),
    };
  }
  const requestedLimit = Math.max(1, Math.min(100, Number(options.limit || config.defaultBatchLimit)));
  const limit = config.disableLimits ? requestedLimit : Math.min(requestedLimit, limitInfo.remaining);
  const snapshot = await memoriesCollection(userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const ids = snapshot.docs
    .map((doc) => ({ id: doc.id, memory: doc.data() }))
    .filter(({ memory }) => options.forceReprocess
      || !['processed', 'skipped'].includes(memory.ai?.processingStatus)
      || memory.ai?.processingVersion !== config.processingVersion)
    .map(({ id }) => id);

  return processMemoryIds(userId, ids, options);
}

async function processRecentImportedMemories(userId, options = {}) {
  const config = aiConfig();
  const limitInfo = await canProcessAIMemory(userId, 1, options);
  if (!limitInfo.allowed) {
    return {
      status: 'limit_reached',
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      limitReached: true,
      errors: ['AI_DAILY_LIMIT_REACHED'],
      usage: usageMetadata(limitInfo, limitInfo),
    };
  }
  const requestedLimit = Math.max(1, Math.min(100, Number(options.limit || config.defaultBatchLimit)));
  const limit = config.disableLimits ? requestedLimit : Math.min(requestedLimit, limitInfo.remaining);
  const snapshot = await memoriesCollection(userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const ids = snapshot.docs
    .map((doc) => ({ id: doc.id, memory: doc.data() }))
    .filter(({ memory }) => memory.sync?.importStatus === 'imported' || memory.sourceType === 'x_bookmark')
    .map(({ id }) => id);

  return processMemoryIds(userId, ids, options);
}

async function retryFailedMemoriesForUser(userId, options = {}) {
  const config = aiConfig();
  // Hard cap on how many times any single memory may be retried (cost safety).
  const maxRetries = Number.isFinite(Number(options.maxRetries)) ? Number(options.maxRetries) : 3;

  const limitInfo = await canProcessAIMemory(userId, 1, options);
  if (!limitInfo.allowed) {
    return {
      status: 'limit_reached',
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      limitReached: true,
      retriedCount: 0,
      cappedCount: 0,
      errors: ['AI_DAILY_LIMIT_REACHED'],
      usage: usageMetadata(limitInfo, limitInfo),
    };
  }

  const requestedLimit = Math.max(1, Math.min(100, Number(options.limit || config.defaultBatchLimit)));
  const limit = config.disableLimits ? requestedLimit : Math.min(requestedLimit, limitInfo.remaining);
  const snapshot = await memoriesCollection(userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const failedDocs = snapshot.docs
    .map((doc) => ({ id: doc.id, memory: doc.data() }))
    .filter(({ memory }) => memory.ai?.processingStatus === 'failed');

  // Cap enforcement: only retry failed memories still under the retry ceiling.
  const selectedIds = failedDocs
    .filter(({ memory }) => Number(memory.ai?.retryCount || 0) < maxRetries)
    .map(({ id }) => id);
  const cappedCount = failedDocs
    .filter(({ memory }) => Number(memory.ai?.retryCount || 0) >= maxRetries)
    .length;

  const summary = await processMemoryIds(userId, selectedIds, { ...options, forceReprocess: true });

  return {
    ...summary,
    retriedCount: selectedIds.length,
    cappedCount,
  };
}

module.exports = {
  batchStatus,
  extractCleanTextFromMemory,
  hashContent,
  markMemoryAIProcessingStatus,
  processMemoryForAI,
  processMemoryIds,
  processUnprocessedMemoriesForUser,
  processRecentImportedMemories,
  retryFailedMemoriesForUser,
};
