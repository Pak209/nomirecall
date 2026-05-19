const admin = require('firebase-admin');

const { aiConfig } = require('./aiConfig');

const memoryUsageRecords = new Map();

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getUserAIUsageTier(user = {}) {
  if (user.isAdmin === true || user.role === 'admin' || user.tier === 'admin' || user.tier === 'dev' || user.aiTier === 'admin' || user.aiTier === 'dev') return 'admin';
  if (user.isEarlyAccess === true || user.earlyAccessEnabled === true || user.tier === 'early_access' || user.aiTier === 'early_access') return 'early_access';
  if (Array.isArray(user.entitlements) && user.entitlements.includes('early_access')) return 'early_access';
  if (user.subscriptionStatus === 'early_access') return 'early_access';
  return 'free';
}

function getDailyAiLimitForTier(tier = 'free') {
  const config = aiConfig();
  return config.dailyLimits[tier] ?? config.dailyLimits.free;
}

async function userForAIUsage(userId, options = {}) {
  if (options.user) return options.user;
  if (options.store?.getUserById) return options.store.getUserById(userId);
  return null;
}

function usageDocId(dateKey = utcDateKey()) {
  return `aiProcessingDaily_${dateKey}`;
}

function usageRecordKey(userId, dateKey = utcDateKey()) {
  return `${userId}:${dateKey}`;
}

function usageReference(userId, dateKey = utcDateKey()) {
  if (!admin.apps.length) return null;
  return admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('usage')
    .doc(usageDocId(dateKey));
}

function nowValue() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function defaultUsageRecord(userId, tier, limit, dateKey = utcDateKey()) {
  return {
    userId,
    dateKey,
    tier,
    limit,
    processedCount: 0,
    briefGeneratedCount: 0,
    projectSummaryCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lastProcessedAt: null,
    createdAt: nowValue(),
    updatedAt: nowValue(),
  };
}

async function getAIProcessingDailyUsage(userId, options = {}) {
  const config = aiConfig();
  const dateKey = options.dateKey || utcDateKey();
  const user = await userForAIUsage(userId, options);
  const tier = getUserAIUsageTier(user || {});
  const limit = getDailyAiLimitForTier(tier);
  const ref = usageReference(userId, dateKey);

  if (ref) {
    const doc = await ref.get();
    if (!doc.exists) return defaultUsageRecord(userId, tier, limit, dateKey);
    return {
      ...defaultUsageRecord(userId, tier, limit, dateKey),
      ...doc.data(),
      tier,
      limit,
    };
  }

  const key = usageRecordKey(userId, dateKey);
  return {
    ...defaultUsageRecord(userId, tier, limit, dateKey),
    ...(memoryUsageRecords.get(key) || {}),
    tier,
    limit,
  };
}

async function getAIProcessingLimitForUser(userId, options = {}) {
  const usage = await getAIProcessingDailyUsage(userId, options);
  const used = Number(usage.processedCount || 0)
    + Number(usage.briefGeneratedCount || 0)
    + Number(usage.projectSummaryCount || 0);
  const remaining = Math.max(0, Number(usage.limit || 0) - used);
  return {
    tier: usage.tier,
    limit: Number(usage.limit || 0),
    used,
    remaining,
    dateKey: usage.dateKey,
    processedCount: Number(usage.processedCount || 0),
    briefGeneratedCount: Number(usage.briefGeneratedCount || 0),
    projectSummaryCount: Number(usage.projectSummaryCount || 0),
    failedCount: Number(usage.failedCount || 0),
    skippedCount: Number(usage.skippedCount || 0),
  };
}

async function canProcessAIMemory(userId, requestedCount = 1, options = {}) {
  const config = aiConfig();
  const limitInfo = await getAIProcessingLimitForUser(userId, options);
  if (config.disableLimits) {
    return {
      ...limitInfo,
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      limitsDisabled: true,
    };
  }

  const allowed = limitInfo.remaining >= Math.max(1, Number(requestedCount || 1));
  return {
    ...limitInfo,
    allowed,
    reason: allowed ? undefined : 'AI_DAILY_LIMIT_REACHED',
  };
}

async function recordAIProcessingUsage(userId, counts = {}, options = {}) {
  const dateKey = options.dateKey || utcDateKey();
  const usage = await getAIProcessingDailyUsage(userId, { ...options, dateKey });
  const processedDelta = Number(counts.processedCount || 0);
  const briefDelta = Number(counts.briefGeneratedCount || 0);
  const projectDelta = Number(counts.projectSummaryCount || 0);
  const patch = {
    userId,
    dateKey,
    tier: usage.tier,
    limit: usage.limit,
    processedCount: Number(usage.processedCount || 0) + processedDelta,
    briefGeneratedCount: Number(usage.briefGeneratedCount || 0) + briefDelta,
    projectSummaryCount: Number(usage.projectSummaryCount || 0) + projectDelta,
    failedCount: Number(usage.failedCount || 0) + Number(counts.failedCount || 0),
    skippedCount: Number(usage.skippedCount || 0) + Number(counts.skippedCount || 0),
    lastProcessedAt: processedDelta + briefDelta + projectDelta > 0 ? nowValue() : usage.lastProcessedAt || null,
    updatedAt: nowValue(),
  };

  const ref = usageReference(userId, dateKey);
  if (ref) {
    const doc = await ref.get();
    await ref.set({
      ...(doc.exists ? {} : { createdAt: nowValue() }),
      ...patch,
    }, { merge: true });
    return;
  }

  const key = usageRecordKey(userId, dateKey);
  memoryUsageRecords.set(key, {
    ...(memoryUsageRecords.get(key) || { createdAt: new Date().toISOString() }),
    ...patch,
  });
}

function usageMetadata(before, after) {
  return {
    tier: before.tier,
    limit: before.limit,
    usedBefore: before.used,
    usedAfter: after.used,
    remainingBefore: before.remaining,
    remainingAfter: after.remaining,
    dateKey: before.dateKey,
    processedCount: after.processedCount,
    briefGeneratedCount: after.briefGeneratedCount,
    projectSummaryCount: after.projectSummaryCount,
    failedCount: after.failedCount,
    skippedCount: after.skippedCount,
    limitsDisabled: before.limitsDisabled === true || after.limitsDisabled === true || undefined,
  };
}

function limitReachedPayload(limitInfo) {
  return {
    error: 'AI_DAILY_LIMIT_REACHED',
    tier: limitInfo.tier,
    limit: limitInfo.limit,
    used: limitInfo.used,
    remaining: Math.max(0, limitInfo.remaining),
    resetDateKey: limitInfo.dateKey,
  };
}

function resetInMemoryAIUsage() {
  memoryUsageRecords.clear();
}

module.exports = {
  canProcessAi: canProcessAIMemory,
  canProcessAIMemory,
  getDailyAiLimitForTier,
  getAIProcessingDailyUsage,
  getAIProcessingLimitForUser,
  getTodayUsage: getAIProcessingDailyUsage,
  getUserAiTier: getUserAIUsageTier,
  getUserAIUsageTier,
  incrementAiUsage: recordAIProcessingUsage,
  limitReachedPayload,
  recordAIProcessingUsage,
  resetInMemoryAIUsage,
  usageMetadata,
  utcDateKey,
};
