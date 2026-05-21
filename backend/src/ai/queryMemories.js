const admin = require('firebase-admin');

const { aiConfig } = require('./aiConfig');
const { createAIProvider } = require('./aiProvider');
const { listUserChunks } = require('./memoryChunks');

const RETRIEVAL_MODE = 'keyword-semantic-lite';
const HYBRID_RETRIEVAL_MODE = 'hybrid-embedding';
const DEFAULT_LIMIT = 6;
const MAX_MEMORY_SCAN = 500;
const MIN_KEYWORD_RELEVANCE_SCORE = 5;
const MIN_HYBRID_FINAL_SCORE = 22;
const HYBRID_WEIGHTS = {
  semantic: 0.5,
  keyword: 0.3,
  metadata: 0.15,
  recencyOrImportance: 0.05,
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'ask',
  'at',
  'about',
  'be',
  'but',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'have',
  'how',
  'i',
  'in',
  'is',
  'it',
  'know',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with',
  'you',
]);

function normalize(value = '') {
  return String(value || '').toLowerCase().trim();
}

function compactWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function tokenize(value = '') {
  return Array.from(new Set(
    normalize(value)
      .replace(/[^a-z0-9@#\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^#+/, ''))
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  ));
}

function rareTokens(tokens = []) {
  return tokens.filter((token) => token.length >= 5 || /[0-9@#]/.test(token));
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

function memoryText(memory) {
  return compactWhitespace(
    memory.cleanText
    || memory.rawText
    || memory.content
    || memory.body
    || memory.text
    || '',
  );
}

function memorySummary(memory) {
  return compactWhitespace(memory.ai?.summary || memory.summary || '');
}

function memorySourceUrl(memory) {
  return memory.sourceUrl || memory.sourceURL || memory.source_url || undefined;
}

function memoryAuthor(memory) {
  return memory.author?.username
    || memory.author?.displayName
    || memory.sourceUsername
    || memory.authorUsername
    || '';
}

function normalizeMemory(memory = {}) {
  const ai = memory.ai || {};
  return {
    id: String(memory.id || ''),
    title: compactWhitespace(memory.title || 'Untitled memory'),
    rawText: memoryText(memory),
    summary: memorySummary(memory),
    sourceUrl: memorySourceUrl(memory),
    sourceType: memory.sourceType || memory.source_type || memory.type || 'unknown',
    sourceId: memory.sourceId || memory.externalId,
    category: memory.category || ai.category || 'General',
    tags: asArray(ai.tags?.length ? ai.tags : memory.tags),
    concepts: asArray(ai.concepts?.length ? ai.concepts : memory.concepts),
    entities: asArray(ai.entities?.length ? ai.entities : memory.entities),
    projectIds: asArray(memory.projectIds),
    author: memoryAuthor(memory),
    createdAt: timestampToIso(memory.createdAt),
    capturedAt: timestampToIso(memory.capturedAt || memory.sourceDate || memory.postDate || memory.createdAt),
    isArchived: memory.isArchived === true,
  };
}

function normalizeProject(projectId, project = {}) {
  if (!project) return null;
  return {
    id: String(project.id || projectId || ''),
    userId: project.userId ? String(project.userId) : undefined,
    title: compactWhitespace(project.title || project.name || 'Project'),
    memoryIds: asArray(project.memoryIds),
  };
}

async function listUserMemories(userId, options = {}) {
  if (admin.apps.length) {
    const snapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('memories')
      .orderBy('createdAt', 'desc')
      .limit(MAX_MEMORY_SCAN)
      .get();

    return snapshot.docs.map((doc) => normalizeMemory({ id: doc.id, ...doc.data() }));
  }

  const sources = options.store?.listSources ? await options.store.listSources(userId) : [];
  return sources.map((source) => normalizeMemory({
    ...source,
    id: source.id,
    sourceType: source.sourceType || source.source_type,
    rawText: source.rawText || source.body,
    sourceUrl: source.sourceUrl || source.source_url,
    capturedAt: source.postDate || source.createdAt,
  }));
}

async function getUserProject(userId, projectId, options = {}) {
  if (!projectId) return null;

  if (options.project) {
    const project = normalizeProject(projectId, options.project);
    if (project.id !== String(projectId)) return null;
    if (project.userId && project.userId !== String(userId)) return null;
    return project;
  }

  if (admin.apps.length) {
    const doc = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId)
      .get();

    return doc.exists ? normalizeProject(projectId, { id: doc.id, ...doc.data() }) : null;
  }

  if (options.store?.getProject) {
    const project = await options.store.getProject(userId, projectId);
    return normalizeProject(projectId, project);
  }

  return null;
}

function fieldIncludes(field, needle) {
  return normalize(field).includes(needle);
}

function firstSharedLabel(values, tokens) {
  return values.find((value) => {
    const normalized = normalize(value);
    return tokens.some((token) => normalized.includes(token));
  });
}

function scoreMemory(memory, question, tokens) {
  const phrase = normalize(question);
  let score = 0;
  const reasons = [];
  const title = normalize(memory.title);
  const summary = normalize(memory.summary);
  const text = normalize(memory.rawText);
  const metadata = normalize([
    memory.sourceType,
    memory.sourceId,
    memory.sourceUrl,
    memory.author,
    memory.category,
  ].filter(Boolean).join(' '));
  const tokenPhrase = tokens.join(' ');
  const rare = rareTokens(tokens);

  if (phrase.length >= 8) {
    if (title.includes(phrase)) {
      score += 16;
      reasons.push('Matched title phrase');
    }
    if (summary.includes(phrase)) {
      score += 12;
      reasons.push('Matched summary phrase');
    }
    if (text.includes(phrase)) {
      score += 10;
      reasons.push('Matched memory text phrase');
    }
  }

  if (tokenPhrase.length >= 5) {
    if (title.includes(tokenPhrase)) {
      score += 10;
      reasons.push('Matched title terms');
    }
    if (summary.includes(tokenPhrase)) {
      score += 7;
      reasons.push('Matched summary terms');
    }
    if (text.includes(tokenPhrase)) {
      score += 6;
      reasons.push('Matched memory text terms');
    }
  }

  const concept = firstSharedLabel(memory.concepts, tokens);
  if (concept) {
    score += 12;
    reasons.push(`Matched concept: ${concept}`);
  }

  const entity = firstSharedLabel(memory.entities, tokens);
  if (entity) {
    score += 12;
    reasons.push(`Matched entity: ${entity}`);
  }

  const tag = firstSharedLabel(memory.tags, tokens);
  if (tag) {
    score += 9;
    reasons.push(`Matched tag: ${tag}`);
  }

  if (tokens.some((token) => normalize(memory.category).includes(token))) {
    score += 6;
    reasons.push(`Matched category: ${memory.category}`);
  }

  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    if (summary.includes(token)) score += 3;
    if (text.includes(token)) score += 2;
    if (metadata.includes(token)) score += 2;
  }

  for (const token of rare) {
    const exactMetadataHit = [
      ...memory.tags,
      ...memory.concepts,
      ...memory.entities,
      memory.category,
      memory.sourceType,
      memory.sourceId,
      memory.author,
    ].filter(Boolean).some((value) => normalize(value) === token);
    if (exactMetadataHit) {
      score += 8;
      reasons.push(`Matched exact term: ${token}`);
    }
  }

  if (score > 0 && !reasons.length) reasons.push('Matched saved memory text');

  return {
    score,
    reasons: Array.from(new Set(reasons)).slice(0, 3),
  };
}

function bestSnippet(memory, questionTokens, maxLength = 360) {
  const candidates = [
    memory.summary,
    memory.rawText,
    memory.title,
    [...memory.tags, ...memory.concepts, ...memory.entities].join(', '),
  ].map(compactWhitespace).filter(Boolean);
  const fallback = candidates[0] || memory.title || 'Saved memory';

  const matchCandidate = candidates.find((candidate) => {
    const normalized = normalize(candidate);
    return questionTokens.some((token) => normalized.includes(token));
  }) || fallback;

  if (matchCandidate.length <= maxLength) return matchCandidate;

  const normalized = normalize(matchCandidate);
  const firstToken = questionTokens.find((token) => normalized.includes(token));
  const matchIndex = firstToken ? normalized.indexOf(firstToken) : 0;
  const start = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const end = Math.min(matchCandidate.length, start + maxLength);
  const snippet = matchCandidate.slice(start, end).trim();
  return `${start > 0 ? '...' : ''}${snippet}${end < matchCandidate.length ? '...' : ''}`;
}

function projectMemoryIds(project) {
  return new Set(asArray(project?.memoryIds));
}

function isProjectLinked(memory, projectId, memoryIds = new Set()) {
  return memoryIds.has(memory.id) || memory.projectIds.includes(String(projectId));
}

function retrieveRelevantMemories(memories, question, options = {}) {
  const tokens = tokenize(question);
  const limit = Math.max(1, Math.min(12, Number(options.limit || DEFAULT_LIMIT)));
  const projectId = options.projectId ? String(options.projectId) : null;
  const memoryIds = projectMemoryIds(options.project);
  if (!tokens.length) return [];

  return memories
    .filter((memory) => memory.id && !memory.isArchived)
    .map((memory) => {
      const result = scoreMemory(memory, question, tokens);
      const linkedToProject = projectId ? isProjectLinked(memory, projectId, memoryIds) : false;
      const relevanceScore = result.score > 0 && linkedToProject ? result.score + 8 : result.score;
      const reasons = linkedToProject && result.score > 0
        ? ['Linked to project', ...result.reasons]
        : result.reasons;
      return {
        ...memory,
        relevanceScore,
        relevanceReason: reasons.join('; ') || 'Matched saved memory',
        snippet: bestSnippet(memory, tokens),
      };
    })
    .filter((memory) => memory.relevanceScore > 0)
    .filter((memory) => memory.relevanceScore >= Number(options.minKeywordScore || MIN_KEYWORD_RELEVANCE_SCORE))
    .sort((a, b) => {
      if (b.relevanceScore === a.relevanceScore) {
        return String(b.capturedAt || b.createdAt || '').localeCompare(String(a.capturedAt || a.createdAt || ''));
      }
      return b.relevanceScore - a.relevanceScore;
    })
    .slice(0, limit);
}

function dotProduct(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Number(a[index] || 0) * Number(b[index] || 0);
  return total;
}

function vectorMagnitude(vector = []) {
  return Math.sqrt(vector.reduce((sum, value) => sum + Number(value || 0) ** 2, 0));
}

function cosineSimilarity(a = [], b = []) {
  const denominator = vectorMagnitude(a) * vectorMagnitude(b);
  return denominator ? dotProduct(a, b) / denominator : 0;
}

function normalizeScore(score, max) {
  return score && max ? Math.max(0, Math.min(1, score / max)) : 0;
}

function metadataScore(memory, questionTokens, options = {}) {
  let score = 0;
  if (firstSharedLabel(memory.concepts, questionTokens)) score += 0.35;
  if (firstSharedLabel(memory.entities, questionTokens)) score += 0.3;
  if (firstSharedLabel(memory.tags, questionTokens)) score += 0.2;
  if (questionTokens.some((token) => normalize(memory.category).includes(token))) score += 0.1;
  if (options.projectId && isProjectLinked(memory, options.projectId, projectMemoryIds(options.project))) score += 0.2;
  return Math.min(1, score);
}

function recencyOrImportanceScore(memory) {
  const importance = Number(memory.importanceScore ?? memory.ai?.importanceScore);
  if (Number.isFinite(importance) && importance > 0) return Math.max(0, Math.min(1, importance));
  const iso = memory.capturedAt || memory.createdAt;
  const ts = iso ? new Date(iso).getTime() : 0;
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const ageDays = Math.max(0, (Date.now() - ts) / 86400000);
  return Math.max(0, Math.min(1, 1 - (ageDays / 365)));
}

async function embedQuestion(question, options = {}) {
  if (options.embeddingProvider?.embedText) return options.embeddingProvider.embedText(question);
  if (options.aiProvider?.embedText) return options.aiProvider.embedText(question);
  const config = aiConfig();
  if (!config.openaiApiKey || config.provider !== 'openai') return null;
  return createAIProvider(config).embedText(question);
}

async function retrieveHybridMemories(memories, question, options = {}) {
  const chunks = await listUserChunks(options.userId, options).catch((error) => {
    console.warn(`[brain-query] chunk lookup failed user=${options.userId}: ${error.message}`);
    return [];
  });
  if (!chunks.length) return [];

  const queryEmbedding = await embedQuestion(question, options).catch((error) => {
    console.warn(`[brain-query] question embedding failed: ${error.message}`);
    return null;
  });
  if (!Array.isArray(queryEmbedding) || !queryEmbedding.length) return [];

  const tokens = tokenize(question);
  const limit = Math.max(1, Math.min(12, Number(options.limit || DEFAULT_LIMIT)));
  const memoriesById = new Map(memories.map((memory) => [memory.id, memory]));
  const projectId = options.projectId ? String(options.projectId) : null;
  const projectMemorySet = projectMemoryIds(options.project);
  const keywordResults = retrieveRelevantMemories(memories, question, {
    limit: Math.max(limit, 20),
    projectId,
    project: options.project,
  });
  const keywordById = new Map(keywordResults.map((memory) => [memory.id, memory]));
  const maxKeyword = Math.max(...keywordResults.map((memory) => memory.relevanceScore), 1);
  const byMemory = new Map();

  for (const chunk of chunks) {
    if (!Array.isArray(chunk.embedding) || chunk.embeddingStatus !== 'complete') continue;
    const memoryId = String(chunk.memoryId || chunk.memory?.id || '');
    const memory = memoriesById.get(memoryId);
    if (!memory || memory.isArchived) continue;
    if (projectId && !isProjectLinked(memory, projectId, projectMemorySet)) continue;
    const semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding));
    if (semanticScore < Number(options.minSemanticScore || 0.18)) continue;
    const keyword = keywordById.get(memoryId);
    const keywordScore = normalizeScore(keyword?.relevanceScore || scoreMemory(memory, question, tokens).score, maxKeyword);
    const meta = metadataScore(memory, tokens, { projectId, project: options.project });
    const recency = recencyOrImportanceScore(memory);
    const finalScore = (semanticScore * HYBRID_WEIGHTS.semantic)
      + (keywordScore * HYBRID_WEIGHTS.keyword)
      + (meta * HYBRID_WEIGHTS.metadata)
      + (recency * HYBRID_WEIGHTS.recencyOrImportance);
    const normalizedFinalScore = Number((finalScore * 100).toFixed(2));
    if (normalizedFinalScore < Number(options.minHybridScore || MIN_HYBRID_FINAL_SCORE)) continue;
    const previous = byMemory.get(memoryId);
    if (!previous || normalizedFinalScore > previous.relevanceScore) {
      const reasons = [
        'Matched embedded memory chunk',
        keyword?.relevanceReason,
        meta > 0 ? 'Matched memory metadata' : null,
        projectId ? 'Linked to project' : null,
      ].filter(Boolean);
      byMemory.set(memoryId, {
        ...memory,
        relevanceScore: normalizedFinalScore,
        semanticScore,
        keywordScore,
        metadataScore: meta,
        recencyOrImportanceScore: recency,
        relevanceReason: Array.from(new Set(reasons)).slice(0, 4).join('; '),
        snippet: bestSnippet({ ...memory, summary: chunk.chunkText, rawText: chunk.chunkText }, tokens),
        matchedChunkId: chunk.chunkId,
      });
    }
  }

  return Array.from(byMemory.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

async function traceQuestionRetrieval(userId, question, options = {}) {
  const memories = await listUserMemories(userId, options);
  const project = options.projectId ? await getUserProject(userId, String(options.projectId), options) : null;
  const projectIds = projectMemoryIds(project);
  const scopedMemories = project
    ? memories.filter((memory) => isProjectLinked(memory, project.id, projectIds))
    : memories;
  const tokens = tokenize(question);
  const limit = Math.max(1, Math.min(12, Number(options.limit || DEFAULT_LIMIT)));

  const keywordCandidates = retrieveRelevantMemories(scopedMemories, question, {
    limit: Math.max(limit, 50),
    projectId: project?.id,
    project,
  });
  const keywordById = new Map(keywordCandidates.map((memory) => [memory.id, memory]));
  const maxKeyword = Math.max(...keywordCandidates.map((memory) => memory.relevanceScore), 1);

  const chunks = await listUserChunks(userId, options).catch(() => []);
  const queryEmbedding = chunks.length ? await embedQuestion(question, options).catch(() => null) : null;
  const scopedMemoryIds = new Set(scopedMemories.map((memory) => memory.id));
  const memoriesById = new Map(scopedMemories.map((memory) => [memory.id, memory]));
  const matchedChunks = [];
  const byMemory = new Map();

  if (Array.isArray(queryEmbedding) && queryEmbedding.length) {
    for (const chunk of chunks) {
      const memoryId = String(chunk.memoryId || chunk.memory?.id || '');
      if (!scopedMemoryIds.has(memoryId)) continue;
      if (!Array.isArray(chunk.embedding) || chunk.embeddingStatus !== 'complete') continue;
      const memory = memoriesById.get(memoryId);
      if (!memory || memory.isArchived) continue;
      const semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding));
      if (semanticScore < Number(options.minSemanticScore || 0.18)) continue;
      const keyword = keywordById.get(memoryId);
      const keywordScore = normalizeScore(keyword?.relevanceScore || scoreMemory(memory, question, tokens).score, maxKeyword);
      const meta = metadataScore(memory, tokens, { projectId: project?.id, project });
      const recency = recencyOrImportanceScore(memory);
      const finalScore = (semanticScore * HYBRID_WEIGHTS.semantic)
        + (keywordScore * HYBRID_WEIGHTS.keyword)
        + (meta * HYBRID_WEIGHTS.metadata)
        + (recency * HYBRID_WEIGHTS.recencyOrImportance);
      const normalizedFinalScore = Number((finalScore * 100).toFixed(2));
      if (normalizedFinalScore < Number(options.minHybridScore || MIN_HYBRID_FINAL_SCORE)) continue;
      const reasons = [
        'Matched embedded memory chunk',
        keyword?.relevanceReason,
        meta > 0 ? 'Matched memory metadata' : null,
        project ? 'Linked to project' : null,
      ].filter(Boolean);
      const match = {
        memoryId,
        title: memory.title,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        chunkTextPreview: compactWhitespace(chunk.chunkText).slice(0, 280),
        semanticScore: Number(semanticScore.toFixed(4)),
        keywordScore: Number(keywordScore.toFixed(4)),
        metadataScore: Number(meta.toFixed(4)),
        recencyOrImportanceScore: Number(recency.toFixed(4)),
        finalScore: normalizedFinalScore,
        relevanceReason: Array.from(new Set(reasons)).slice(0, 4).join('; '),
        snippet: bestSnippet({ ...memory, summary: chunk.chunkText, rawText: chunk.chunkText }, tokens),
      };
      matchedChunks.push(match);
      const previous = byMemory.get(memoryId);
      if (!previous || match.finalScore > previous.relevanceScore) {
        byMemory.set(memoryId, {
          ...memory,
          relevanceScore: match.finalScore,
          semanticScore: match.semanticScore,
          keywordScore: match.keywordScore,
          metadataScore: match.metadataScore,
          recencyOrImportanceScore: match.recencyOrImportanceScore,
          relevanceReason: match.relevanceReason,
          snippet: match.snippet,
          matchedChunkId: match.chunkId,
        });
      }
    }
  }

  let retrievalMode = RETRIEVAL_MODE;
  let fallbackUsed = false;
  let returned = Array.from(byMemory.values()).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  if (returned.length) retrievalMode = HYBRID_RETRIEVAL_MODE;
  if (!returned.length) {
    fallbackUsed = true;
    returned = keywordCandidates.slice(0, limit);
  }

  return {
    question,
    retrievalMode,
    fallbackUsed,
    scope: scopePayload(project || (options.projectId ? { id: String(options.projectId), title: undefined } : null)),
    candidateCount: scopedMemories.filter((memory) => memory.id && !memory.isArchived).length,
    chunkCandidateCount: chunks.filter((chunk) => scopedMemoryIds.has(String(chunk.memoryId || chunk.memory?.id || ''))).length,
    matchedChunkCount: matchedChunks.length,
    keywordCandidateCount: keywordCandidates.length,
    returnedCount: returned.length,
    matchedChunks: matchedChunks.sort((a, b) => b.finalScore - a.finalScore).slice(0, 20),
    candidates: returned.map((memory) => ({
      memoryId: memory.id,
      title: memory.title,
      matchedChunkId: memory.matchedChunkId,
      semanticScore: memory.semanticScore,
      keywordScore: memory.keywordScore,
      metadataScore: memory.metadataScore,
      recencyOrImportanceScore: memory.recencyOrImportanceScore,
      finalScore: memory.relevanceScore,
      relevanceReason: memory.relevanceReason,
      snippet: memory.snippet,
    })),
    citedMemoryIds: returned.map((memory) => memory.id),
    sources: returned.map(sourcePayload),
  };
}

function sourcePayload(memory) {
  return {
    memoryId: memory.id,
    title: memory.title,
    snippet: memory.snippet,
    sourceUrl: memory.sourceUrl,
    createdAt: memory.createdAt,
    capturedAt: memory.capturedAt,
    relevanceReason: memory.relevanceReason,
  };
}

function confidenceFor(retrieved) {
  if (!retrieved.length) return 'low';
  const top = retrieved[0].relevanceScore;
  if (top >= 24 || (top >= 16 && retrieved.length >= 2)) return 'high';
  if (top >= 10) return 'medium';
  return 'low';
}

function scopePayload(project) {
  if (!project) return undefined;
  return {
    type: 'project',
    projectId: project.id,
    projectTitle: project.title,
  };
}

function fallbackAnswer(question, retrieved, options = {}) {
  if (!retrieved.length) {
    return {
      answer: options.project
        ? 'Nomi couldn’t find enough saved context in this project to answer that yet.'
        : `I do not have enough saved context to answer "${question}" yet.`,
      confidence: 'low',
    };
  }

  const lines = retrieved.slice(0, 3).map((memory, index) => {
    const citation = `[${index + 1}]`;
    return `${citation} ${memory.title}: ${memory.snippet}`;
  });

  return {
    answer: [
      'Based on your saved memories, these are the most relevant notes I found:',
      ...lines,
    ].join('\n'),
    confidence: confidenceFor(retrieved),
  };
}

function contextForAI(retrieved) {
  return retrieved.map((memory, index) => ({
    citation: `[${index + 1}]`,
    memoryId: memory.id,
    title: memory.title,
    snippet: memory.snippet,
    sourceType: memory.sourceType,
    sourceUrl: memory.sourceUrl,
    category: memory.category,
    tags: memory.tags,
    concepts: memory.concepts,
    entities: memory.entities,
    capturedAt: memory.capturedAt,
  }));
}

async function answerQuestionFromMemories(userId, question, options = {}) {
  const memories = await listUserMemories(userId, options);
  const project = options.projectId ? await getUserProject(userId, String(options.projectId), options) : null;
  if (options.projectId && !project) {
    const scope = scopePayload({ id: String(options.projectId), title: undefined });
    return {
      ...fallbackAnswer(question, [], { project: true }),
      sources: [],
      retrievalMode: RETRIEVAL_MODE,
      scope,
    };
  }

  const projectIds = projectMemoryIds(project);
  const scopedMemories = project
    ? memories.filter((memory) => isProjectLinked(memory, project.id, projectIds))
    : memories;
  let retrievalMode = RETRIEVAL_MODE;
  let retrieved = await retrieveHybridMemories(scopedMemories, question, {
    ...options,
    userId,
    limit: options.limit,
    projectId: project?.id,
    project,
  });
  if (retrieved.length) retrievalMode = HYBRID_RETRIEVAL_MODE;

  if (!retrieved.length) retrieved = retrieveRelevantMemories(scopedMemories, question, {
    limit: options.limit,
    projectId: project?.id,
    project,
  });

  if (project && !retrieved.length && options.allowGlobalFallback === true) {
    retrieved = await retrieveHybridMemories(memories, question, { ...options, userId, limit: options.limit });
    if (retrieved.length) retrievalMode = HYBRID_RETRIEVAL_MODE;
    if (!retrieved.length) retrieved = retrieveRelevantMemories(memories, question, { limit: options.limit });
  }

  const sources = retrieved.map(sourcePayload);
  const scope = scopePayload(project || (options.projectId ? { id: String(options.projectId), title: undefined } : null));

  if (!retrieved.length) {
    return {
      ...fallbackAnswer(question, retrieved, { project: options.projectId ? true : false }),
      sources,
      retrievalMode,
      ...(scope ? { scope } : {}),
    };
  }

  const config = aiConfig();
  if (!config.openaiApiKey || config.provider !== 'openai') {
    return {
      ...fallbackAnswer(question, retrieved),
      sources,
      retrievalMode,
      ...(scope ? { scope } : {}),
    };
  }

  try {
    const ai = await createAIProvider(config).answerMemoryQuestion({
      question,
      memories: contextForAI(retrieved),
    });

    return {
      answer: ai.answer || fallbackAnswer(question, retrieved).answer,
      sources,
      confidence: ai.confidence || confidenceFor(retrieved),
      retrievalMode,
      ...(scope ? { scope } : {}),
      relatedMemoryIds: ai.relatedMemoryIds || [],
    };
  } catch (error) {
    console.warn(`[brain-query] AI synthesis failed user=${userId}: ${error.message}`);
    return {
      ...fallbackAnswer(question, retrieved),
      sources,
      confidence: 'low',
      retrievalMode,
      ...(scope ? { scope } : {}),
      synthesisError: error.message || 'AI synthesis failed.',
    };
  }
}

module.exports = {
  RETRIEVAL_MODE,
  HYBRID_RETRIEVAL_MODE,
  HYBRID_WEIGHTS,
  MIN_HYBRID_FINAL_SCORE,
  MIN_KEYWORD_RELEVANCE_SCORE,
  answerQuestionFromMemories,
  cosineSimilarity,
  getUserProject,
  listUserMemories,
  retrieveHybridMemories,
  retrieveRelevantMemories,
  traceQuestionRetrieval,
  tokenize,
};
