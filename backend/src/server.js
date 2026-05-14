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

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
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
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
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

function nativeMemoryFromSource(source, firebaseUserId) {
  const content = String(source.body || source.content || source.summary || '');
  const createdAtMs = sourceTimestampMs(source) || Date.now();
  const sourceDate = source.postDate || source.sourceDate;

  return cleanObject({
    id: String(source.id),
    userId: firebaseUserId,
    title: String(source.title || fallbackTitle(content) || 'Untitled memory'),
    content,
    category: String(source.category || 'General'),
    tags: Array.isArray(source.tags) ? source.tags.map(String).slice(0, 12) : [],
    createdAt: timestampFromValue(source.createdAt, createdAtMs),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    type: String(source.source_type || source.type || 'note'),
    sourceURL: source.source_url || source.sourceURL,
    sourceUsername: source.authorUsername || source.sourceUsername,
    sourceDate: sourceDate ? timestampFromValue(sourceDate, createdAtMs) : undefined,
    links: Array.isArray(source.links) ? source.links : [],
    media: Array.isArray(source.media) ? source.media : [],
    referencedPosts: Array.isArray(source.referencedPosts) ? source.referencedPosts : [],
    importedFromLegacyBackend: true,
    legacyUserId: source.userId,
  });
}

function parseXPostUrl(url = '') {
  const normalized = String(url || '').trim();
  const match = normalized.match(/(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/([0-9]+)/i);
  if (!match) return null;
  return {
    username: match[1],
    postId: match[2],
    url: `https://x.com/${match[1]}/status/${match[2]}`,
  };
}

function normalizeXLinks(urls = []) {
  return urls
    .map((item) => ({
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
    return {
      type: item.type,
      url: item.url,
      previewImageUrl: item.preview_image_url,
      altText: item.alt_text,
      width: item.width,
      height: item.height,
      variants,
    };
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

async function fetchXDiscoveryForTopic(topic, limit) {
  const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return {
      ok: false,
      needsApiKey: true,
      items: [],
      error: 'Add X_BEARER_TOKEN to backend/.env to fetch discovery posts automatically.',
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

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
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
      message: 'Add X_BEARER_TOKEN to backend/.env to fetch post content automatically.',
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
  return res.json({
    success: true,
    source_id: source.id,
    title: String(title),
    message: 'Source queued for processing',
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
      source_type: String(source.source_type || 'note'),
      createdAt: source.createdAt,
      category: source.category || 'General',
      tags: Array.isArray(source.tags) ? source.tags : [],
      userId: source.userId,
      body: String(source.body || ''),
      source_url: source.source_url,
      authorUsername: source.authorUsername,
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

module.exports = { app };
