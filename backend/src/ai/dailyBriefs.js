const admin = require('firebase-admin');
const { aiConfig } = require('./aiConfig');
const { createAIProvider } = require('./aiProvider');
const {
  canProcessAIMemory,
  getAIProcessingLimitForUser,
  recordAIProcessingUsage,
  usageMetadata,
} = require('./aiUsage');

function db() {
  if (!admin.apps.length) throw new Error('Firebase Admin is not configured for Daily Briefs.');
  return admin.firestore();
}

function timestamp() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function dateFromValue(value) {
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000);
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function dateKeyFor(date = new Date(), timezone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function memoryDateKey(memory, timezone) {
  return dateKeyFor(dateFromValue(memory.capturedAt || memory.createdAt) || new Date(), timezone);
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function memorySummaryForAI(doc) {
  const memory = { id: doc.id, ...doc.data() };
  const ai = memory.ai || {};
  const summary = ai.summary || memory.summary || '';
  const raw = String(memory.rawText || memory.content || '').trim();
  return {
    id: memory.id,
    title: memory.title || 'Untitled memory',
    sourceType: memory.sourceType || memory.type || 'unknown',
    sourceUrl: memory.sourceUrl || memory.sourceURL,
    author: memory.author?.username || memory.author?.displayName || memory.sourceUsername,
    summary: summary || raw.slice(0, 700),
    text: summary ? undefined : raw.slice(0, 1000),
    tags: ai.tags?.length ? ai.tags : memory.tags || [],
    concepts: ai.concepts?.length ? ai.concepts : memory.concepts || [],
    entities: ai.entities?.length ? ai.entities : memory.entities || [],
    suggestedProjects: ai.suggestedProjects || [],
    capturedAt: memory.capturedAt || memory.createdAt,
  };
}

function scoreConnection(todayMemory, candidate) {
  let score = 0;
  const reasons = [];
  const todayTags = new Set((todayMemory.tags || []).map(normalize));
  const todayConcepts = new Set((todayMemory.concepts || []).map(normalize));
  const todayEntities = new Set((todayMemory.entities || []).map(normalize));

  const sharedConcept = (candidate.concepts || []).find((value) => todayConcepts.has(normalize(value)));
  if (sharedConcept) {
    score += 3;
    reasons.push(`Shared concept: ${sharedConcept}`);
  }
  const sharedTag = (candidate.tags || []).find((value) => todayTags.has(normalize(value)));
  if (sharedTag) {
    score += 2;
    reasons.push(`Shared tag: ${sharedTag}`);
  }
  const sharedEntity = (candidate.entities || []).find((value) => todayEntities.has(normalize(value)));
  if (sharedEntity) {
    score += 2;
    reasons.push(`Shared entity: ${sharedEntity}`);
  }
  return { score, reason: reasons[0] || 'Related to today’s saves' };
}

function fallbackBrief({ userId, dateKey, timezone, todayMemories, connectedOlderMemories, projects }) {
  const tags = new Map();
  for (const memory of todayMemories) {
    for (const value of [...(memory.concepts || []), ...(memory.tags || [])].slice(0, 6)) {
      const key = normalize(value);
      if (!key) continue;
      const current = tags.get(key) || { name: value, memoryIds: [] };
      current.memoryIds.push(memory.id);
      tags.set(key, current);
    }
  }
  const mainThemes = Array.from(tags.values()).slice(0, 5).map((theme) => ({
    ...theme,
    summary: `Based on ${theme.memoryIds.length} saved ${theme.memoryIds.length === 1 ? 'memory' : 'memories'}.`,
  }));
  const bestSaves = todayMemories.slice(0, 3).map((memory) => ({
    memoryId: memory.id,
    title: memory.title,
    reason: memory.summary ? 'It already has a useful summary for future recall.' : 'It looks useful to revisit later.',
  }));
  const suggestedProjectLinks = projects.slice(0, 3).map((project) => ({
    projectId: project.id,
    projectName: project.name,
    reason: `Some of today’s saves may relate to ${project.name}.`,
    memoryIds: todayMemories.slice(0, 3).map((memory) => memory.id),
  }));

  return {
    id: dateKey,
    userId,
    dateKey,
    timezone,
    memoryIds: todayMemories.map((memory) => memory.id),
    title: todayMemories.length ? 'Today in your saved memories' : 'No saves today',
    overview: todayMemories.length
      ? `Based on your saved memories, you captured ${todayMemories.length} ${todayMemories.length === 1 ? 'item' : 'items'} today.`
      : 'No memories were captured for this day.',
    savedCount: todayMemories.length,
    mainThemes,
    bestSaves,
    actionableIdeas: todayMemories.length ? [{
      text: 'Review the saves that still need a next step or project home.',
      memoryIds: todayMemories.map((memory) => memory.id).slice(0, 6),
      priority: 'medium',
    }] : [],
    connectedOlderMemories,
    suggestedFollowUps: todayMemories.length ? ['Pick one save to turn into a concrete next action.'] : [],
    suggestedProjectLinks,
    status: todayMemories.length ? 'fallback' : 'generated',
    generatedAt: timestamp(),
    memoryCount: todayMemories.length,
    usedAi: false,
    ai: {
      status: todayMemories.length ? 'fallback' : 'skipped',
      processingVersion: aiConfig().processingVersion,
      modelUsed: 'deterministic',
      generatedAt: timestamp(),
    },
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
}

async function getDailyBrief(userId, dateKey) {
  const doc = await db().collection('users').doc(userId).collection('dailyBriefs').doc(dateKey).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function listDailyBriefs(userId, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit || 14)));
  const snapshot = await db().collection('users').doc(userId).collection('dailyBriefs')
    .orderBy('dateKey', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function generateDailyBriefForUser(userId, dateKey, options = {}) {
  const timezone = options.timezone || 'UTC';
  const existing = await getDailyBrief(userId, dateKey);
  if (existing && !options.forceRegenerate && ['generated', 'fallback', 'limit_reached'].includes(existing.status || existing.ai?.status)) {
    return existing;
  }

  const snapshot = await db().collection('users').doc(userId).collection('memories')
    .orderBy('capturedAt', 'desc')
    .limit(250)
    .get();
  const allMemories = snapshot.docs.map(memorySummaryForAI);
  const todayMemories = allMemories.filter((memory) => memoryDateKey(memory, timezone) === dateKey);

  const projectsSnapshot = await db().collection('users').doc(userId).collection('projects')
    .where('status', 'in', ['active', 'paused'])
    .limit(50)
    .get()
    .catch(() => ({ docs: [] }));
  const projects = projectsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const connectedOlderMemories = [];
  for (const candidate of allMemories.filter((memory) => !todayMemories.some((today) => today.id === memory.id))) {
    const best = todayMemories
      .map((today) => scoreConnection(today, candidate))
      .sort((a, b) => b.score - a.score)[0];
    if (best?.score > 0) {
      connectedOlderMemories.push({
        memoryId: candidate.id,
        title: candidate.title,
        reason: best.reason,
        summary: candidate.summary,
        score: best.score,
      });
    }
  }
  connectedOlderMemories.sort((a, b) => b.score - a.score);

  let brief = fallbackBrief({
    userId,
    dateKey,
    timezone,
    todayMemories,
    connectedOlderMemories: connectedOlderMemories.slice(0, 6).map(({ score, summary, ...item }) => item),
    projects,
  });

  if (todayMemories.length && aiConfig().openaiApiKey && aiConfig().provider === 'openai') {
    const usageBefore = await canProcessAIMemory(userId, 1, options);
    if (!usageBefore.allowed) {
      brief = {
        ...brief,
        status: 'limit_reached',
        usedAi: false,
        errorMessage: 'AI_DAILY_LIMIT_REACHED',
        ai: {
          status: 'limit_reached',
          errorMessage: 'AI_DAILY_LIMIT_REACHED',
          processingVersion: aiConfig().processingVersion,
          generatedAt: timestamp(),
        },
      };
      await db().collection('users').doc(userId).collection('dailyBriefs').doc(dateKey).set(brief, { merge: true });
      return getDailyBrief(userId, dateKey);
    }

    try {
      const output = await createAIProvider().generateDailyBrief({
        dateKey,
        timezone,
        memories: todayMemories,
        connectedOlderMemories: connectedOlderMemories.slice(0, 8),
        projects,
      });
      brief = {
        ...brief,
        ...output,
        id: dateKey,
        userId,
        dateKey,
        timezone,
        memoryIds: todayMemories.map((memory) => memory.id),
        savedCount: todayMemories.length,
        status: 'generated',
        generatedAt: timestamp(),
        memoryCount: todayMemories.length,
        usedAi: true,
        errorMessage: null,
        ai: {
          ...output.ai,
          status: 'generated',
          generatedAt: timestamp(),
        },
        updatedAt: timestamp(),
      };
      await recordAIProcessingUsage(userId, { briefGeneratedCount: 1 }, options).catch((usageError) => {
        console.warn(`[ai-usage] failed to record generated brief user=${userId}: ${usageError.message}`);
      });
      const usageAfter = await getAIProcessingLimitForUser(userId, options).catch(() => null);
      if (usageAfter) brief.aiUsage = usageMetadata(usageBefore, usageAfter);
    } catch (error) {
      await recordAIProcessingUsage(userId, { failedCount: 1 }, options).catch((usageError) => {
        console.warn(`[ai-usage] failed to record failed brief user=${userId}: ${usageError.message}`);
      });
      brief.status = 'failed';
      brief.usedAi = false;
      brief.errorMessage = error.message || 'Daily Brief generation failed.';
      brief.ai = {
        status: 'failed',
        errorMessage: error.message || 'Daily Brief generation failed.',
        processingVersion: aiConfig().processingVersion,
        generatedAt: timestamp(),
      };
    }
  }

  await db().collection('users').doc(userId).collection('dailyBriefs').doc(dateKey).set(brief, { merge: true });
  return getDailyBrief(userId, dateKey);
}

// TODO: Move this into a scheduled Firebase/Cloud task when the deployment target
// is ready. The scheduled job should process unprocessed memories first, then call
// generateDailyBriefForUser for users with daily briefs enabled in their profile/sync settings.

module.exports = {
  dateKeyFor,
  generateDailyBriefForUser,
  getDailyBrief,
  listDailyBriefs,
};
