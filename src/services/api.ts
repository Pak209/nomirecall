import * as SecureStore from 'expo-secure-store';
import {
  FeedItem, WikiPage, Claim, BrainStats,
  IngestPayload, IngestResult, InterestTag, MemoryItem, MemoryLink, MemoryMedia,
} from '../types';

const env = process.env as unknown as Record<string, string | undefined>;
const rawApiBase = env.EXPO_PUBLIC_API_BASE_URL ?? env.API_BASE_URL;
export const API_BASE = !rawApiBase || rawApiBase.includes('YOUR_RAILWAY_OR_NGROK_URL')
  ? 'http://localhost:3000/api'
  : rawApiBase;

const API_TIMEOUT_MS = 15_000;
const HEALTH_TIMEOUT_MS = 6_000;
const COLD_START_MESSAGE = 'Nomi is waking up the backend. Please try again in a few seconds.';

export interface DashboardSummary {
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  stats: {
    noteCount: number;
    linkCount: number;
    totalCaptures: number;
  };
}

export interface DashboardMemory {
  title: string;
  timestamp: string;
  quote: string;
  author: string;
  ctaLabel: string;
}

export interface DashboardRecentItem {
  id: string;
  title: string;
  meta: string;
  tag: string;
  icon: string;
  body?: string;
  source_type?: string;
  media?: MemoryMedia[];
}

export interface DashboardCategory {
  id: string;
  label: string;
  count: number;
  icon: string;
  bgColor: string;
}

export interface BrainQuerySource {
  memoryId: string;
  title: string;
  snippet: string;
  sourceUrl?: string;
  createdAt?: string;
  capturedAt?: string;
  relevanceReason?: string;
}

export interface BrainQueryResult {
  answer: string;
  sources: BrainQuerySource[];
  confidence: 'low' | 'medium' | 'high';
  retrievalMode: 'keyword-semantic-lite' | string;
  relatedMemoryIds?: string[];
}

// ── HTTP client ────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error: any) {
    throw new Error(apiFriendlyErrorMessage(error));
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const message = err.error?.message || err.error || err.detail || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const AuthAPI = {
  async signIn(idToken: string): Promise<{ token: string; user: any }> {
    return request('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
  },
  async signUp(idToken: string, interests: InterestTag[]): Promise<{ token: string; user: any }> {
    return request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ idToken, interests }),
    });
  },
  async updateInterests(interests: InterestTag[]): Promise<void> {
    return request('/auth/interests', {
      method: 'PATCH',
      body: JSON.stringify({ interests }),
    });
  },
  async updateOnboarding(completed: boolean): Promise<{ user: any }> {
    return request('/auth/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  },
  async updateTier(tier: string): Promise<void> {
    return request('/auth/tier', {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    });
  },
  async deleteAccount(): Promise<{ ok: boolean }> {
    return request('/auth/account', {
      method: 'DELETE',
    });
  },
  async forgotPassword(email: string): Promise<{ ok: boolean; message: string; debugResetToken?: string }> {
    return request('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  async resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
    return request('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
};

// ── Feed ───────────────────────────────────────────────────────────────────────

export const FeedAPI = {
  async getItems(params?: {
    topics?: InterestTag[];
    cursor?: string;
    limit?: number;
  }): Promise<{ items: FeedItem[]; next_cursor?: string; needsApiKey?: boolean; errors?: Array<{ status?: number; message: string }> }> {
    const qs = new URLSearchParams();
    if (params?.topics?.length) qs.set('topics', params.topics.join(','));
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    return request(`/x/discover${query}`);
  },

  async addToBrain(feedItemId: string): Promise<IngestResult> {
    return request(`/feed/${feedItemId}/ingest`, { method: 'POST' });
  },
};

// ── Brain / Knowledge Base ────────────────────────────────────────────────────

export const BrainAPI = {
  async getStats(): Promise<BrainStats> {
    return request('/stats');
  },

  async getWikiPages(): Promise<{ pages: WikiPage[] }> {
    return request('/wiki');
  },

  async getWikiPage(slug: string): Promise<string> {
    const res = await fetch(`${API_BASE}/wiki/${slug}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (!res.ok) throw new Error(`Page not found: ${slug}`);
    return res.text();
  },

  async getClaims(status?: string): Promise<{ claims: Claim[] }> {
    const qs = status ? `?status=${status}` : '';
    return request(`/claims${qs}`);
  },

  async getEntities(): Promise<{ entities: any[] }> {
    return request('/entities');
  },

  async query(question: string): Promise<BrainQueryResult> {
    return request('/brain/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },
};

// ── Ingest ────────────────────────────────────────────────────────────────────

export const IngestAPI = {
  async ingest(payload: IngestPayload): Promise<IngestResult> {
    return request('/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async process(): Promise<{ processed: number }> {
    return request('/process', { method: 'POST' });
  },

  async getSources(): Promise<{ sources: any[] }> {
    return request('/sources');
  },
};

// ── Dashboard ──────────────────────────────────────────────────────────────────

export const DashboardAPI = {
  async getSummary(): Promise<DashboardSummary | null> {
    const res = await request<DashboardSummary | { summary: DashboardSummary | null }>('/dashboard/summary');
    return 'summary' in res ? res.summary : res;
  },
  async getMemory(): Promise<DashboardMemory | null> {
    const res = await request<DashboardMemory | { memory: DashboardMemory | null }>('/dashboard/memory');
    return 'memory' in res ? res.memory : res;
  },
  async getRecent(): Promise<{ items: DashboardRecentItem[] }> {
    return request('/dashboard/recent');
  },
  async getCategories(): Promise<{ categories: DashboardCategory[] }> {
    return request('/dashboard/categories');
  },
};

// ── Memories ───────────────────────────────────────────────────────────────────

export const MemoryAPI = {
  async list(filters?: {
    search?: string;
    category?: string;
    tag?: string;
    type?: string;
  }): Promise<{ memories: MemoryItem[] }> {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('q', filters.search);
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.tag) qs.set('tag', filters.tag);
    if (filters?.type) qs.set('type', filters.type);
    const query = qs.toString() ? `?${qs}` : '';
    return request(`/memories${query}`);
  },
  async get(memoryId: string): Promise<{ memory: MemoryItem | null }> {
    return request(`/memories/${memoryId}`);
  },
  async update(memoryId: string, payload: { title?: string; category?: string; tags?: string[] }): Promise<{ memory: MemoryItem }> {
    return request(`/memories/${memoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  async remove(memoryId: string): Promise<{ ok: boolean }> {
    return request(`/memories/${memoryId}`, {
      method: 'DELETE',
    });
  },
  async processMemoryAI(memoryId: string, forceReprocess = false): Promise<AIProcessResult> {
    return request(`/memories/${memoryId}/process-ai`, {
      method: 'POST',
      body: JSON.stringify({ forceReprocess }),
    });
  },
  async processUnprocessedMemories(limit = 20, forceReprocess = false): Promise<AIBatchProcessResult> {
    return request('/memories/process-unprocessed', {
      method: 'POST',
      body: JSON.stringify({ limit, forceReprocess }),
    });
  },
  async processRecentMemories(limit = 20, forceReprocess = false): Promise<AIBatchProcessResult> {
    return request('/memories/process-recent', {
      method: 'POST',
      body: JSON.stringify({ limit, forceReprocess }),
    });
  },
};

export interface AIProcessResult {
  status: 'processed' | 'skipped' | 'failed' | 'limited';
  memoryId: string;
  error?: string;
  tier?: 'free' | 'early_access' | 'admin';
  limit?: number;
  used?: number;
  remaining?: number;
  resetDateKey?: string;
}

export interface AIBatchProcessResult {
  status?: 'success' | 'partial_success' | 'limit_reached' | 'failed';
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  limitReached?: boolean;
  errors: string[];
  usage?: AIUsageMetadata;
}

export interface AIUsageMetadata {
  tier: 'free' | 'early_access' | 'admin';
  limit: number;
  usedBefore?: number;
  usedAfter?: number;
  used?: number;
  remainingBefore?: number;
  remainingAfter?: number;
  remaining?: number;
  dateKey: string;
  processedCount?: number;
  briefGeneratedCount?: number;
  projectSummaryCount?: number;
  failedCount?: number;
  skippedCount?: number;
  lastProcessedAt?: string | null;
  updatedAt?: string | null;
  limitsDisabled?: boolean;
}

export const IntelligenceAPI = {
  async getAiUsageStatus(): Promise<AIUsageMetadata> {
    return request('/ai/usage');
  },
  async generateTodayBrief(force = false): Promise<{ brief: any }> {
    return request('/daily-briefs/generate-today', {
      method: 'POST',
      body: JSON.stringify({ forceRegenerate: force }),
    });
  },
  async getTodayBrief(): Promise<{ brief: any }> {
    return request('/daily-briefs/today');
  },
  async getProjects(): Promise<{ projects: any[] }> {
    return request('/projects');
  },
  async generateProjectSummary(projectId: string): Promise<{ project: any }> {
    return request(`/projects/${projectId}/summary`, {
      method: 'POST',
      body: JSON.stringify({ forceRegenerate: false }),
    });
  },
};

// ── X / Twitter ────────────────────────────────────────────────────────────────

export interface XPostPreview {
  needsApiKey: boolean;
  message?: string;
  post: {
    id: string;
    username: string;
    url: string;
    title?: string;
    text?: string;
    postDate?: string;
    category?: string;
    tags?: string[];
    links?: MemoryLink[];
    media?: MemoryMedia[];
  };
}

export const XPostAPI = {
  async preview(url: string): Promise<XPostPreview> {
    return request('/x-post/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },
};

export interface XBookmarkStatus {
  connected: boolean;
  username?: string | null;
  xUserId?: string | null;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastFailedSyncAt?: string | null;
  lastScheduledSyncAt?: string | null;
  lastManualSyncAt?: string | null;
  lastImportedCount?: number;
  lastDuplicateCount?: number;
  lastFailedCount?: number;
  lastSyncStatus?: 'idle' | 'success' | 'partial_success' | 'failed' | 'retrying';
  lastSyncError?: string | null;
  lastResult?: string | null;
  importedCount?: number;
  skippedDuplicateCount?: number;
  failedCount?: number;
  nextEligibleSyncAt?: string | null;
  dailySyncEnabled?: boolean;
  syncInProgress?: boolean;
  totalImported?: number;
  totalFailed?: number;
  aiUsage?: AIUsageMetadata;
}

export interface XBookmarkSyncResult {
  ok: boolean;
  status: 'success' | 'partial_success' | 'failed';
  imported: number;
  skipped: number;
  checked: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  aiProcessedCount?: number;
  aiSkippedCount?: number;
  aiFailedCount?: number;
  aiLimitReached?: boolean;
  aiUsage?: AIUsageMetadata;
  errors: string[];
}

export const XBookmarkAPI = {
  async status(): Promise<XBookmarkStatus> {
    return request('/x/bookmarks/status');
  },
  async sync(limit = 25, mode: 'manual' | 'daily' = 'manual', processWithAI = false): Promise<XBookmarkSyncResult> {
    return request('/x/bookmarks/sync', {
      method: 'POST',
      body: JSON.stringify({ limit, mode, processWithAI }),
    });
  },
  async retryFailedImports(): Promise<XBookmarkSyncResult> {
    return request('/x/bookmarks/retry', {
      method: 'POST',
    });
  },
  async updateDailySyncEnabled(enabled: boolean): Promise<{ ok: boolean; dailySyncEnabled: boolean; syncState?: any }> {
    return request('/x/bookmarks/daily-sync', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
  async runManualBookmarkSync(processWithAI = false): Promise<XBookmarkSyncResult> {
    return this.sync(25, 'manual', processWithAI);
  },
};

// ── Health ────────────────────────────────────────────────────────────────────

export const checkHealth = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

function apiFriendlyErrorMessage(error: any): string {
  const message = String(error?.message || '').toLowerCase();
  if (error?.name === 'AbortError' || message.includes('aborted') || message.includes('timed out')) {
    return COLD_START_MESSAGE;
  }

  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Nomi could not reach the backend. It may be waking up or your connection may be offline.';
  }

  return error?.message || 'Nomi could not complete that request. Please try again.';
}
