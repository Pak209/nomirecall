import { DashboardRecentItem } from '../../services/api';

export type MemoryFeedItem = DashboardRecentItem & {
  sourceType?: string;
  sourceTypeLabel?: string;
  sourceUrl?: string;
  source_url?: string;
  sourceUrlHost?: string;
  createdAt?: string;
  capturedAt?: string;
  postDate?: string;
  rawText?: string;
  cleanText?: string;
  summary?: string;
  category?: string;
  tags?: string[];
  concepts?: string[];
  authorUsername?: string;
  author?: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  links?: { url: string }[];
  isFavorite?: boolean;
  ai?: {
    summary?: string;
    category?: string;
    tags?: string[];
    concepts?: string[];
    processingStatus?: string;
  };
  projectIds?: string[];
  sync?: {
    importStatus?: string;
  };
};

function compactHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || '';
  }
}

export function getRelativeTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function getMemorySummary(memory: MemoryFeedItem): string {
  return memory.summary || memory.ai?.summary || '';
}

export function getMemoryPreviewText(memory: MemoryFeedItem): string {
  return (
    memory.rawText ||
    memory.cleanText ||
    memory.body ||
    memory.title ||
    memory.summary ||
    memory.ai?.summary ||
    'Saved memory'
  );
}

export function getMemoryTags(memory: MemoryFeedItem): string[] {
  const values = [
    ...(memory.category || memory.ai?.category ? [memory.category || memory.ai?.category || ''] : []),
    ...(memory.tags?.length ? memory.tags : memory.ai?.tags || []),
    ...(!memory.tags?.length && !memory.ai?.tags?.length ? memory.concepts || memory.ai?.concepts || [] : []),
    ...(memory.tag ? [memory.tag] : []),
  ];

  return Array.from(new Set(values.map((tag) => tag.trim()).filter(Boolean))).slice(0, 4);
}

export function getSourceIcon(memory: MemoryFeedItem): string {
  const source = (memory.sourceType || memory.source_type || memory.sourceTypeLabel || '').toLowerCase();
  if (source.includes('x') || source.includes('tweet')) return 'logo-twitter';
  if (source.includes('link') || source.includes('url') || memory.sourceUrl || memory.source_url) return 'link';
  if (source.includes('image') || memory.media?.length) return 'image';
  if (source.includes('voice') || source.includes('audio')) return 'mic';
  if (source.includes('note') || source.includes('text')) return 'reader';
  return 'sparkles';
}

export function getMemorySourceLabel(memory: MemoryFeedItem): string {
  const source = (memory.sourceType || memory.source_type || '').toLowerCase();
  const authorUsername = memory.authorUsername || memory.author?.username;
  const displayName = memory.author?.displayName;
  const host = memory.sourceUrlHost || compactHost(memory.sourceUrl || memory.source_url || memory.links?.[0]?.url);
  const time = getRelativeTime(memory.createdAt || memory.capturedAt || memory.postDate);
  const timeSuffix = time ? ` · ${time}` : '';

  if (authorUsername && (source.includes('x') || source.includes('tweet'))) {
    return `@${authorUsername.replace(/^@/, '')} on X${timeSuffix}`;
  }
  if (displayName) return `${displayName}${timeSuffix}`;
  if (source.includes('link') || source.includes('url') || host) return `Link${host ? ` · ${host}` : ''}${timeSuffix}`;
  if (source.includes('image')) return `Image${timeSuffix}`;
  if (source.includes('voice') || source.includes('audio')) return `Voice${timeSuffix}`;
  if (source.includes('note') || source.includes('text')) return `Note${timeSuffix}`;
  return `${memory.meta || memory.sourceTypeLabel || memory.source_type || 'Memory'}`;
}
