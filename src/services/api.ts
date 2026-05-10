import * as SecureStore from 'expo-secure-store';
import {
  FeedItem, WikiPage, Claim, BrainStats,
  IngestPayload, IngestResult, InterestTag, MemoryItem, MemoryLink, MemoryMedia,
} from '../types';

const rawApiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;
export const API_BASE = !rawApiBase || rawApiBase.includes('YOUR_RAILWAY_OR_NGROK_URL')
  ? 'http://localhost:3000/api'
  : rawApiBase;

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

// ── HTTP client ────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

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

  async query(question: string): Promise<{ answer: string; sources: string[] }> {
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

// ── Health ────────────────────────────────────────────────────────────────────

export const checkHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
};
