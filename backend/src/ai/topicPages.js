const crypto = require('crypto');
const admin = require('firebase-admin');

const { aiConfig } = require('./aiConfig');
const { createAIProvider } = require('./aiProvider');
const { listUserMemories } = require('./queryMemories');

const TOPIC_VERSION = 'v1';
const GENERIC_TOPIC_LABELS = new Set([
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
  'manual note',
  'manual_note',
  'note',
  'notes',
  'other',
  'post',
  'posts',
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
  'x bookmark',
  'x_bookmark',
  'xpost',
  'xposts',
]);

const LOW_SIGNAL_TOPIC_LABELS = new Set([
  'after',
  'all',
  'also',
  'another',
  'any',
  'back',
  'because',
  'before',
  'being',
  'built',
  'could',
  'doing',
  'done',
  'every',
  'exact',
  'first',
  'fucking',
  'getting',
  'going',
  'good',
  'here',
  'just',
  'literally',
  'make',
  'makes',
  'more',
  'much',
  'need',
  'only',
  'people',
  'really',
  'shared',
  'small',
  'their',
  'thing',
  'things',
  'this',
  'very',
  'when',
  'where',
  'work',
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

function slugify(value = '') {
  const slug = normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'topic';
}

function displayTopicTitle(value = '') {
  const text = String(value || 'Topic').trim();
  const known = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    codex: 'Codex',
    market: 'Market',
    mobile: 'Mobile',
    openai: 'OpenAI',
  };
  const normalized = normalize(text);
  if (known[normalized]) return known[normalized];
  return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function isGenericTopicLabel(value = '') {
  const label = normalize(value).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return !label || GENERIC_TOPIC_LABELS.has(label) || LOW_SIGNAL_TOPIC_LABELS.has(label);
}

function meaningfulTopicTags(tags = []) {
  return asArray(tags)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length >= 3 && !isGenericTopicLabel(tag));
}

function mostCommon(values, limit = 8) {
  const counts = new Map();
  for (const value of values.map(String).map((item) => item.trim()).filter(Boolean)) {
    const key = normalize(value);
    if (!key) continue;
    const current = counts.get(key) || { value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit);
}

function memoryEvidenceText(memory = {}) {
  return String(memory.summary || memory.rawText || memory.title || '').replace(/\s+/g, ' ').trim();
}

function ideaText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') return String(value.idea || value.text || value.title || '').trim();
  return '';
}

function ideaMemoryIds(value) {
  if (!value || typeof value !== 'object') return [];
  return asArray(value.supportingMemoryIds || value.memoryIds || value.relatedMemoryIds || value.sources);
}

function fallbackKeyIdeas(title, memories) {
  return memories
    .map((memory) => ({
      idea: memoryEvidenceText(memory).slice(0, 180),
      supportingMemoryIds: [memory.id],
    }))
    .filter((idea) => idea.idea && idea.supportingMemoryIds[0])
    .slice(0, 6);
}

function groundedKeyIdeasFor(synthesis = {}, memories = [], title = '') {
  const allowedIds = new Set(memories.map((memory) => String(memory.id)).filter(Boolean));
  const rawIdeas = Array.isArray(synthesis.keyIdeas) && synthesis.keyIdeas.length
    ? synthesis.keyIdeas
    : fallbackKeyIdeas(title, memories);
  const grounded = [];
  const seen = new Set();

  for (const rawIdea of rawIdeas) {
    const idea = ideaText(rawIdea).replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!idea || seen.has(normalize(idea))) continue;

    let supportingMemoryIds = ideaMemoryIds(rawIdea)
      .map(String)
      .filter((id) => allowedIds.has(id));

    if (!supportingMemoryIds.length && typeof rawIdea === 'string') {
      const matchingMemory = memories.find((memory) => {
        const evidence = normalize(memoryEvidenceText(memory));
        const normalizedIdea = normalize(idea);
        return evidence && (evidence.includes(normalizedIdea) || normalizedIdea.includes(evidence.slice(0, 80)));
      });
      if (matchingMemory?.id) supportingMemoryIds = [String(matchingMemory.id)];
    }

    if (!supportingMemoryIds.length) continue;
    seen.add(normalize(idea));
    grounded.push({
      idea,
      supportingMemoryIds: Array.from(new Set(supportingMemoryIds)).slice(0, 6),
    });
  }

  return grounded.length ? grounded.slice(0, 8) : fallbackKeyIdeas(title, memories);
}

function groundedSummaryFor(title, groundedKeyIdeas = [], memories = []) {
  const ideas = groundedKeyIdeas
    .map((item) => item.idea)
    .filter(Boolean)
    .slice(0, 3)
    .map((idea) => idea.replace(/[.;:,\s]+$/g, ''));
  if (!ideas.length) {
    return `This topic is grounded in ${memories.length} saved memories about ${title}.`;
  }
  return `Across ${memories.length} saved memories, ${title} includes these grounded themes: ${ideas.join('; ')}.`;
}

function topicIdFor(userId, slug) {
  return crypto.createHash('sha1').update(`${userId}:${slug}`).digest('hex').slice(0, 24);
}

function clusterMemories(memories, options = {}) {
  const minMemories = Math.max(2, Number(options.minMemories || 3));
  const buckets = new Map();
  for (const memory of memories.filter((item) => item.id && item.isArchived !== true)) {
    const labels = [
      ...asArray(memory.concepts).map((value) => `concept:${value}`),
      ...asArray(memory.entities).map((value) => `entity:${value}`),
      ...meaningfulTopicTags(memory.tags).map((value) => `tag:${value}`),
      ...asArray(memory.projectIds).map((value) => `project:${value}`),
    ].filter(Boolean);
    for (const label of labels) {
      const bucketLabel = label.split(':').slice(1).join(':');
      if (isGenericTopicLabel(bucketLabel)) continue;
      const key = normalize(label);
      if (!buckets.has(key)) buckets.set(key, { label: bucketLabel, memories: [] });
      buckets.get(key).memories.push(memory);
    }
  }

  const bySignature = new Map();
  for (const bucket of buckets.values()) {
    const unique = Array.from(new Map(bucket.memories.map((memory) => [memory.id, memory])).values());
    if (unique.length < minMemories) continue;
    const signature = unique.map((memory) => memory.id).sort().join('|');
    const current = bySignature.get(signature);
    if (!current || unique.length > current.memories.length) {
      bySignature.set(signature, { title: bucket.label, memories: unique });
    }
  }
  return Array.from(bySignature.values())
    .sort((a, b) => b.memories.length - a.memories.length)
    .slice(0, Math.max(1, Math.min(50, Number(options.maxTopics || 20))));
}

function fallbackSynthesis(title, memories) {
  const concepts = mostCommon(memories.flatMap((memory) => asArray(memory.concepts)), 8).map((item) => item.value);
  const entities = mostCommon(memories.flatMap((memory) => asArray(memory.entities)), 8).map((item) => item.value);
  const keyIdeas = fallbackKeyIdeas(title, memories);
  return {
    title,
    summary: groundedSummaryFor(title, keyIdeas, memories),
    keyIdeas,
    openQuestions: [],
    possibleRelatedTopics: concepts.filter((concept) => normalize(concept) !== normalize(title)).slice(0, 6),
  };
}

async function synthesizeTopic(title, memories, options = {}) {
  if (options.aiProvider?.synthesizeTopicPage) {
    return options.aiProvider.synthesizeTopicPage({ title, memories });
  }
  const config = aiConfig();
  if (!config.openaiApiKey || config.provider !== 'openai') return fallbackSynthesis(title, memories);
  try {
    return await createAIProvider(config).synthesizeTopicPage({ title, memories });
  } catch (error) {
    return { ...fallbackSynthesis(title, memories), synthesisStatus: 'failed', errorMessage: error.message || 'Topic synthesis failed.' };
  }
}

function buildTopicPage(userId, cluster, synthesis = {}) {
  const title = displayTopicTitle(cluster.title || synthesis.title || 'Topic');
  const slug = slugify(title);
  const memories = cluster.memories;
  const concepts = mostCommon(memories.flatMap((memory) => asArray(memory.concepts)), 12).map((item) => item.value);
  const entities = mostCommon(memories.flatMap((memory) => asArray(memory.entities)), 12).map((item) => item.value);
  const projects = mostCommon(memories.flatMap((memory) => asArray(memory.projectIds)), 12).map((item) => item.value);
  const keyIdeaCitations = groundedKeyIdeasFor(synthesis, memories, title);
  return {
    topicPageId: topicIdFor(userId, slug),
    userId,
    title,
    slug,
    summary: groundedSummaryFor(title, keyIdeaCitations, memories),
    keyIdeas: keyIdeaCitations.map((item) => item.idea),
    keyIdeaCitations,
    openQuestions: asArray(synthesis.openQuestions),
    possibleRelatedTopics: asArray(synthesis.possibleRelatedTopics),
    relatedMemoryIds: memories.map((memory) => memory.id).slice(0, 50),
    relatedEdgeIds: asArray(cluster.relatedEdgeIds),
    backlinks: [],
    concepts,
    entities,
    projects,
    sourceCount: memories.length,
    generatedBy: 'nomi-topic-synthesis',
    version: TOPIC_VERSION,
    createdAt: timestampValue(),
    updatedAt: timestampValue(),
    lastSynthesizedAt: timestampValue(),
    synthesisStatus: synthesis.synthesisStatus || 'complete',
    retryCount: Number(synthesis.retryCount || 0),
    errorMessage: synthesis.errorMessage || null,
  };
}

async function writeTopicPages(userId, pages, options = {}) {
  if (options.store?.upsertTopicPages) return options.store.upsertTopicPages(userId, pages);
  if (!admin.apps.length) return pages;
  const batch = admin.firestore().batch();
  const collection = admin.firestore().collection('users').doc(userId).collection('topicPages');
  const nextIds = new Set(pages.map((page) => page.topicPageId));
  for (const page of pages) {
    batch.set(collection.doc(page.topicPageId), page, { merge: true });
  }
  if (options.deleteStale !== false) {
    const existing = await collection.where('generatedBy', '==', 'nomi-topic-synthesis').get();
    for (const doc of existing.docs) {
      if (!nextIds.has(doc.id)) batch.delete(doc.ref);
    }
  }
  await batch.commit();
  return pages;
}

async function backfillTopicPagesForUser(userId, options = {}) {
  const memories = options.memories || await listUserMemories(userId, options);
  const clusters = options.clusters || clusterMemories(memories, options);
  const pages = [];
  const seenSlugs = new Set();
  const limit = Math.max(1, Math.min(50, Number(options.limit || 10)));
  for (const cluster of clusters.slice(0, limit)) {
    const synthesis = await synthesizeTopic(cluster.title, cluster.memories, options);
    const page = buildTopicPage(userId, cluster, synthesis);
    if (seenSlugs.has(page.slug)) continue;
    seenSlugs.add(page.slug);
    pages.push(page);
  }
  await writeTopicPages(userId, pages, options);
  return { status: 'success', topicPageCount: pages.length, pages };
}

module.exports = {
  GENERIC_TOPIC_LABELS,
  LOW_SIGNAL_TOPIC_LABELS,
  backfillTopicPagesForUser,
  buildTopicPage,
  clusterMemories,
  isGenericTopicLabel,
  slugify,
};
