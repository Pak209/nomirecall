import { Platform } from 'react-native';

export const Colors = {
  // Backgrounds
  bg: '#FDF7F2',
  bgCard: '#FFFFFF',
  bgElevated: '#FFF3EA',
  bgInput: '#FFFFFF',

  // Borders
  border: '#F0E2D6',
  borderLight: '#E8D8CA',

  // Nomi accent brand
  teal: '#FF2D8E',
  tealLight: '#FFE3F1',
  tealMuted: '#E61C7D',
  tealDim: '#FF2D8E1A',

  // Text
  textPrimary: '#1C1C22',
  textSecondary: '#655C57',
  textTertiary: '#9B908A',
  textInverse: '#1C1C22',

  // Status
  green: '#28B66F',
  greenBg: '#28B66F15',
  amber: '#FF8A00',
  amberBg: '#FF8A0015',
  red: '#FF5B5B',
  redBg: '#FF5B5B15',
  blue: '#4A7EFF',
  blueBg: '#4A7EFF15',
  purple: '#7B3FF2',
  purpleBg: '#7B3FF215',

  // Claim status
  supported: '#1D9E75',
  disputed: '#E24B4A',
  weak: '#888888',
  unknown: '#555555',
} as const;

export const Typography = {
  fontMono: Platform.select({ ios: 'Courier New', android: 'monospace' }),

  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,

  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const INTERESTS = [
  { id: 'ai_tech', label: 'AI & Tech', emoji: '⚡', description: 'LLMs, startups, product launches' },
  { id: 'crypto', label: 'Crypto', emoji: '◈', description: 'Bitcoin, DeFi, on-chain news' },
  { id: 'sports', label: 'Sports', emoji: '◎', description: 'NBA, NFL, transfers, scores' },
  { id: 'politics', label: 'Politics', emoji: '◉', description: 'Policy, elections, global affairs' },
  { id: 'finance', label: 'Finance', emoji: '◆', description: 'Markets, macro, earnings' },
  { id: 'science', label: 'Science', emoji: '◐', description: 'Research, breakthroughs, papers' },
  { id: 'startups', label: 'Startups', emoji: '◑', description: 'Funding, founders, exits' },
  { id: 'health', label: 'Health', emoji: '◒', description: 'Longevity, medicine, wellness' },
] as const;

export const CLAIM_STATUS_CONFIG = {
  supported: { color: Colors.supported, bg: Colors.greenBg, label: 'confirmed', icon: '✓' },
  disputed:  { color: Colors.disputed,  bg: Colors.redBg,      label: 'disputed',   icon: '!' },
  weak:      { color: Colors.weak,      bg: '#FFF3EA',         label: 'unverified', icon: '·' },
  unknown:   { color: Colors.unknown,   bg: '#F6E9FF',         label: 'unknown',    icon: '?' },
} as const;

export const SOURCE_LABELS: Record<string, string> = {
  tweet: 'X / Twitter',
  rss: 'News',
  polymarket: 'Polymarket',
  reddit: 'Reddit',
  url: 'Web',
  text: 'Note',
  note: 'Note',
  article: 'Article',
};
