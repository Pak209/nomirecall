const ALLOWED_CATEGORIES = new Set([
  'AI',
  'Crypto',
  'App Building',
  'Design',
  'Marketing',
  'Business',
  'Research',
  'Productivity',
  'Personal',
  'Other',
]);

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asStringArray(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => asString(item))
      .filter(Boolean),
  )).slice(0, limit);
}

function normalizeProcessedMemoryAI(value, metadata = {}) {
  const category = asString(value?.category, 'Other');
  const importanceScore = Number(value?.importanceScore);

  return {
    summary: asString(value?.summary).slice(0, 800),
    category: ALLOWED_CATEGORIES.has(category) ? category : 'Other',
    tags: asStringArray(value?.tags, 12),
    concepts: asStringArray(value?.concepts, 16),
    entities: asStringArray(value?.entities, 16),
    claims: asStringArray(value?.claims, 8),
    actionItems: asStringArray(value?.actionItems, 8),
    keyTakeaways: asStringArray(value?.keyTakeaways, 8),
    suggestedProjects: asStringArray(value?.suggestedProjects, 8),
    importanceScore: Number.isFinite(importanceScore)
      ? Math.max(0, Math.min(1, importanceScore))
      : 0.3,
    modelUsed: metadata.modelUsed || '',
    processingVersion: metadata.processingVersion || '',
  };
}

function normalizePriority(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function normalizeMemoryRefs(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => ({
    memoryId: asString(item?.memoryId || item?.id),
    title: asString(item?.title),
    reason: asString(item?.reason).slice(0, 240),
  })).filter((item) => item.memoryId && item.reason);
}

function normalizeDailyBriefOutput(value, metadata = {}) {
  return {
    title: asString(value?.title, 'Daily Nomi Brief').slice(0, 120),
    overview: asString(value?.overview, 'Based on your saved memories, Nomi found a few things worth revisiting.').slice(0, 1200),
    mainThemes: Array.isArray(value?.mainThemes) ? value.mainThemes.slice(0, 6).map((theme) => ({
      name: asString(theme?.name).slice(0, 80),
      summary: asString(theme?.summary).slice(0, 360),
      memoryIds: asStringArray(theme?.memoryIds, 12),
    })).filter((theme) => theme.name) : [],
    bestSaves: normalizeMemoryRefs(value?.bestSaves, 3),
    actionableIdeas: Array.isArray(value?.actionableIdeas) ? value.actionableIdeas.slice(0, 8).map((idea) => ({
      text: asString(idea?.text).slice(0, 320),
      memoryIds: asStringArray(idea?.memoryIds, 12),
      priority: normalizePriority(idea?.priority),
    })).filter((idea) => idea.text) : [],
    connectedOlderMemories: normalizeMemoryRefs(value?.connectedOlderMemories, 6),
    suggestedFollowUps: asStringArray(value?.suggestedFollowUps, 8),
    suggestedProjectLinks: Array.isArray(value?.suggestedProjectLinks) ? value.suggestedProjectLinks.slice(0, 8).map((link) => ({
      projectId: asString(link?.projectId),
      projectName: asString(link?.projectName).slice(0, 100),
      reason: asString(link?.reason).slice(0, 260),
      memoryIds: asStringArray(link?.memoryIds, 12),
    })).filter((link) => link.reason) : [],
    ai: {
      modelUsed: metadata.modelUsed || '',
      processingVersion: metadata.processingVersion || '',
      status: 'generated',
    },
  };
}

function normalizeProjectSummaryOutput(value, metadata = {}) {
  return {
    summary: asString(value?.summary).slice(0, 1200),
    mainThemes: asStringArray(value?.mainThemes, 8),
    openQuestions: asStringArray(value?.openQuestions, 8),
    nextActions: asStringArray(value?.nextActions, 8),
    relatedMemoryIds: asStringArray(value?.relatedMemoryIds, 20),
    suggestedMemoryIds: asStringArray(value?.suggestedMemoryIds, 20),
    modelUsed: metadata.modelUsed || '',
    processingVersion: metadata.processingVersion || '',
    status: 'generated',
  };
}

module.exports = {
  normalizeProcessedMemoryAI,
  normalizeDailyBriefOutput,
  normalizeProjectSummaryOutput,
};
