const admin = require('firebase-admin');
const { aiConfig } = require('./ai/aiConfig');
const { createAIProvider } = require('./ai/aiProvider');
const { canProcessAIMemory, recordAIProcessingUsage } = require('./ai/aiUsage');

function db() {
  if (!admin.apps.length) throw new Error('Firebase Admin is not configured for projects.');
  return admin.firestore();
}

function timestamp() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function clean(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(clean).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, clean(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value;
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function projectRef(userId, projectId) {
  return db().collection('users').doc(userId).collection('projects').doc(projectId);
}

function memoriesRef(userId) {
  return db().collection('users').doc(userId).collection('memories');
}

async function createProject(userId, input) {
  const ref = db().collection('users').doc(userId).collection('projects').doc();
  const project = clean({
    id: ref.id,
    userId,
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim() || undefined,
    status: 'active',
    color: input.color,
    icon: input.icon,
    memoryIds: [],
    tags: asArray(input.tags),
    concepts: asArray(input.concepts),
    summary: '',
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  await ref.set(project);
  return { ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

async function updateProject(userId, projectId, patch) {
  const safePatch = clean({
    name: patch.name,
    description: patch.description,
    status: patch.status,
    color: patch.color,
    icon: patch.icon,
    tags: patch.tags,
    concepts: patch.concepts,
    summary: patch.summary,
    ai: patch.ai,
    updatedAt: timestamp(),
  });
  await projectRef(userId, projectId).set(safePatch, { merge: true });
}

async function archiveProject(userId, projectId) {
  await updateProject(userId, projectId, { status: 'archived' });
}

async function getProject(userId, projectId) {
  const doc = await projectRef(userId, projectId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function listProjects(userId, options = {}) {
  const snapshot = await db().collection('users').doc(userId).collection('projects')
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((project) => options.includeArchived || project.status !== 'archived');
}

async function assignMemoryToProject(userId, memoryId, projectId) {
  const project = await getProject(userId, projectId);
  if (!project) return false;
  const memoryDoc = await memoriesRef(userId).doc(memoryId).get();
  if (!memoryDoc.exists) return false;
  const memory = memoryDoc.data() || {};
  const memoryIds = Array.from(new Set([...(project.memoryIds || []), memoryId]));
  const projectIds = Array.from(new Set([...(memory.projectIds || []), projectId]));
  const batch = db().batch();
  batch.set(projectRef(userId, projectId), { memoryIds, updatedAt: timestamp() }, { merge: true });
  batch.set(memoriesRef(userId).doc(memoryId), { projectIds, updatedAt: timestamp() }, { merge: true });
  await batch.commit();
  return true;
}

async function removeMemoryFromProject(userId, memoryId, projectId) {
  const project = await getProject(userId, projectId);
  if (!project) return false;
  const memoryDoc = await memoriesRef(userId).doc(memoryId).get();
  if (!memoryDoc.exists) return false;
  const memory = memoryDoc.data() || {};
  const memoryIds = (project.memoryIds || []).filter((id) => id !== memoryId);
  const projectIds = (memory.projectIds || []).filter((id) => id !== projectId);
  const batch = db().batch();
  batch.set(projectRef(userId, projectId), { memoryIds, updatedAt: timestamp() }, { merge: true });
  batch.set(memoriesRef(userId).doc(memoryId), { projectIds, updatedAt: timestamp() }, { merge: true });
  await batch.commit();
  return true;
}

async function listProjectMemories(userId, projectId) {
  const project = await getProject(userId, projectId);
  if (!project) return [];
  const ids = asArray(project.memoryIds).slice(0, 100);
  const docs = await Promise.all(ids.map((id) => memoriesRef(userId).doc(id).get()));
  return docs.filter((doc) => doc.exists).map((doc) => ({ id: doc.id, ...doc.data() }));
}

function scoreProjectMemory(project, memory) {
  let score = 0;
  const reasons = [];
  const projectTags = new Set(asArray(project.tags).map(normalize));
  const projectConcepts = new Set(asArray(project.concepts).map(normalize));
  const suggestedNames = new Set([project.name, ...(memory.ai?.suggestedProjects || [])].map(normalize));
  const memoryTags = asArray(memory.ai?.tags?.length ? memory.ai.tags : memory.tags);
  const memoryConcepts = asArray(memory.ai?.concepts?.length ? memory.ai.concepts : memory.concepts);
  const memoryEntities = asArray(memory.ai?.entities?.length ? memory.ai.entities : memory.entities);

  const tag = memoryTags.find((value) => projectTags.has(normalize(value)));
  if (tag) {
    score += 2;
    reasons.push(`Shared tag: ${tag}`);
  }
  const concept = memoryConcepts.find((value) => projectConcepts.has(normalize(value)));
  if (concept) {
    score += 3;
    reasons.push(`Shared concept: ${concept}`);
  }
  const entity = memoryEntities.find((value) => normalize(value) === normalize(project.name));
  if (entity) {
    score += 2;
    reasons.push(`Mentions ${entity}`);
  }
  if (suggestedNames.has(normalize(project.name))) {
    score += 3;
    reasons.push('AI suggested this project');
  }
  if (normalize(memory.category) && projectTags.has(normalize(memory.category))) {
    score += 1;
    reasons.push(`Same category: ${memory.category}`);
  }
  return { score, reasons: reasons.slice(0, 3) };
}

async function suggestMemoriesForProject(userId, projectId, options = {}) {
  const project = await getProject(userId, projectId);
  if (!project) return [];
  const linked = new Set(asArray(project.memoryIds));
  const limit = Math.max(1, Math.min(20, Number(options.limit || 8)));
  const snapshot = await memoriesRef(userId).orderBy('createdAt', 'desc').limit(200).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((memory) => !linked.has(memory.id) && memory.isArchived !== true)
    .map((memory) => ({ memory, ...scoreProjectMemory(project, memory) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function generateProjectSummary(userId, projectId, options = {}) {
  const project = await getProject(userId, projectId);
  if (!project) return null;
  if (!options.forceRegenerate && project.ai?.status === 'generated' && project.ai?.processingVersion === aiConfig().processingVersion) {
    return project;
  }
  const memories = await listProjectMemories(userId, projectId);
  if (!memories.length) {
    const ai = {
      status: 'generated',
      summary: 'No linked memories yet. Add a few saves to build this project brief.',
      mainThemes: [],
      openQuestions: [],
      nextActions: ['Add related memories to this project.'],
      relatedMemoryIds: [],
      suggestedMemoryIds: [],
      modelUsed: 'deterministic',
      processingVersion: aiConfig().processingVersion,
      generatedAt: timestamp(),
    };
    await updateProject(userId, projectId, { summary: ai.summary, ai });
    return getProject(userId, projectId);
  }

  const fallback = {
    summary: `Based on ${memories.length} linked saved ${memories.length === 1 ? 'memory' : 'memories'}, this project is ready for review.`,
    mainThemes: Array.from(new Set(memories.flatMap((memory) => asArray(memory.concepts?.length ? memory.concepts : memory.tags)))).slice(0, 6),
    openQuestions: [],
    nextActions: ['Review linked memories and choose the next concrete step.'],
    relatedMemoryIds: memories.map((memory) => memory.id).slice(0, 20),
    suggestedMemoryIds: [],
    modelUsed: 'deterministic',
    processingVersion: aiConfig().processingVersion,
    status: 'generated',
    generatedAt: timestamp(),
  };

  let ai = fallback;
  if (aiConfig().openaiApiKey && aiConfig().provider === 'openai') {
    const limitInfo = await canProcessAIMemory(userId, 1, options);
    if (!limitInfo.allowed) {
      ai = { ...fallback, status: 'limit_reached', errorMessage: 'AI_DAILY_LIMIT_REACHED' };
      await updateProject(userId, projectId, { summary: ai.summary, ai });
      return getProject(userId, projectId);
    }

    try {
      ai = {
        ...await createAIProvider().generateProjectSummary({
          project,
          memories: memories.map((memory) => ({
            id: memory.id,
            title: memory.title,
            summary: memory.ai?.summary || memory.summary || String(memory.rawText || memory.content || '').slice(0, 700),
            tags: memory.ai?.tags?.length ? memory.ai.tags : memory.tags || [],
            concepts: memory.ai?.concepts?.length ? memory.ai.concepts : memory.concepts || [],
            entities: memory.ai?.entities?.length ? memory.ai.entities : memory.entities || [],
          })),
        }),
        generatedAt: timestamp(),
      };
      await recordAIProcessingUsage(userId, { projectSummaryCount: 1 }, options).catch((usageError) => {
        console.warn(`[ai-usage] failed to record project summary user=${userId}: ${usageError.message}`);
      });
    } catch (error) {
      await recordAIProcessingUsage(userId, { failedCount: 1 }, options).catch((usageError) => {
        console.warn(`[ai-usage] failed to record failed project summary user=${userId}: ${usageError.message}`);
      });
      ai = { ...fallback, status: 'failed', errorMessage: error.message || 'Project summary failed.' };
    }
  }
  await updateProject(userId, projectId, { summary: ai.summary, ai });
  return getProject(userId, projectId);
}

module.exports = {
  archiveProject,
  assignMemoryToProject,
  createProject,
  generateProjectSummary,
  getProject,
  listProjectMemories,
  listProjects,
  removeMemoryFromProject,
  suggestMemoriesForProject,
  updateProject,
};
