const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const { z } = require('zod');
const { createStore, newSource } = require('./store');
const { privacyPolicyPage, termsPage } = require('./legal');
const { aiConfig } = require('./ai/aiConfig');
const {
  extractCleanTextFromMemory,
  processMemoryForAI,
  processMemoryIds,
  processUnprocessedMemoriesForUser,
  processRecentImportedMemories,
} = require('./ai/processMemory');
const {
  getAIProcessingDailyUsage,
  getAIProcessingLimitForUser,
  getUserAIUsageTier,
  limitReachedPayload,
} = require('./ai/aiUsage');
const {
  dateKeyFor,
  generateDailyBriefForUser,
  getDailyBrief,
  listDailyBriefs,
} = require('./ai/dailyBriefs');
const {
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
} = require('./projects');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = jwtSecret();
const store = createStore();

app.use(cors());
app.use(express.json());

app.get('/privacy', (_req, res) => {
  res.type('html').send(privacyPolicyPage());
});

app.get('/terms', (_req, res) => {
  res.type('html').send(termsPage());
});

const EMAIL_AUTH_SCHEMA = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  intent: z.enum(['signin', 'signup']).optional(),
});

const ID_TOKEN_SCHEMA = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});

const INTERESTS_SCHEMA = z.object({
  interests: z.array(z.string()).default([]),
});

const TIER_SCHEMA = z.object({
  tier: z.string().min(1),
});

const ONBOARDING_SCHEMA = z.object({
  completed: z.boolean(),
});

const INGEST_SCHEMA = z.object({
  raw_text: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(['text', 'url', 'tweet', 'note', 'image', 'voice']).optional(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).max(12).optional(),
  authorUsername: z.string().min(1).optional(),
  postDate: z.string().min(1).optional(),
  links: z.array(z.object({
    url: z.string().min(1),
    displayUrl: z.string().optional(),
    title: z.string().optional(),
  })).max(12).optional(),
  media: z.array(z.object({
    type: z.string().min(1),
    url: z.string().optional(),
    previewImageUrl: z.string().optional(),
    altText: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    variants: z.array(z.object({
      url: z.string().min(1),
      contentType: z.string().optional(),
      bitRate: z.number().optional(),
    })).max(8).optional(),
  })).max(12).optional(),
  referencedPosts: z.array(z.object({
    id: z.string().min(1),
    referenceType: z.string().optional(),
    username: z.string().optional(),
    url: z.string().optional(),
    text: z.string().optional(),
    postDate: z.string().optional(),
    links: z.array(z.any()).optional(),
    media: z.array(z.any()).optional(),
  })).max(8).optional(),
  processWithAI: z.boolean().optional().default(false),
});

const BRAIN_QUERY_SCHEMA = z.object({
  question: z.string().min(1, 'question is required'),
});

const X_POST_PREVIEW_SCHEMA = z.object({
  url: z.string().min(1, 'X post URL is required'),
});

const X_DISCOVER_QUERY_SCHEMA = z.object({
  topics: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const X_BOOKMARK_SYNC_SCHEMA = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  mode: z.enum(['manual', 'daily']).default('manual'),
  processWithAI: z.boolean().optional().default(false),
});

const X_BOOKMARK_DAILY_SYNC_SCHEMA = z.object({
  enabled: z.boolean(),
});

const SCHEDULED_RUN_SCHEMA = z.object({
  force: z.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  processWithAI: z.boolean().optional().default(false),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().optional().default('UTC'),
});

const PASSWORD_FORGOT_SCHEMA = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
});

const PASSWORD_RESET_SCHEMA = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const MEMORY_UPDATE_SCHEMA = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).max(12).optional(),
});

const PROCESS_MEMORY_AI_SCHEMA = z.object({
  forceReprocess: z.boolean().optional().default(false),
});

const PROCESS_MEMORIES_BATCH_SCHEMA = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  forceReprocess: z.boolean().optional().default(false),
});

const DAILY_BRIEF_QUERY_SCHEMA = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().optional().default('UTC'),
  forceRegenerate: z.coerce.boolean().optional().default(false),
});

const PROJECT_CREATE_SCHEMA = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  concepts: z.array(z.string().min(1)).max(20).optional(),
  color: z.string().max(40).optional(),
  icon: z.string().max(40).optional(),
});

const PROJECT_UPDATE_SCHEMA = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  concepts: z.array(z.string().min(1)).max(20).optional(),
  color: z.string().max(40).optional(),
  icon: z.string().max(40).optional(),
});

const PROJECT_MEMORY_SCHEMA = z.object({
  memoryId: z.string().min(1),
});

const PROJECT_SUMMARY_SCHEMA = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

function sourceTimestampMs(source) {
  const value = source?.createdAt;
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  return 0;
}

function formatRelative(source) {
  const ts = sourceTimestampMs(source);
  if (!ts) return 'just now';
  const diff = Date.now() - ts;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function captureIcon(sourceType = '') {
  const value = sourceType.toLowerCase();
  if (value === 'url' || value === 'rss') return '🔗';
  if (value === 'image') return '🖼️';
  if (value === 'voice') return '🎙️';
  if (value === 'tweet') return '𝕏';
  if (value === 'note' || value === 'text') return '🗒️';
  return '📝';
}

function captureTag(sourceType = '') {
  const value = sourceType.toLowerCase();
  if (value === 'url' || value === 'rss') return '#inspiration';
  if (value === 'image') return '#image';
  if (value === 'voice') return '#voice';
  if (value === 'tweet') return '#xpost';
  if (value === 'note' || value === 'text') return '#ideas';
  return '#personal';
}

function fallbackTitle(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 'Quick memory';
  return trimmed.split(/\s+/).slice(0, 7).join(' ');
}

function generateMemoryMetadata(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (normalized.includes('fail-ai')) throw new Error('AI metadata generation failed');

  let category = 'General';
  if (/(work|meeting|project|client|roadmap)/.test(normalized)) category = 'Work';
  else if (/(run|walk|gym|workout|fitness|steps)/.test(normalized)) category = 'Fitness';
  else if (/(family|friend|date|personal|life)/.test(normalized)) category = 'Personal';
  else if (/(learn|study|book|course|research)/.test(normalized)) category = 'Learning';

  const tags = Array.from(new Set(
    normalized
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 5),
  )).slice(0, 4);
  return { category, tags };
}

function cleanObject(value) {
  return sanitizeFirestoreValue(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(sanitizeFirestoreValue)
      .filter((entry) => entry !== undefined);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, sanitizeFirestoreValue(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  return value;
}

function timestampFromValue(value, fallback = Date.now()) {
  if (typeof value?.toDate === 'function') return admin.firestore.Timestamp.fromDate(value.toDate());
  if (typeof value?._seconds === 'number') return admin.firestore.Timestamp.fromMillis(value._seconds * 1000);
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return admin.firestore.Timestamp.fromMillis(ms);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  return admin.firestore.Timestamp.fromMillis(fallback);
}

function memorySourceType(sourceType = '', importSource = '') {
  const normalizedImport = String(importSource || '').toLowerCase();
  if (normalizedImport === 'x_bookmark') return 'x_bookmark';

  const normalized = String(sourceType || '').toLowerCase();
  if (normalized === 'tweet') return 'x_bookmark';
  if (normalized === 'text' || normalized === 'note') return 'manual_note';
  if (normalized === 'url' || normalized === 'rss') return 'link';
  if (normalized === 'image') return 'image';
  if (normalized === 'voice') return 'voice';
  return 'unknown';
}

function rawPayloadHash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(cleanObject(value) || {}))
    .digest('hex');
}

function contentHash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function nativeMemoryFromSource(source, firebaseUserId) {
  const content = String(source.body || source.content || source.summary || '');
  const createdAtMs = sourceTimestampMs(source) || Date.now();
  const sourceDate = source.postDate || source.sourceDate;
  const sourceType = memorySourceType(source.source_type || source.type, source.importSource);
  const sourceId = source.externalId ? String(source.externalId) : undefined;
  const sourceUrl = source.source_url || source.sourceURL;
  const tags = Array.isArray(source.tags) ? source.tags.map(String).slice(0, 12) : [];
  const summary = source.summary ? String(source.summary) : content.slice(0, 240);
  const cleanTextResult = extractCleanTextFromMemory({
    rawText: content,
    title: source.title,
    sourceType,
    sourceUrl,
  });
  const author = cleanObject({
    id: source.authorId,
    username: source.authorUsername || source.sourceUsername,
    displayName: source.authorDisplayName,
    avatarUrl: source.authorAvatarUrl,
  });

  return cleanObject({
    id: String(source.id),
    userId: firebaseUserId,
    sourceType,
    sourceUrl,
    sourceId,
    title: String(source.title || fallbackTitle(content) || 'Untitled memory'),
    rawText: content,
    cleanText: cleanTextResult.cleanText,
    contentHash: cleanTextResult.contentHash || contentHash(content),
    summary,
    category: String(source.category || 'General'),
    tags,
    concepts: Array.isArray(source.concepts) ? source.concepts.map(String) : [],
    entities: Array.isArray(source.entities) ? source.entities.map(String) : [],
    author: Object.keys(author || {}).length ? author : undefined,
    intent: source.intent || 'unknown',
    projectIds: Array.isArray(source.projectIds) ? source.projectIds.map(String) : [],
    confidenceScore: typeof source.confidenceScore === 'number' ? source.confidenceScore : undefined,
    isArchived: source.isArchived === true,
    isFavorite: source.isFavorite === true,
    capturedAt: sourceDate ? timestampFromValue(sourceDate, createdAtMs) : timestampFromValue(source.createdAt, createdAtMs),
    ai: cleanObject({
      summary: source.ai?.summary,
      category: source.ai?.category,
      tags: source.ai?.tags,
      concepts: source.ai?.concepts,
      entities: source.ai?.entities,
      claims: source.ai?.claims,
      actionItems: source.ai?.actionItems,
      keyTakeaways: source.ai?.keyTakeaways,
      suggestedProjects: source.ai?.suggestedProjects,
      importanceScore: source.ai?.importanceScore,
      modelUsed: source.ai?.modelUsed,
      processedAt: source.ai?.processedAt ? timestampFromValue(source.ai.processedAt, createdAtMs) : undefined,
      processingVersion: source.ai?.processingVersion,
      processingStatus: source.ai?.processingStatus || 'pending',
      errorMessage: source.ai?.errorMessage,
    }),
    sync: cleanObject({
      provider: source.importSource === 'x_bookmark' ? 'x' : 'manual',
      importStatus: source.importSource === 'x_bookmark' ? 'imported' : undefined,
      importedAt: source.importSource === 'x_bookmark' ? admin.firestore.FieldValue.serverTimestamp() : undefined,
      lastSyncAttemptAt: source.importSource === 'x_bookmark' ? admin.firestore.FieldValue.serverTimestamp() : undefined,
      retryCount: Number(source.retryCount || 0),
      rawPayloadHash: source.rawPayloadHash,
    }),

    // Legacy fields kept for current native screens and existing API clients.
    content,
    createdAt: timestampFromValue(source.createdAt, createdAtMs),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    type: String(source.source_type || source.type || 'note'),
    sourceURL: sourceUrl,
    sourceUsername: source.authorUsername || source.sourceUsername,
    sourceDate: sourceDate ? timestampFromValue(sourceDate, createdAtMs) : undefined,
    links: Array.isArray(source.links) ? source.links : [],
    media: Array.isArray(source.media) ? source.media : [],
    referencedPosts: Array.isArray(source.referencedPosts) ? source.referencedPosts : [],
    externalId: source.externalId,
    importSource: source.importSource,
    importedFromLegacyBackend: true,
    legacyUserId: source.userId,
  });
}

function failedNativeMemoryFromSource(source, firebaseUserId, error) {
  return cleanObject({
    ...nativeMemoryFromSource(source, firebaseUserId),
    sync: {
      provider: 'x',
      importStatus: 'failed',
      lastSyncAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      errorMessage: error?.message || String(error || 'Import failed.'),
      retryCount: Number(source.retryCount || 0) + 1,
      rawPayloadHash: source.rawPayloadHash,
    },
  });
}

function parseXPostUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    try {
      parsed = new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }

  const host = parsed.hostname.toLowerCase();
  const isSupportedHost = host === 'x.com'
    || host.endsWith('.x.com')
    || host === 'twitter.com'
    || host.endsWith('.twitter.com');
  if (!isSupportedHost) return null;

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const statusIndex = pathParts.findIndex((part) => part.toLowerCase() === 'status');
  if (statusIndex < 1 || !pathParts[statusIndex + 1] || !/^[0-9]+$/.test(pathParts[statusIndex + 1])) {
    return null;
  }

  const username = pathParts[statusIndex - 1];
  const postId = pathParts[statusIndex + 1];
  return {
    username,
    postId,
    url: `https://x.com/${username}/status/${postId}`,
  };
}

function normalizeXLinks(urls = []) {
  return urls
    .map((item) => cleanObject({
      url: item.unwound_url || item.expanded_url || item.url,
      displayUrl: item.display_url,
      title: item.title,
    }))
    .filter((item) => item.url);
}

function normalizeXMedia(media = []) {
  return media.map((item) => {
    const variants = Array.isArray(item.variants)
      ? item.variants
        .filter((variant) => variant.url)
        .map((variant) => ({
          url: variant.url,
          contentType: variant.content_type,
          bitRate: variant.bit_rate,
        }))
      : undefined;
    return cleanObject({
      type: item.type,
      url: item.url,
      previewImageUrl: item.preview_image_url,
      altText: item.alt_text,
      width: item.width,
      height: item.height,
      variants,
    });
  });
}

function xMediaForTweet(tweet, mediaByKey) {
  return normalizeXMedia(
    (tweet?.attachments?.media_keys || [])
      .map((key) => mediaByKey.get(key))
      .filter(Boolean),
  );
}

function normalizeXReferencedPosts(payload = {}, primaryTweet = {}) {
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const tweets = new Map((payload.includes?.tweets || []).map((tweet) => [tweet.id, tweet]));
  const mediaByKey = new Map((payload.includes?.media || []).map((item) => [item.media_key, item]));

  return (primaryTweet.referenced_tweets || [])
    .map((reference) => {
      const tweet = tweets.get(reference.id);
      if (!tweet) return null;
      const user = users.get(tweet.author_id);
      const username = user?.username || '';
      const text = tweet.note_tweet?.text || tweet.text || '';
      return {
        id: tweet.id,
        referenceType: reference.type,
        username,
        url: xTweetUrl(username, tweet.id),
        text,
        postDate: tweet.created_at,
        links: normalizeXLinks(tweet.entities?.urls),
        media: xMediaForTweet(tweet, mediaByKey),
      };
    })
    .filter(Boolean);
}

const INTEREST_SEARCH_CONFIG = {
  ai_tech: {
    label: 'AI & Tech',
    category: 'AI & Tech',
    query: '("AI" OR "artificial intelligence" OR "LLM" OR "OpenAI" OR "Anthropic") lang:en -is:retweet',
  },
  crypto: {
    label: 'Crypto',
    category: 'Crypto',
    query: '("crypto" OR "bitcoin" OR "ethereum" OR "solana" OR "DeFi") lang:en -is:retweet',
  },
  sports: {
    label: 'Sports',
    category: 'Sports',
    query: '("NBA" OR "NFL" OR "MLB" OR "soccer" OR "sports") lang:en -is:retweet',
  },
  politics: {
    label: 'Politics',
    category: 'Politics',
    query: '("policy" OR "election" OR "congress" OR "geopolitics") lang:en -is:retweet',
  },
  finance: {
    label: 'Finance',
    category: 'Finance',
    query: '("markets" OR "stocks" OR "earnings" OR "macro" OR "finance") lang:en -is:retweet',
  },
  science: {
    label: 'Science',
    category: 'Science',
    query: '("science" OR "research" OR "paper" OR "breakthrough" OR "nature") lang:en -is:retweet',
  },
  startups: {
    label: 'Startups',
    category: 'Startups',
    query: '("startup" OR "founder" OR "SaaS" OR "venture capital" OR "product launch") lang:en -is:retweet',
  },
  health: {
    label: 'Health',
    category: 'Health',
    query: '("health" OR "medicine" OR "longevity" OR "fitness" OR "wellness") lang:en -is:retweet',
  },
};

function normalizeInterestTopics(rawTopics = [], fallbackTopics = []) {
  const topics = rawTopics.length ? rawTopics : fallbackTopics;
  return Array.from(new Set(topics))
    .map((topic) => String(topic || '').trim())
    .filter((topic) => INTEREST_SEARCH_CONFIG[topic]);
}

function xTweetUrl(username, tweetId) {
  return username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`;
}

function mapXSearchPayloadToFeedItems(payload, topic) {
  const config = INTEREST_SEARCH_CONFIG[topic];
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const mediaByKey = new Map((payload.includes?.media || []).map((item) => [item.media_key, item]));

  return (payload.data || []).map((tweet) => {
    const user = users.get(tweet.author_id);
    const username = user?.username || '';
    const text = tweet.note_tweet?.text || tweet.text || '';
    const links = normalizeXLinks(tweet.entities?.urls);
    const media = normalizeXMedia(
      (tweet.attachments?.media_keys || [])
        .map((key) => mediaByKey.get(key))
        .filter(Boolean),
    );
    let generated = { category: 'General', tags: [] };
    try {
      generated = generateMemoryMetadata(text);
    } catch {
      // Discovery should still return posts even if metadata generation fails.
    }
    return {
      id: `x_${tweet.id}`,
      title: username ? `@${username} on X` : 'X post',
      summary: text,
      source_type: 'tweet',
      source_name: 'X',
      url: xTweetUrl(username, tweet.id),
      topic,
      published_at: tweet.created_at || new Date().toISOString(),
      claims: [],
      entities: links.map((link) => link.displayUrl || link.url).filter(Boolean).slice(0, 4),
      in_brain: false,
      body: text,
      category: config.category || generated.category,
      tags: ['xpost', topic, ...generated.tags],
      authorUsername: username,
      postDate: tweet.created_at,
      links,
      media,
    };
  });
}

function xOAuthConfig() {
  const clientId = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI || process.env.TWITTER_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: 'tweet.read users.read bookmark.read offline.access',
    configured: !!clientId && !!redirectUri,
  };
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encryptedTokenKey() {
  const secret = process.env.X_TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY || JWT_SECRET;
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptToken(value) {
  if (!value) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptedTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${base64Url(iv)}.${base64Url(tag)}.${base64Url(encrypted)}`;
}

function decryptToken(value) {
  if (!value) return null;
  const [ivText, tagText, encryptedText] = String(value).split('.');
  if (!ivText || !tagText || !encryptedText) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptedTokenKey(),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isTokenFresh(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now() + 60_000;
}

function xTokenRequestHeaders(config) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (config.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
  }
  return headers;
}

function xTokenRequestBody(params, config) {
  const body = new URLSearchParams(params);
  if (!config.clientSecret) body.set('client_id', config.clientId);
  return body;
}

async function exchangeXAuthorizationCode(code, verifier) {
  const config = xOAuthConfig();
  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: xTokenRequestHeaders(config),
    body: xTokenRequestBody({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }, config),
  });
  const payload = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok) {
    throw new Error(payload?.error_description || payload?.detail || payload?.error || 'X token exchange failed.');
  }
  return payload;
}

async function refreshXAccessToken(connection) {
  const config = xOAuthConfig();
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  if (!refreshToken) throw new Error('X refresh token is missing. Reconnect X bookmarks.');

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: xTokenRequestHeaders(config),
    body: xTokenRequestBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }, config),
  });
  const payload = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok) {
    const message = payload?.error_description || payload?.detail || payload?.error || 'X token refresh failed.';
    if (/invalid|expired|revoked|token/i.test(message)) {
      throw new Error('X rejected the saved refresh token. Disconnect and reconnect X Bookmarks, then sync again.');
    }
    throw new Error(message);
  }
  return payload;
}

async function xAccessTokenForSync(connection) {
  const existingAccessToken = decryptToken(connection.encryptedAccessToken);
  if (existingAccessToken && isTokenFresh(connection.tokenExpiresAt)) {
    return {
      accessToken: existingAccessToken,
      connectionPatch: {},
    };
  }

  const tokenPayload = await refreshXAccessToken(connection);
  const connectionPatch = {
    encryptedAccessToken: encryptToken(tokenPayload.access_token),
    tokenExpiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
      : null,
    lastSyncError: null,
  };
  if (tokenPayload.refresh_token) {
    connectionPatch.encryptedRefreshToken = encryptToken(tokenPayload.refresh_token);
  }

  return {
    accessToken: tokenPayload.access_token,
    connectionPatch,
  };
}

async function fetchXMe(accessToken) {
  const meRes = await fetch('https://api.x.com/2/users/me?user.fields=username,name,profile_image_url', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await meRes.json().catch(() => null);
  if (!meRes.ok || !payload?.data?.id) {
    throw new Error(payload?.detail || payload?.title || 'X profile lookup failed.');
  }
  return payload.data;
}

async function fetchXBookmarks(xUserId, accessToken, limit) {
  const url = new URL(`https://api.x.com/2/users/${xUserId}/bookmarks`);
  url.searchParams.set('max_results', String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set('tweet.fields', 'attachments,created_at,entities,note_tweet,public_metrics,text,referenced_tweets');
  url.searchParams.set('expansions', 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys');
  url.searchParams.set('user.fields', 'username,name,profile_image_url');
  url.searchParams.set('media.fields', 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,variants,width');

  const bookmarksRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await bookmarksRes.json().catch(() => null);
  if (!bookmarksRes.ok) {
    throw new Error(payload?.detail || payload?.title || 'X bookmarks sync failed.');
  }
  return payload || {};
}

function mapXBookmarkPayloadToSources(payload = {}) {
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const mediaByKey = new Map((payload.includes?.media || []).map((item) => [item.media_key, item]));

  return (payload.data || []).map((tweet) => {
    const user = users.get(tweet.author_id);
    const username = user?.username || '';
    const text = tweet.note_tweet?.text || tweet.text || '';
    let generated = { category: 'General', tags: [] };
    try {
      generated = generateMemoryMetadata(text);
    } catch {
      // Imported bookmarks should still be saved if metadata generation fails.
    }

    return {
      ...newSource(username ? `@${username} on X` : 'X bookmark', 'tweet'),
      id: `x_bookmark_${tweet.id}`,
      body: text,
      summary: text.slice(0, 240),
      source_url: xTweetUrl(username, tweet.id),
      authorId: user?.id || tweet.author_id,
      authorUsername: username,
      authorDisplayName: user?.name,
      authorAvatarUrl: user?.profile_image_url,
      postDate: tweet.created_at,
      links: normalizeXLinks(tweet.entities?.urls),
      media: xMediaForTweet(tweet, mediaByKey),
      referencedPosts: normalizeXReferencedPosts(payload, tweet),
      category: generated.category,
      tags: ['xpost', 'bookmark', ...generated.tags],
      externalId: tweet.id,
      importSource: 'x_bookmark',
      rawPayloadHash: rawPayloadHash(tweet),
    };
  });
}

async function nativeMemoryExists(userId, externalId) {
  if (!admin.apps.length) return false;
  const memories = admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('memories');
  const doc = await memories.doc(`x_bookmark_${externalId}`).get();
  if (doc.exists) return true;
  const snapshot = await memories
    .where('sourceType', '==', 'x_bookmark')
    .where('sourceId', '==', String(externalId))
    .limit(1)
    .get();
  return !snapshot.empty;
}

async function writeNativeMemoryFromSource(userId, source) {
  if (!admin.apps.length) return false;
  const db = admin.firestore();
  const reference = db.collection('users').doc(userId).collection('memories').doc(source.id);
  const existing = await reference.get();
  const cleanTextResult = extractCleanTextFromMemory({
    rawText: source.body,
    title: source.title,
    sourceType: 'x_bookmark',
    sourceUrl: source.source_url,
  });
  if (existing.exists) {
    const existingData = existing.data() || {};
    await reference.set(cleanObject({
      sourceType: 'x_bookmark',
      sourceUrl: source.source_url,
      sourceId: String(source.externalId),
      rawText: String(source.body || ''),
      cleanText: cleanTextResult.cleanText,
      contentHash: cleanTextResult.contentHash,
      summary: String(existingData.summary || '').trim()
        ? undefined
        : String(source.summary || source.body || '').slice(0, 240),
      author: cleanObject({
        id: source.authorId,
        username: source.authorUsername,
        displayName: source.authorDisplayName,
        avatarUrl: source.authorAvatarUrl,
      }),
      links: Array.isArray(source.links) ? source.links : [],
      media: Array.isArray(source.media) ? source.media : [],
      referencedPosts: Array.isArray(source.referencedPosts) ? source.referencedPosts : [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      sync: {
        ...(existingData.sync || {}),
        provider: 'x',
        importStatus: 'imported',
        lastSyncAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        rawPayloadHash: source.rawPayloadHash,
      },
      externalId: source.externalId,
      importSource: source.importSource,
    }), { merge: true });
    return false;
  }
  await reference.set(nativeMemoryFromSource({ ...source, userId }, userId), { merge: true });
  return true;
}

async function writeNativeMemoryDocumentFromSource(userId, source) {
  if (!admin.apps.length) return false;
  const reference = admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('memories')
    .doc(String(source.id));
  await reference.set(nativeMemoryFromSource({ ...source, userId }, userId), { merge: true });
  return true;
}

async function markNativeMemoryImportFailed(userId, source, error) {
  if (!admin.apps.length) return;
  const reference = admin.firestore()
    .collection('users')
    .doc(userId)
    .collection('memories')
    .doc(source.id);
  await reference.set(failedNativeMemoryFromSource({ ...source, userId }, userId, error), { merge: true });
}

function syncTimestamp() {
  return admin.apps.length ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

async function getXBookmarkSyncState(userId) {
  const state = await store.getXBookmarkSyncState?.(userId);
  return state || {
    provider: 'x',
    enabled: false,
    lastSyncedAt: null,
    lastSuccessfulSyncAt: null,
    lastFailedSyncAt: null,
    lastErrorMessage: null,
    lastScheduledSyncAt: null,
    lastManualSyncAt: null,
    lastResult: null,
    lastError: null,
    importedCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
    nextEligibleSyncAt: null,
    totalImported: 0,
    totalFailed: 0,
    syncInProgress: false,
  };
}

async function updateXBookmarkSyncState(userId, patch) {
  if (!store.updateXBookmarkSyncState) return null;
  return store.updateXBookmarkSyncState(userId, {
    provider: 'x',
    ...patch,
  });
}

function syncStatusFromCounts(importedCount, failedCount) {
  if (failedCount > 0 && importedCount > 0) return 'partial_success';
  if (failedCount > 0) return 'failed';
  return 'success';
}

function isoFromDate(date) {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

function dateValueMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function nextDailySyncIso(fromDate = new Date()) {
  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

async function syncXBookmarksForUser(userId, options = {}) {
  const mode = options.mode || 'manual';
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  const processWithAI = options.processWithAI === true;
  const previousState = await getXBookmarkSyncState(userId);

  await updateXBookmarkSyncState(userId, {
    enabled: previousState.enabled === true,
    syncInProgress: true,
    lastErrorMessage: null,
    lastError: null,
  });

  const connection = await store.getXBookmarkConnection(userId);
  if (!connection) {
    const message = 'Connect X bookmarks before syncing.';
    await updateXBookmarkSyncState(userId, {
      syncInProgress: false,
      lastFailedSyncAt: syncTimestamp(),
      lastErrorMessage: message,
      lastError: message,
      lastResult: 'failed',
      failedCount: 1,
      totalFailed: Number(previousState.totalFailed || 0) + 1,
    });
    return {
      status: 'failed',
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 1,
      aiProcessedCount: 0,
      aiSkippedCount: 0,
      aiFailedCount: 0,
      aiLimitReached: false,
      aiUsage: null,
      errors: [message],
      checkedCount: 0,
      memories: [],
    };
  }

  try {
    const { accessToken, connectionPatch } = await xAccessTokenForSync(connection);
    const payload = await fetchXBookmarks(connection.xUserId, accessToken, limit);
    const existingSources = await store.listSources(userId);
    const existingBookmarkIds = new Set(
      existingSources
        .filter((source) => source.importSource === 'x_bookmark' || source.id?.startsWith?.('x_bookmark_'))
        .map((source) => String(source.externalId || String(source.id || '').replace(/^x_bookmark_/, ''))),
    );

    const sources = mapXBookmarkPayloadToSources(payload);
    const imported = [];
    const duplicates = [];
    const failed = [];
    const errors = [];
    const importedMemoryIds = [];

    for (const source of sources) {
      const sourceId = String(source.externalId);
      try {
        if (existingBookmarkIds.has(sourceId) || await nativeMemoryExists(userId, source.externalId)) {
          duplicates.push(sourceId);
          await writeNativeMemoryFromSource(userId, source);
          continue;
        }

        await store.addSource(userId, source);
        await writeNativeMemoryFromSource(userId, source);
        existingBookmarkIds.add(sourceId);
        imported.push(source);
        importedMemoryIds.push(source.id);
      } catch (error) {
        failed.push(sourceId);
        const message = error.message || `Failed to import X bookmark ${sourceId}.`;
        errors.push(message);
        console.warn(`[x-bookmarks] import failed for user=${userId} sourceId=${sourceId}: ${message}`);
        try {
          await markNativeMemoryImportFailed(userId, source, error);
        } catch (trackingError) {
          console.warn(`[x-bookmarks] failed to record import error for user=${userId} sourceId=${sourceId}: ${trackingError.message}`);
        }
      }
    }

    const status = syncStatusFromCounts(imported.length, failed.length);
    let aiProcessing = {
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errors: [],
    };
    if (processWithAI && importedMemoryIds.length) {
      try {
        aiProcessing = await processMemoryIds(userId, importedMemoryIds, { forceReprocess: false, store });
      } catch (error) {
        const message = error.message || 'AI processing after X sync failed.';
        aiProcessing.failedCount = importedMemoryIds.length;
        aiProcessing.errors = [message];
        errors.push(message);
        console.warn(`[x-bookmarks] ai processing failed for user=${userId}: ${message}`);
      }
    }
    const now = syncTimestamp();
    const nowIso = new Date().toISOString();
    const failedCount = failed.length;
    await updateXBookmarkSyncState(userId, {
      lastSyncedAt: now,
      lastSuccessfulSyncAt: status === 'failed' ? previousState.lastSuccessfulSyncAt || null : now,
      lastFailedSyncAt: failedCount > 0 ? now : previousState.lastFailedSyncAt || null,
      lastErrorMessage: errors[0] || null,
      lastError: errors[0] || null,
      lastResult: status,
      lastScheduledSyncAt: mode === 'daily' ? now : previousState.lastScheduledSyncAt || null,
      lastManualSyncAt: mode === 'manual' ? now : previousState.lastManualSyncAt || null,
      importedCount: imported.length,
      skippedDuplicateCount: duplicates.length,
      failedCount,
      nextEligibleSyncAt: mode === 'daily' ? nextDailySyncIso(new Date()) : previousState.nextEligibleSyncAt || null,
      totalImported: Number(previousState.totalImported || 0) + imported.length,
      totalFailed: Number(previousState.totalFailed || 0) + failedCount,
      syncInProgress: false,
    });

    await store.upsertXBookmarkConnection(userId, {
      ...connectionPatch,
      lastSyncError: errors[0] || null,
      lastSyncedAt: nowIso,
      lastImportedCount: imported.length,
      lastDuplicateCount: duplicates.length,
      lastFailedCount: failedCount,
      lastSyncStatus: status,
      lastSyncMode: mode,
      lastSeenBookmarkId: sources[0]?.externalId || connection.lastSeenBookmarkId || null,
    });

    return {
      status,
      importedCount: imported.length,
      duplicateCount: duplicates.length,
      failedCount,
      aiProcessedCount: aiProcessing.processedCount,
      aiSkippedCount: aiProcessing.skippedCount,
      aiFailedCount: aiProcessing.failedCount,
      aiLimitReached: aiProcessing.limitReached === true,
      aiUsage: aiProcessing.usage,
      errors,
      checkedCount: sources.length,
      memories: imported.map((source) => ({
        id: source.id,
        title: source.title,
        sourceURL: source.source_url,
        authorUsername: source.authorUsername,
        externalId: source.externalId,
      })),
    };
  } catch (error) {
    const message = error.message || 'X bookmark sync failed.';
    const now = syncTimestamp();
    await updateXBookmarkSyncState(userId, {
      lastSyncedAt: now,
      lastFailedSyncAt: now,
      lastErrorMessage: message,
      lastError: message,
      lastResult: 'failed',
      lastScheduledSyncAt: mode === 'daily' ? now : previousState.lastScheduledSyncAt || null,
      lastManualSyncAt: mode === 'manual' ? now : previousState.lastManualSyncAt || null,
      failedCount: 1,
      nextEligibleSyncAt: mode === 'daily' ? nextDailySyncIso(new Date()) : previousState.nextEligibleSyncAt || null,
      totalFailed: Number(previousState.totalFailed || 0) + 1,
      syncInProgress: false,
    });
    await store.upsertXBookmarkConnection(userId, {
      lastSyncError: message,
      lastSyncedAt: new Date().toISOString(),
      lastFailedCount: 1,
      lastSyncStatus: 'failed',
      lastSyncMode: mode,
    });
    return {
      status: 'failed',
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 1,
      aiProcessedCount: 0,
      aiSkippedCount: 0,
      aiFailedCount: 0,
      aiLimitReached: false,
      aiUsage: null,
      errors: [message],
      checkedCount: 0,
      memories: [],
    };
  }
}

async function retryFailedBookmarkImports(userId) {
  return syncXBookmarksForUser(userId, { mode: 'manual', limit: 100 });
}

function xConnectionHasTokenData(connection = {}) {
  return Boolean(connection.xUserId && (connection.encryptedRefreshToken || connection.encryptedAccessToken));
}

function isDailySyncCandidateReady(candidate, now = new Date()) {
  if (!candidate?.userId || !candidate.connection) return false;
  if (!xConnectionHasTokenData(candidate.connection)) return false;
  const syncState = candidate.syncState || {};
  if (syncState.enabled !== true) return false;
  if (syncState.syncInProgress === true) return false;
  const nextEligibleMs = dateValueMs(syncState.nextEligibleSyncAt);
  return !nextEligibleMs || nextEligibleMs <= now.getTime();
}

async function runScheduledXBookmarkSync(options = {}) {
  const config = aiConfig();
  if (!config.dailySyncEnabled && options.force !== true) {
    return {
      status: 'disabled',
      processedUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      results: [],
    };
  }

  const candidates = options.candidates || (await store.listXBookmarkSyncCandidates?.({ limit: options.limit || 500 })) || [];
  const syncUser = options.syncUser || syncXBookmarksForUser;
  const results = [];
  let skippedUsers = 0;
  let failedUsers = 0;

  for (const candidate of candidates) {
    if (!isDailySyncCandidateReady(candidate)) {
      skippedUsers += 1;
      continue;
    }
    try {
      const result = await syncUser(candidate.userId, {
        mode: 'daily',
        limit: options.bookmarkLimit || 100,
        processWithAI: options.processWithAI === true,
      });
      if (result.status === 'failed') failedUsers += 1;
      results.push({
        userId: candidate.userId,
        status: result.status,
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        failedCount: result.failedCount,
        aiLimitReached: result.aiLimitReached === true,
      });
    } catch (error) {
      failedUsers += 1;
      const message = error.message || 'Scheduled X bookmark sync failed.';
      await updateXBookmarkSyncState(candidate.userId, {
        syncInProgress: false,
        lastFailedSyncAt: syncTimestamp(),
        lastErrorMessage: message,
        lastError: message,
        lastResult: 'failed',
        failedCount: 1,
        nextEligibleSyncAt: nextDailySyncIso(new Date()),
      }).catch(() => {});
      results.push({ userId: candidate.userId, status: 'failed', error: message });
    }
  }

  return {
    status: failedUsers > 0 && results.length > failedUsers ? 'partial_success' : (failedUsers > 0 ? 'failed' : 'success'),
    processedUsers: results.length,
    skippedUsers,
    failedUsers,
    results,
  };
}

async function runScheduledDailyBriefGeneration(options = {}) {
  const config = aiConfig();
  if (!config.dailyBriefSchedulerEnabled && options.force !== true) {
    return {
      status: 'disabled',
      processedUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      results: [],
    };
  }

  const timezone = options.timezone || 'UTC';
  const dateKey = options.dateKey || dateKeyFor(new Date(), timezone);
  const users = options.users || (await store.listUsers?.({ limit: options.limit || 500 })) || [];
  const generateBrief = options.generateBrief || generateDailyBriefForUser;
  const results = [];
  let skippedUsers = 0;
  let failedUsers = 0;

  for (const user of users) {
    const userId = user.id || user.uid;
    if (!userId) {
      skippedUsers += 1;
      continue;
    }
    try {
      const brief = await generateBrief(userId, dateKey, {
        timezone,
        forceRegenerate: options.forceRegenerate === true,
        store,
      });
      results.push({
        userId,
        dateKey,
        status: brief?.status || brief?.ai?.status || 'generated',
        memoryCount: Number(brief?.memoryCount || brief?.savedCount || 0),
        usedAi: brief?.usedAi === true,
      });
    } catch (error) {
      failedUsers += 1;
      results.push({
        userId,
        dateKey,
        status: 'failed',
        error: error.message || 'Scheduled Daily Brief generation failed.',
      });
    }
  }

  return {
    status: failedUsers > 0 && results.length > failedUsers ? 'partial_success' : (failedUsers > 0 ? 'failed' : 'success'),
    processedUsers: results.length,
    skippedUsers,
    failedUsers,
    dateKey,
    results,
  };
}

async function fetchXDiscoveryForTopic(topic, limit) {
  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return {
      ok: false,
      needsApiKey: true,
      items: [],
      error: 'X discovery is not configured on the backend yet.',
    };
  }

  const config = INTEREST_SEARCH_CONFIG[topic];
  const searchUrl = new URL('https://api.x.com/2/tweets/search/recent');
  searchUrl.searchParams.set('query', config.query);
  searchUrl.searchParams.set('max_results', String(Math.max(10, Math.min(100, limit))));
  searchUrl.searchParams.set('tweet.fields', 'attachments,created_at,entities,note_tweet,public_metrics,text');
  searchUrl.searchParams.set('expansions', 'author_id,attachments.media_keys');
  searchUrl.searchParams.set('user.fields', 'username,name');
  searchUrl.searchParams.set('media.fields', 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,variants,width');

  const xRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const payload = await xRes.json().catch(() => null);
  if (!xRes.ok) {
    return {
      ok: false,
      needsApiKey: false,
      items: [],
      error: payload?.detail || payload?.title || `X search failed for ${config.label}.`,
      status: xRes.status,
    };
  }

  return {
    ok: true,
    needsApiKey: false,
    items: mapXSearchPayloadToFeedItems(payload || {}, topic).slice(0, limit),
  };
}

function summarizeCategories(sources) {
  const counters = new Map();

  for (const source of sources) {
    const category = String(source.category || 'General');
    counters.set(category, (counters.get(category) || 0) + 1);
  }

  const colors = ['#FFE6D8', '#EEDFFF', '#DCF7EA', '#DDE9FF', '#FFF2C7'];
  return Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], index) => ({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      count,
      icon: '•',
      bgColor: colors[index % colors.length],
    }));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.email,
    tier: user.tier || 'free',
    interests: user.interests || [],
    onboardingCompleted: !!user.onboardingCompleted,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (isProduction && (!value || value === 'dev-secret-change-me')) {
    throw new Error('JWT_SECRET must be set to a strong Render environment variable in production.');
  }
  return value || 'dev-secret-change-me';
}

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
    return null;
  }
  return parsed.data;
}

function parseQuery(schema, req, res) {
  const parsed = schema.safeParse(req.query || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request query' });
    return null;
  }
  return parsed.data;
}

async function auth(req, res, next) {
  const raw = req.headers.authorization;
  if (!raw || !raw.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = raw.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    return next();
  } catch {
    if (!admin.apps.length) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.userId = decoded.uid;
      req.firebaseUser = decoded;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await store.getUserById?.(req.userId);
    if (getUserAIUsageTier(user || req.firebaseUser || {}) === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
}

async function handleEmailAuth(req, res, forcedIntent) {
  const data = parseBody(EMAIL_AUTH_SCHEMA, req, res);
  if (!data) return;
  const intent = forcedIntent || data.intent || 'signin';
  const existing = await store.getUserByEmail(data.email);

  if (intent === 'signup') {
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = {
      id: crypto.randomUUID(),
      email: data.email,
      displayName: data.email.split('@')[0],
      passwordHash,
      tier: 'free',
      interests: [],
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
    };
    await store.upsertUser(user);
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  }

  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const ok = await bcrypt.compare(data.password, existing.passwordHash || '');
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.json({ token: issueToken(existing), user: publicUser(existing) });
}

async function userFromFirebaseIdToken(idToken) {
  if (!admin.apps.length) return null;
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    return null;
  }
}

async function upsertFirebaseUser(decoded, interests = []) {
  const email = String(decoded.email || `${decoded.uid}@firebase.local`).toLowerCase();
  const existing = await store.getUserByEmail(email);
  const user = {
    ...(existing || {}),
    id: existing?.id || decoded.uid,
    email,
    displayName: existing?.displayName || decoded.name || decoded.email?.split('@')[0] || 'Nomi User',
    passwordHash: existing?.passwordHash || '',
    tier: existing?.tier || 'free',
    interests: existing?.interests?.length ? existing.interests : interests,
    onboardingCompleted: !!existing?.onboardingCompleted,
    firebaseUid: decoded.uid,
    authProvider: decoded.firebase?.sign_in_provider || 'firebase',
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await store.upsertUser(user);
  return user;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'second-brain-backend', persistence: store.mode });
});

app.post('/api/auth/email', async (req, res) => {
  try {
    return await handleEmailAuth(req, res);
  } catch (error) {
    return res.status(500).json({ error: `Auth failed: ${error.message}` });
  }
});

app.post('/api/auth/email/signup', async (req, res) => {
  try {
    return await handleEmailAuth(req, res, 'signup');
  } catch (error) {
    return res.status(500).json({ error: `Sign up failed: ${error.message}` });
  }
});

app.post('/api/auth/password/forgot', async (req, res) => {
  const data = parseBody(PASSWORD_FORGOT_SCHEMA, req, res);
  if (!data) return;

  const user = await store.getUserByEmail(data.email);
  const baseResponse = {
    ok: true,
    message: 'If an account exists, reset instructions were sent.',
  };

  if (!user) {
    return res.json(baseResponse);
  }

  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  await store.savePasswordResetToken(tokenHash, {
    email: data.email,
    expiresAt,
    usedAt: null,
    createdAt: new Date().toISOString(),
  });

  // In production, this should send an email. For local dev, we surface token for testing.
  console.log(`[auth] reset token for ${data.email}: ${token}`);
  if (process.env.NODE_ENV !== 'production') {
    return res.json({ ...baseResponse, debugResetToken: token });
  }
  return res.json(baseResponse);
});

app.post('/api/auth/password/reset', async (req, res) => {
  const data = parseBody(PASSWORD_RESET_SCHEMA, req, res);
  if (!data) return;

  const tokenHash = hashToken(data.token);
  const record = await store.getPasswordResetToken(tokenHash);
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset token' });
  if (record.usedAt) return res.status(400).json({ error: 'Reset token already used' });
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const user = await store.getUserByEmail(record.email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(data.password, 10);
  await store.upsertUser({ ...user, passwordHash });
  await store.markPasswordResetTokenUsed(tokenHash);
  return res.json({ ok: true });
});

app.post('/api/auth/signin', async (req, res) => {
  const data = parseBody(ID_TOKEN_SCHEMA, req, res);
  if (!data) return;

  const firebaseUser = await userFromFirebaseIdToken(data.idToken);
  if (firebaseUser) {
    const user = await upsertFirebaseUser(firebaseUser);
    return res.json({ token: issueToken(user), user: publicUser(user) });
  }

  const pseudoEmail = `apple_${data.idToken.slice(0, 8)}@example.local`;
  let user = await store.getUserByEmail(pseudoEmail);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: pseudoEmail,
      displayName: 'Apple User',
      passwordHash: '',
      tier: 'free',
      interests: [],
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
    };
    await store.upsertUser(user);
  }
  return res.json({ token: issueToken(user), user: publicUser(user) });
});

app.post('/api/auth/signup', async (req, res) => {
  const tokenData = parseBody(ID_TOKEN_SCHEMA, req, res);
  if (!tokenData) return;
  const interestsData = parseBody(INTERESTS_SCHEMA, req, res);
  if (!interestsData) return;

  const firebaseUser = await userFromFirebaseIdToken(tokenData.idToken);
  if (firebaseUser) {
    const user = await upsertFirebaseUser(firebaseUser, interestsData.interests);
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  }

  const pseudoEmail = `apple_${tokenData.idToken.slice(0, 8)}@example.local`;
  let user = await store.getUserByEmail(pseudoEmail);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: pseudoEmail,
      displayName: 'Apple User',
      passwordHash: '',
      tier: 'free',
      interests: interestsData.interests,
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
    };
  } else {
    user = { ...user, interests: interestsData.interests };
  }
  await store.upsertUser(user);
  return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

app.patch('/api/auth/interests', auth, async (req, res) => {
  const data = parseBody(INTERESTS_SCHEMA, req, res);
  if (!data) return;
  const user = await store.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await store.upsertUser({ ...user, interests: data.interests });
  return res.json({ ok: true });
});

app.patch('/api/auth/onboarding', auth, async (req, res) => {
  const data = parseBody(ONBOARDING_SCHEMA, req, res);
  if (!data) return;
  const user = await store.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const updated = {
    ...user,
    onboardingCompleted: data.completed,
    onboardingCompletedAt: data.completed ? new Date().toISOString() : null,
  };
  await store.upsertUser(updated);
  return res.json({ user: publicUser(updated) });
});

app.patch('/api/auth/tier', auth, async (req, res) => {
  const data = parseBody(TIER_SCHEMA, req, res);
  if (!data) return;
  const user = await store.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await store.upsertUser({ ...user, tier: data.tier });
  return res.json({ ok: true });
});

app.delete('/api/auth/account', auth, async (req, res) => {
  if (!store.deleteUserData) {
    return res.status(501).json({ error: 'Account deletion is not available for this store.' });
  }
  await store.deleteUserData(req.userId);
  return res.json({ ok: true });
});

app.get('/api/x/discover', auth, async (req, res) => {
  const parsed = X_DISCOVER_QUERY_SCHEMA.safeParse(req.query || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid discovery request' });
  }

  const requestedTopics = String(parsed.data.topics || '')
    .split(',')
    .map((topic) => topic.trim())
    .filter(Boolean);
  const user = await store.getUserById(req.userId);

  if (!user && !requestedTopics.length) {
    return res.status(404).json({ error: 'User not found' });
  }

  const topics = normalizeInterestTopics(requestedTopics, user?.interests || []);
  if (!topics.length) return res.json({ items: [], next_cursor: undefined, needsApiKey: false });

  const perTopicLimit = Math.max(1, Math.ceil(parsed.data.limit / topics.length));
  const results = await Promise.all(topics.map((topic) => fetchXDiscoveryForTopic(topic, perTopicLimit)));
  const needsApiKey = results.some((result) => result.needsApiKey);
  const errors = results
    .filter((result) => result.error)
    .map((result) => ({ status: result.status, message: result.error }));
  const items = results
    .flatMap((result) => result.items)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, parsed.data.limit);

  if (items.length) await store.upsertFeedItems(items);

  return res.json({
    items,
    next_cursor: undefined,
    needsApiKey,
    errors,
  });
});

app.get('/api/x/bookmarks/connect', auth, async (req, res) => {
  const config = xOAuthConfig();
  if (!config.configured) {
    return res.status(503).json({
      configured: false,
      error: 'X OAuth is not configured. Set X_CLIENT_ID and X_REDIRECT_URI on the backend.',
    });
  }

  const state = base64Url(crypto.randomBytes(24));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  await store.saveXOAuthState(state, {
    userId: req.userId,
    verifier,
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
    createdAt: new Date().toISOString(),
  });

  const authorizationUrl = new URL('https://x.com/i/oauth2/authorize');
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('scope', config.scopes);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  return res.json({
    configured: true,
    authorizationUrl: authorizationUrl.toString(),
    scopes: config.scopes.split(/\s+/),
  });
});

app.get('/api/x/oauth/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) {
    return res.status(400).type('html').send('<h1>Nomi X connection failed</h1><p>Missing authorization code or state.</p>');
  }

  try {
    const stateRecord = await store.consumeXOAuthState(state);
    if (!stateRecord) {
      return res.status(400).type('html').send('<h1>Nomi X connection failed</h1><p>This connection link expired. Please try again in Nomi.</p>');
    }

    if (new Date(stateRecord.expiresAt).getTime() < Date.now()) {
      return res.status(400).type('html').send('<h1>Nomi X connection failed</h1><p>This connection link expired. Please try again in Nomi.</p>');
    }

    const tokenPayload = await exchangeXAuthorizationCode(code, stateRecord.verifier);
    const xUser = await fetchXMe(tokenPayload.access_token);
    await store.upsertXBookmarkConnection(stateRecord.userId, {
      xUserId: xUser.id,
      username: xUser.username,
      name: xUser.name,
      profileImageUrl: xUser.profile_image_url,
      encryptedRefreshToken: encryptToken(tokenPayload.refresh_token),
      encryptedAccessToken: encryptToken(tokenPayload.access_token),
      tokenExpiresAt: tokenPayload.expires_in
        ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
        : null,
      scopes: String(tokenPayload.scope || '').split(/\s+/).filter(Boolean),
      connectedAt: new Date().toISOString(),
      lastSyncError: null,
    });
    await updateXBookmarkSyncState(stateRecord.userId, {
      enabled: false,
      syncInProgress: false,
      lastErrorMessage: null,
    });

    return res.type('html').send(`
      <html>
        <head><title>Nomi X connected</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;background:#fff7fb;color:#17161d;">
          <h1>X bookmarks connected</h1>
          <p>Nomi can now import new bookmarks from @${xUser.username}. You can close this page and return to Nomi.</p>
        </body>
      </html>
    `);
  } catch (error) {
    return res.status(502).type('html').send(`<h1>Nomi X connection failed</h1><p>${String(error.message || error)}</p>`);
  }
});

app.get('/api/x/bookmarks/status', auth, async (req, res) => {
  const connection = await store.getXBookmarkConnection(req.userId);
  const syncState = await getXBookmarkSyncState(req.userId);
  const aiLimit = await getAIProcessingLimitForUser(req.userId, { store }).catch(() => null);
  return res.json({
    connected: !!connection,
    username: connection?.username || null,
    xUserId: connection?.xUserId || null,
    connectedAt: connection?.connectedAt || null,
    lastSyncedAt: connection?.lastSyncedAt || syncState.lastSyncedAt || null,
    lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt || null,
    lastFailedSyncAt: syncState.lastFailedSyncAt || null,
    lastScheduledSyncAt: syncState.lastScheduledSyncAt || null,
    lastManualSyncAt: syncState.lastManualSyncAt || null,
    lastImportedCount: connection?.lastImportedCount || 0,
    lastDuplicateCount: connection?.lastDuplicateCount || 0,
    lastFailedCount: connection?.lastFailedCount || 0,
    lastSyncStatus: connection?.lastSyncStatus || syncState.lastResult || 'idle',
    lastSyncError: connection?.lastSyncError || syncState.lastError || syncState.lastErrorMessage || null,
    lastResult: syncState.lastResult || connection?.lastSyncStatus || null,
    importedCount: Number(syncState.importedCount || connection?.lastImportedCount || 0),
    skippedDuplicateCount: Number(syncState.skippedDuplicateCount || connection?.lastDuplicateCount || 0),
    failedCount: Number(syncState.failedCount || connection?.lastFailedCount || 0),
    nextEligibleSyncAt: syncState.nextEligibleSyncAt || null,
    dailySyncEnabled: syncState.enabled === true,
    syncInProgress: syncState.syncInProgress === true,
    totalImported: Number(syncState.totalImported || 0),
    totalFailed: Number(syncState.totalFailed || 0),
    aiUsage: aiLimit ? {
      tier: aiLimit.tier,
      limit: aiLimit.limit,
      used: aiLimit.used,
      remaining: aiLimit.remaining,
      dateKey: aiLimit.dateKey,
      processedCount: aiLimit.processedCount,
      briefGeneratedCount: aiLimit.briefGeneratedCount,
      projectSummaryCount: aiLimit.projectSummaryCount,
      failedCount: aiLimit.failedCount,
      skippedCount: aiLimit.skippedCount,
    } : undefined,
  });
});

app.get('/api/ai/usage', auth, async (req, res) => {
  const usage = await getAIProcessingDailyUsage(req.userId, { store }).catch(() => null);
  const limit = await getAIProcessingLimitForUser(req.userId, { store }).catch(() => null);
  if (!usage || !limit) return res.status(503).json({ error: 'AI usage is not available.' });
  return res.json({
    tier: limit.tier,
    limit: limit.limit,
    used: limit.used,
    remaining: limit.remaining,
    dateKey: limit.dateKey,
    processedCount: limit.processedCount,
    briefGeneratedCount: limit.briefGeneratedCount,
    projectSummaryCount: limit.projectSummaryCount,
    failedCount: limit.failedCount,
    skippedCount: limit.skippedCount,
    lastProcessedAt: usage.lastProcessedAt || null,
    updatedAt: usage.updatedAt || null,
  });
});

app.delete('/api/x/bookmarks/connection', auth, async (req, res) => {
  await store.deleteXBookmarkConnection(req.userId);
  await updateXBookmarkSyncState(req.userId, {
    enabled: false,
    syncInProgress: false,
    lastErrorMessage: null,
  });
  return res.json({ ok: true });
});

app.post('/api/x/bookmarks/sync', auth, async (req, res) => {
  const parsed = X_BOOKMARK_SYNC_SCHEMA.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid sync request' });
  }

  const result = await syncXBookmarksForUser(req.userId, parsed.data);
  const responseBody = {
    ok: result.status !== 'failed',
    status: result.status,
    imported: result.importedCount,
    skipped: result.duplicateCount,
    checked: result.checkedCount,
    importedCount: result.importedCount,
    duplicateCount: result.duplicateCount,
    failedCount: result.failedCount,
    aiProcessedCount: result.aiProcessedCount || 0,
    aiSkippedCount: result.aiSkippedCount || 0,
    aiFailedCount: result.aiFailedCount || 0,
    aiLimitReached: result.aiLimitReached === true,
    aiUsage: result.aiUsage,
    errors: result.errors,
    memories: result.memories,
  };

  if (result.status === 'failed') {
    return res.status(result.errors[0] === 'Connect X bookmarks before syncing.' ? 409 : 502).json({
      ...responseBody,
      error: result.errors[0] || 'X bookmark sync failed.',
    });
  }

  return res.json(responseBody);
});

app.post('/api/x/bookmarks/daily-sync', auth, async (req, res) => {
  const data = parseBody(X_BOOKMARK_DAILY_SYNC_SCHEMA, req, res);
  if (!data) return;

  const state = await updateXBookmarkSyncState(req.userId, {
    enabled: data.enabled,
    nextEligibleSyncAt: data.enabled ? nextDailySyncIso(new Date(Date.now() - 24 * 60 * 60 * 1000)) : null,
    lastErrorMessage: null,
    lastError: null,
  });
  await store.updateUserById?.(req.userId, {
    xBookmarksDailySyncEnabled: data.enabled,
  }).catch(() => null);

  return res.json({
    ok: true,
    dailySyncEnabled: state?.enabled === true,
    syncState: state,
  });
});

app.post('/api/admin/x-bookmarks/run-scheduled', auth, requireAdmin, async (req, res) => {
  const data = parseBody(SCHEDULED_RUN_SCHEMA, req, res);
  if (!data) return;
  const result = await runScheduledXBookmarkSync(data);
  return res.status(result.status === 'disabled' ? 202 : 200).json(result);
});

app.post('/api/x/bookmarks/retry', auth, async (req, res) => {
  const result = await retryFailedBookmarkImports(req.userId);
  return res.status(result.status === 'failed' ? 502 : 200).json({
    ok: result.status !== 'failed',
    status: result.status,
    imported: result.importedCount,
    skipped: result.duplicateCount,
    checked: result.checkedCount,
    importedCount: result.importedCount,
    duplicateCount: result.duplicateCount,
    failedCount: result.failedCount,
    aiProcessedCount: result.aiProcessedCount || 0,
    aiSkippedCount: result.aiSkippedCount || 0,
    aiFailedCount: result.aiFailedCount || 0,
    aiLimitReached: result.aiLimitReached === true,
    aiUsage: result.aiUsage,
    errors: result.errors,
    memories: result.memories,
  });
});

app.get('/api/feed', auth, async (_req, res) => {
  const items = await store.getFeedItems();
  return res.json({ items, next_cursor: undefined });
});

app.post('/api/feed/:id/ingest', auth, async (req, res) => {
  const items = await store.getFeedItems();
  const item = items.find((f) => f.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Feed item not found' });

  await store.markFeedInBrain(item.id);
  const source = {
    ...newSource(item.title, item.source_type),
    body: String(item.body || item.summary || ''),
    source_url: item.url,
    authorUsername: item.authorUsername,
    postDate: item.postDate || item.published_at,
    links: Array.isArray(item.links) ? item.links : [],
    media: Array.isArray(item.media) ? item.media : [],
    referencedPosts: Array.isArray(item.referencedPosts) ? item.referencedPosts : [],
    category: item.category || 'General',
    tags: Array.isArray(item.tags) && item.tags.length ? item.tags : ['feed'],
  };
  await store.addSource(req.userId, source);
  await writeNativeMemoryDocumentFromSource(req.userId, source);

  return res.json({
    success: true,
    source_id: source.id,
    title: item.title,
    message: 'Added to your brain',
  });
});

app.get('/api/stats', auth, async (req, res) => {
  const sourceCount = await store.countSources(req.userId);
  return res.json({
    sources: { total: sourceCount, processed: sourceCount },
    entities: 3,
    claims: { total: 2, supported: 1, disputed: 0, weak: 1 },
    wiki_pages: 1,
  });
});

app.get('/api/wiki', auth, (_req, res) => {
  return res.json({ pages: [] });
});

app.get('/api/wiki/:slug', auth, (req, res) => {
  return res.status(404).type('text/markdown').send(`# ${req.params.slug}\n\nNo wiki page found.`);
});

app.get('/api/claims', auth, (_req, res) => {
  return res.json({ claims: [] });
});

app.get('/api/entities', auth, (_req, res) => {
  return res.json({ entities: [] });
});

app.post('/api/brain/query', auth, async (req, res) => {
  const data = parseBody(BRAIN_QUERY_SCHEMA, req, res);
  if (!data) return;
  const query = String(data.question || '').toLowerCase();
  const sources = await store.listSources(req.userId);
  const related = sources
    .filter((source) => (`${source.title || ''} ${source.body || ''}`).toLowerCase().includes(query))
    .slice(0, 3)
    .map((source) => String(source.id));
  return res.json({
    answer: related.length
      ? `I found ${related.length} related memories for "${data.question}".`
      : `I do not see an exact match for "${data.question}" yet, but keep capturing and I will get sharper.`,
    sources: related,
  });
});

app.post('/api/x-post/preview', auth, async (req, res) => {
  const data = parseBody(X_POST_PREVIEW_SCHEMA, req, res);
  if (!data) return;
  const parsed = parseXPostUrl(data.url);
  if (!parsed) return res.status(400).json({ error: 'Paste a valid x.com or twitter.com post URL.' });

  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return res.json({
      needsApiKey: true,
      post: {
        id: parsed.postId,
        username: parsed.username,
        url: parsed.url,
        title: `@${parsed.username} on X`,
      },
      message: 'X import is not configured on the backend yet.',
    });
  }

  const lookupUrl = new URL(`https://api.x.com/2/tweets/${parsed.postId}`);
  lookupUrl.searchParams.set('tweet.fields', 'attachments,created_at,entities,text,note_tweet,referenced_tweets');
  lookupUrl.searchParams.set('expansions', 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys');
  lookupUrl.searchParams.set('user.fields', 'username,name,profile_image_url');
  lookupUrl.searchParams.set('media.fields', 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,variants,width');

  const xRes = await fetch(lookupUrl, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const payload = await xRes.json().catch(() => null);
  if (!xRes.ok || !payload?.data) {
    return res.status(502).json({
      error: payload?.detail || payload?.title || 'X did not return this post.',
    });
  }

  const user = payload.includes?.users?.find((item) => item.id === payload.data.author_id);
  const text = payload.data.note_tweet?.text || payload.data.text || '';
  const links = normalizeXLinks(payload.data.entities?.urls);
  const mediaByKey = new Map((payload.includes?.media || []).map((item) => [item.media_key, item]));
  const media = xMediaForTweet(payload.data, mediaByKey);
  const referencedPosts = normalizeXReferencedPosts(payload, payload.data);
  const generated = generateMemoryMetadata(text);
  const username = user?.username || parsed.username;
  return res.json({
    needsApiKey: false,
    post: {
      id: parsed.postId,
      username,
      url: parsed.url,
      text,
      postDate: payload.data.created_at,
      category: generated.category,
      tags: ['xpost', ...generated.tags],
      links,
      media,
      referencedPosts,
      title: `@${username} on X`,
    },
  });
});

app.post('/api/ingest', auth, async (req, res) => {
  const data = parseBody(INGEST_SCHEMA, req, res);
  if (!data) return;
  const rawText = data.raw_text || data.url || '';
  const title = data.title || fallbackTitle(rawText) || data.url || 'Untitled source';
  let category = data.category || 'General';
  let tags = data.tags?.length ? data.tags : ['capture'];
  try {
    const generated = generateMemoryMetadata(rawText);
    category = data.category || generated.category;
    tags = data.tags?.length ? data.tags : (generated.tags.length ? generated.tags : ['capture']);
  } catch {
    // Keep save path resilient even if metadata generation fails.
  }
  const source = {
    ...newSource(String(title), data.type || (data.url ? 'url' : 'note')),
    body: String(rawText || ''),
    source_url: data.url,
    authorUsername: data.authorUsername,
    postDate: data.postDate,
    links: data.links,
    media: data.media,
    referencedPosts: data.referencedPosts,
    category,
    tags,
  };
  await store.addSource(req.userId, source);
  await writeNativeMemoryDocumentFromSource(req.userId, source);
  let aiProcessing;
  if (data.processWithAI) {
    aiProcessing = await processMemoryForAI(req.userId, source.id, { forceReprocess: false, store });
  }
  return res.json({
    success: true,
    source_id: source.id,
    title: String(title),
    message: 'Source queued for processing',
    aiProcessing,
  });
});

app.post('/api/process', auth, async (req, res) => {
  const processed = await store.countSources(req.userId);
  return res.json({ processed });
});

app.get('/api/sources', auth, async (req, res) => {
  const sources = await store.listSources(req.userId);
  return res.json({ sources });
});

app.get('/api/memories', auth, async (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim().toLowerCase();
  const tag = String(req.query.tag || '').trim().toLowerCase();
  const type = String(req.query.type || '').trim().toLowerCase();
  const sources = await store.listSources(req.userId);
  const filtered = sources.filter((source) => {
    const tags = Array.isArray(source.tags) ? source.tags.map((item) => String(item).toLowerCase()) : [];
    const matchesQuery = query
      ? `${String(source.title || '')} ${String(source.body || '')} ${String(source.authorUsername || '')}`.toLowerCase().includes(query)
      : true;
    const matchesCategory = category ? String(source.category || 'General').toLowerCase() === category : true;
    const matchesTag = tag ? tags.includes(tag) : true;
    const matchesType = type ? String(source.source_type || 'note').toLowerCase() === type : true;
    return matchesQuery && matchesCategory && matchesTag && matchesType;
  });
  const memories = filtered
    .sort((a, b) => sourceTimestampMs(b) - sourceTimestampMs(a))
    .map((source) => ({
      id: String(source.id),
      title: String(source.title || 'Untitled memory'),
      sourceType: memorySourceType(source.source_type, source.importSource),
      sourceUrl: source.source_url,
      sourceId: source.externalId ? String(source.externalId) : undefined,
      rawText: String(source.body || ''),
      summary: String(source.summary || source.body || '').slice(0, 240),
      source_type: String(source.source_type || 'note'),
      createdAt: source.createdAt,
      capturedAt: source.postDate || source.createdAt,
      category: source.category || 'General',
      tags: Array.isArray(source.tags) ? source.tags : [],
      concepts: Array.isArray(source.concepts) ? source.concepts : [],
      entities: Array.isArray(source.entities) ? source.entities : [],
      userId: source.userId,
      body: String(source.body || ''),
      source_url: source.source_url,
      authorUsername: source.authorUsername,
      author: cleanObject({
        id: source.authorId,
        username: source.authorUsername,
        displayName: source.authorDisplayName,
        avatarUrl: source.authorAvatarUrl,
      }),
      intent: source.intent || 'unknown',
      projectIds: Array.isArray(source.projectIds) ? source.projectIds : [],
      isArchived: source.isArchived === true,
      isFavorite: source.isFavorite === true,
      sync: cleanObject({
        provider: source.importSource === 'x_bookmark' ? 'x' : 'manual',
        importStatus: source.importSource === 'x_bookmark' ? 'imported' : undefined,
        retryCount: Number(source.retryCount || 0),
        rawPayloadHash: source.rawPayloadHash,
      }),
      postDate: source.postDate,
      links: Array.isArray(source.links) ? source.links : [],
      media: Array.isArray(source.media) ? source.media : [],
      referencedPosts: Array.isArray(source.referencedPosts) ? source.referencedPosts : [],
    }));
  return res.json({ memories });
});

app.post('/api/memories/import-legacy', auth, async (req, res) => {
  if (!admin.apps.length) {
    return res.status(503).json({ error: 'Firebase Admin is not configured for migration.' });
  }

  const email = String(req.firebaseUser?.email || '').toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'A Firebase email is required to import legacy memories.' });
  }

  const legacyUser = await store.getUserByEmail(email);
  if (!legacyUser?.id) {
    return res.json({ imported: 0, skipped: 0, message: 'No legacy account found for this email.' });
  }

  const sources = await store.listSources(legacyUser.id);
  if (!sources.length) {
    return res.json({ imported: 0, skipped: 0, message: 'No legacy memories found for this email.' });
  }

  const db = admin.firestore();
  const memoriesCollection = db.collection('users').doc(req.userId).collection('memories');
  let imported = 0;
  let skipped = 0;
  let batch = db.batch();
  let operationCount = 0;

  for (const source of sources) {
    const documentId = String(source.id);
    const reference = memoriesCollection.doc(documentId);
    const existing = await reference.get();
    if (existing.exists) {
      skipped += 1;
      continue;
    }

    batch.set(reference, nativeMemoryFromSource(source, req.userId), { merge: true });
    imported += 1;
    operationCount += 1;

    if (operationCount >= 450) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  return res.json({
    imported,
    skipped,
    legacyUserId: legacyUser.id,
  });
});

app.post('/api/memories/process-unprocessed', auth, async (req, res) => {
  const data = parseBody(PROCESS_MEMORIES_BATCH_SCHEMA, req, res);
  if (!data) return;
  try {
    const result = await processUnprocessedMemoriesForUser(req.userId, { ...data, store });
    return res.status(result.limitReached && result.processedCount === 0 ? 429 : 200).json(
      result.limitReached && result.processedCount === 0
        ? { ...limitReachedPayload(await getAIProcessingLimitForUser(req.userId, { store })), ...result }
        : result,
    );
  } catch (error) {
    return res.status(503).json({
      processedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      errors: [error.message || 'AI batch processing is not available.'],
    });
  }
});

app.post('/api/memories/process-recent', auth, async (req, res) => {
  const data = parseBody(PROCESS_MEMORIES_BATCH_SCHEMA, req, res);
  if (!data) return;
  try {
    const result = await processRecentImportedMemories(req.userId, { ...data, store });
    return res.status(result.limitReached && result.processedCount === 0 ? 429 : 200).json(
      result.limitReached && result.processedCount === 0
        ? { ...limitReachedPayload(await getAIProcessingLimitForUser(req.userId, { store })), ...result }
        : result,
    );
  } catch (error) {
    return res.status(503).json({
      processedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      errors: [error.message || 'AI recent-memory processing is not available.'],
    });
  }
});

app.post('/api/memories/:id/process-ai', auth, async (req, res) => {
  const data = parseBody(PROCESS_MEMORY_AI_SCHEMA, req, res);
  if (!data) return;
  const result = await processMemoryForAI(req.userId, req.params.id, { ...data, store });
  const statusCode = result.status === 'limited'
    ? 429
    : result.status === 'failed' && result.error === 'Memory not found.' ? 404 : 200;
  return res.status(statusCode).json(result);
});

app.get('/api/memories/:id', auth, async (req, res) => {
  const memory = await store.getSourceById(req.userId, req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found' });
  return res.json({
    memory: {
      id: String(memory.id),
      title: String(memory.title || 'Untitled memory'),
      source_type: String(memory.source_type || 'note'),
      createdAt: memory.createdAt,
      category: memory.category || 'General',
      tags: Array.isArray(memory.tags) ? memory.tags : [],
      userId: memory.userId,
      body: String(memory.body || ''),
      source_url: memory.source_url,
      authorUsername: memory.authorUsername,
      postDate: memory.postDate,
      links: Array.isArray(memory.links) ? memory.links : [],
      media: Array.isArray(memory.media) ? memory.media : [],
      referencedPosts: Array.isArray(memory.referencedPosts) ? memory.referencedPosts : [],
    },
  });
});

app.patch('/api/memories/:id', auth, async (req, res) => {
  const data = parseBody(MEMORY_UPDATE_SCHEMA, req, res);
  if (!data) return;
  const updated = await store.updateSource(req.userId, req.params.id, data);
  if (!updated) return res.status(404).json({ error: 'Memory not found' });
  return res.json({
    memory: {
      id: String(updated.id),
      title: String(updated.title || 'Untitled memory'),
      source_type: String(updated.source_type || 'note'),
      createdAt: updated.createdAt,
      category: updated.category || 'General',
      tags: Array.isArray(updated.tags) ? updated.tags : [],
      userId: updated.userId,
      body: String(updated.body || ''),
      source_url: updated.source_url,
      authorUsername: updated.authorUsername,
      postDate: updated.postDate,
      links: Array.isArray(updated.links) ? updated.links : [],
      media: Array.isArray(updated.media) ? updated.media : [],
      referencedPosts: Array.isArray(updated.referencedPosts) ? updated.referencedPosts : [],
    },
  });
});

app.delete('/api/memories/:id', auth, async (req, res) => {
  const removed = await store.deleteSource(req.userId, req.params.id);
  if (!removed) return res.status(404).json({ error: 'Memory not found' });
  return res.json({ ok: true });
});

app.get('/api/daily-briefs', auth, async (req, res) => {
  try {
    const briefs = await listDailyBriefs(req.userId, { limit: req.query.limit });
    return res.json({ briefs });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Briefs are not available.' });
  }
});

app.get('/api/daily-briefs/today', auth, async (req, res) => {
  const data = parseQuery(DAILY_BRIEF_QUERY_SCHEMA, req, res);
  if (!data) return;
  const dateKey = data.dateKey || dateKeyFor(new Date(), data.timezone);
  try {
    const brief = await generateDailyBriefForUser(req.userId, dateKey, { ...data, store });
    return res.json({ brief });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Brief generation is not available.' });
  }
});

app.post('/api/daily-briefs/generate-today', auth, async (req, res) => {
  const data = parseBody(DAILY_BRIEF_QUERY_SCHEMA, req, res);
  if (!data) return;
  const dateKey = data.dateKey || dateKeyFor(new Date(), data.timezone);
  try {
    const brief = await generateDailyBriefForUser(req.userId, dateKey, { ...data, store });
    return res.json({ brief });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Brief generation is not available.' });
  }
});

app.post('/api/daily-briefs/generate-for-date', auth, async (req, res) => {
  const data = parseBody(DAILY_BRIEF_QUERY_SCHEMA.extend({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }), req, res);
  if (!data) return;
  try {
    const brief = await generateDailyBriefForUser(req.userId, data.dateKey, { ...data, store });
    return res.json({ brief });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Brief generation is not available.' });
  }
});

app.post('/api/admin/daily-briefs/run-scheduled', auth, requireAdmin, async (req, res) => {
  const data = parseBody(SCHEDULED_RUN_SCHEMA.extend({
    forceRegenerate: z.boolean().optional().default(false),
  }), req, res);
  if (!data) return;
  const result = await runScheduledDailyBriefGeneration(data);
  return res.status(result.status === 'disabled' ? 202 : 200).json(result);
});

app.get('/api/daily-briefs/:dateKey', auth, async (req, res) => {
  try {
    const brief = await getDailyBrief(req.userId, req.params.dateKey);
    if (!brief) return res.status(404).json({ error: 'Daily Brief not found' });
    return res.json({ brief });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Briefs are not available.' });
  }
});

app.post('/api/daily-briefs/:dateKey/generate', auth, async (req, res) => {
  const data = parseBody(DAILY_BRIEF_QUERY_SCHEMA, req, res);
  if (!data) return;
  try {
    const brief = await generateDailyBriefForUser(req.userId, req.params.dateKey, { ...data, store });
    return res.json({ brief });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Daily Brief generation is not available.' });
  }
});

app.get('/api/projects', auth, async (req, res) => {
  try {
    const projects = await listProjects(req.userId, { includeArchived: String(req.query.includeArchived) === 'true' });
    return res.json({ projects });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Projects are not available.' });
  }
});

app.post('/api/projects', auth, async (req, res) => {
  const data = parseBody(PROJECT_CREATE_SCHEMA, req, res);
  if (!data) return;
  try {
    const project = await createProject(req.userId, data);
    return res.status(201).json({ project });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not create project.' });
  }
});

app.get('/api/projects/:projectId', auth, async (req, res) => {
  try {
    const project = await getProject(req.userId, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ project });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Projects are not available.' });
  }
});

app.patch('/api/projects/:projectId', auth, async (req, res) => {
  const data = parseBody(PROJECT_UPDATE_SCHEMA, req, res);
  if (!data) return;
  try {
    await updateProject(req.userId, req.params.projectId, data);
    const project = await getProject(req.userId, req.params.projectId);
    return res.json({ project });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not update project.' });
  }
});

app.post('/api/projects/:projectId/archive', auth, async (req, res) => {
  try {
    await archiveProject(req.userId, req.params.projectId);
    const project = await getProject(req.userId, req.params.projectId);
    return res.json({ project });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not archive project.' });
  }
});

app.get('/api/projects/:projectId/memories', auth, async (req, res) => {
  try {
    const memories = await listProjectMemories(req.userId, req.params.projectId);
    return res.json({ memories });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Project memories are not available.' });
  }
});

app.post('/api/projects/:projectId/memories', auth, async (req, res) => {
  const data = parseBody(PROJECT_MEMORY_SCHEMA, req, res);
  if (!data) return;
  try {
    const ok = await assignMemoryToProject(req.userId, data.memoryId, req.params.projectId);
    if (!ok) return res.status(404).json({ error: 'Project or memory not found' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not assign memory.' });
  }
});

app.delete('/api/projects/:projectId/memories/:memoryId', auth, async (req, res) => {
  try {
    const ok = await removeMemoryFromProject(req.userId, req.params.memoryId, req.params.projectId);
    if (!ok) return res.status(404).json({ error: 'Project or memory not found' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Could not remove memory.' });
  }
});

app.get('/api/projects/:projectId/suggestions', auth, async (req, res) => {
  try {
    const suggestions = await suggestMemoriesForProject(req.userId, req.params.projectId, { limit: req.query.limit });
    return res.json({ suggestions });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Project suggestions are not available.' });
  }
});

app.post('/api/projects/:projectId/summary', auth, async (req, res) => {
  const data = parseBody(PROJECT_SUMMARY_SCHEMA, req, res);
  if (!data) return;
  try {
    const project = await generateProjectSummary(req.userId, req.params.projectId, { ...data, store });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ project });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Project summary is not available.' });
  }
});

app.get('/api/dashboard/summary', auth, async (req, res) => {
  const sources = await store.listSources(req.userId);
  if (!sources.length) return res.json({ summary: null });
  const noteCount = sources.filter((s) => ['text', 'note'].includes(String(s.source_type || '').toLowerCase())).length;
  const linkCount = sources.filter((s) => ['url', 'rss', 'tweet'].includes(String(s.source_type || '').toLowerCase())).length;
  const topThemes = summarizeCategories(sources)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((c) => c.label.toLowerCase())
    .join(', ');

  return res.json({ summary: {
    title: 'AI summary ✨',
    subtitle: 'Generated just now',
    body: `You captured ${noteCount} notes and ${linkCount} links or posts. Top themes: ${topThemes || 'uncategorized'}.`,
    ctaLabel: 'View summary',
    stats: {
      noteCount,
      linkCount,
      totalCaptures: sources.length,
    },
  } });
});

app.get('/api/dashboard/memory', auth, async (req, res) => {
  const sources = await store.listSources(req.userId);
  const oldest = [...sources].sort((a, b) => sourceTimestampMs(a) - sourceTimestampMs(b))[0];
  if (!oldest) return res.json({ memory: null });
  return res.json({ memory: {
    title: 'Resurfaced memory ✨',
    timestamp: formatRelative(oldest),
    quote: String(oldest.body || oldest.title || ''),
    author: oldest.authorUsername ? `@${oldest.authorUsername}` : 'From your capture history',
    ctaLabel: 'Open note',
  } });
});

app.get('/api/dashboard/recent', auth, async (req, res) => {
  const sources = await store.listSources(req.userId);
  const items = sources
    .sort((a, b) => sourceTimestampMs(b) - sourceTimestampMs(a))
    .slice(0, 5)
    .map((source) => ({
      id: String(source.id || crypto.randomUUID()),
      title: String(source.title || 'Untitled capture'),
      meta: source.source_type === 'tweet'
        ? `${source.authorUsername ? `@${source.authorUsername} • ` : ''}${source.postDate || formatRelative(source)}`
        : `${String(source.source_type || 'note')} • ${formatRelative(source)}`,
      tag: captureTag(source.source_type),
      icon: captureIcon(source.source_type),
      body: String(source.body || ''),
      source_type: String(source.source_type || 'note'),
      media: Array.isArray(source.media) ? source.media : [],
      referencedPosts: Array.isArray(source.referencedPosts) ? source.referencedPosts : [],
    }));

  return res.json({ items });
});

app.get('/api/dashboard/categories', auth, async (req, res) => {
  const sources = await store.listSources(req.userId);
  return res.json({
    categories: summarizeCategories(sources),
  });
});

if (require.main === module && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Second Brain backend listening on http://localhost:${PORT} (${store.mode})`);
  });
}

module.exports = {
  app,
  runScheduledDailyBriefGeneration,
  runScheduledXBookmarkSync,
  syncXBookmarksForUser,
  retryFailedBookmarkImports,
};
