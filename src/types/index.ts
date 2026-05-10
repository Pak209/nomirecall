// ── Auth ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName?: string;
  token: string;
  tier: 'free' | 'brain' | 'pro';
  onboardingCompleted?: boolean;
}

// ── Interests ─────────────────────────────────────────────────────────────────
export type InterestTag =
  | 'ai_tech'
  | 'crypto'
  | 'sports'
  | 'politics'
  | 'finance'
  | 'science'
  | 'startups'
  | 'health';

export interface Interest {
  id: InterestTag;
  label: string;
  emoji: string;
  description: string;
}

// ── Feed ──────────────────────────────────────────────────────────────────────
export type FeedSourceType = 'tweet' | 'rss' | 'polymarket' | 'reddit' | 'url';

export interface FeedItem {
  id: string;
  title: string;
  summary: string;
  source_type: FeedSourceType;
  source_name: string;
  url?: string;
  topic: InterestTag;
  published_at: string;
  claims: string[];
  entities: string[];
  in_brain: boolean;
  body?: string;
  category?: string;
  tags?: string[];
  authorUsername?: string;
  postDate?: string;
  links?: MemoryLink[];
  media?: MemoryMedia[];
  // Polymarket-specific
  market_probability?: number;
  market_volume?: string;
}

// ── Brain / Knowledge Base ────────────────────────────────────────────────────
export type ClaimStatus = 'supported' | 'disputed' | 'weak' | 'unknown';

export interface Claim {
  id: string;
  text: string;
  confidence_score: number;
  status: ClaimStatus;
  created_at: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
}

export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  last_updated: string;
  claim_count: number;
  source_count: number;
}

export interface BrainStats {
  sources: { total: number; processed: number };
  entities: number;
  claims: { total: number; supported: number; disputed: number; weak: number };
  wiki_pages: number;
}

// ── Ingest ────────────────────────────────────────────────────────────────────
export interface IngestPayload {
  raw_text?: string;
  url?: string;
  title?: string;
  type?: 'text' | 'url' | 'tweet' | 'note' | 'image' | 'voice';
  category?: string;
  tags?: string[];
  authorUsername?: string;
  postDate?: string;
  links?: MemoryLink[];
  media?: MemoryMedia[];
}

export interface IngestResult {
  success: boolean;
  source_id: string;
  title: string;
  message: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  source_type: string;
  createdAt?: string;
  category?: string;
  tags?: string[];
  userId?: string;
  body?: string;
  source_url?: string;
  authorUsername?: string;
  postDate?: string;
  links?: MemoryLink[];
  media?: MemoryMedia[];
}

export interface MemoryLink {
  url: string;
  displayUrl?: string;
  title?: string;
}

export interface MemoryMedia {
  type: 'photo' | 'video' | 'animated_gif' | string;
  url?: string;
  previewImageUrl?: string;
  altText?: string;
  width?: number;
  height?: number;
  variants?: Array<{
    url: string;
    contentType?: string;
    bitRate?: number;
  }>;
}

// ── Navigation ────────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  OnboardingIntro: undefined;
  MemoryGoals: undefined;
  NomiTone: undefined;
  Permissions: undefined;
  FirstCapture: undefined;
  OnboardingComplete: undefined;
  MainTabs: undefined;
  MemoryDetail: { memoryId: string };
  WikiPage: { slug: string; title: string };
  Paywall: { feature?: string };
  FeedItemDetail: { item: FeedItem };
};

export type MainTabParamList = {
  Home: undefined;
  Capture: { mode?: 'note' | 'link' | 'image' | 'voice' } | undefined;
  Recall: undefined;
  Profile: undefined;
  Search: undefined;
  Ingest: undefined;
};
