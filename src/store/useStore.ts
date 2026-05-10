import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, FeedItem, WikiPage, BrainStats, InterestTag } from '../types';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  onboardingGoals: string[];
  onboardingTone: string;

  // Feed
  feedItems: FeedItem[];
  feedLoading: boolean;
  feedCursor?: string;
  activeTopics: InterestTag[];

  // Brain
  wikiPages: WikiPage[];
  brainStats: BrainStats | null;
  brainLoading: boolean;

  // UI
  serverOnline: boolean;
  ingestModalVisible: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setOnboarded: (v: boolean) => void;
  setOnboardingGoals: (goals: string[]) => void;
  setOnboardingTone: (tone: string) => void;
  setFeedItems: (items: FeedItem[], cursor?: string) => void;
  appendFeedItems: (items: FeedItem[], cursor?: string) => void;
  setFeedLoading: (v: boolean) => void;
  markInBrain: (feedItemId: string) => void;
  setActiveTopics: (topics: InterestTag[]) => void;
  setWikiPages: (pages: WikiPage[]) => void;
  setBrainStats: (stats: BrainStats) => void;
  setBrainLoading: (v: boolean) => void;
  setServerOnline: (v: boolean) => void;
  setIngestModalVisible: (v: boolean) => void;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  onboardingGoals: [],
  onboardingTone: 'friendly',
  feedItems: [],
  feedLoading: false,
  feedCursor: undefined,
  activeTopics: ['ai_tech', 'crypto'],
  wikiPages: [],
  brainStats: null,
  brainLoading: false,
  serverOnline: false,
  ingestModalVisible: false,

  setUser: (user) => set({
    user,
    isAuthenticated: !!user,
    isOnboarded: !!user?.onboardingCompleted,
  }),
  setOnboarded: (v) => set({ isOnboarded: v }),
  setOnboardingGoals: (goals) => set({ onboardingGoals: goals }),
  setOnboardingTone: (tone) => set({ onboardingTone: tone }),
  setFeedItems: (items, cursor) => set({ feedItems: items, feedCursor: cursor }),
  appendFeedItems: (items, cursor) =>
    set((s) => ({
      feedItems: [
        ...s.feedItems,
        ...items.filter((item) => !s.feedItems.find((f) => f.id === item.id)),
      ],
      feedCursor: cursor,
    })),
  setFeedLoading: (v) => set({ feedLoading: v }),
  markInBrain: (id) =>
    set((s) => ({
      feedItems: s.feedItems.map((item) =>
        item.id === id ? { ...item, in_brain: true } : item,
      ),
    })),
  setActiveTopics: (topics) => set({ activeTopics: topics }),
  setWikiPages: (pages) => set({ wikiPages: pages }),
  setBrainStats: (stats) => set({ brainStats: stats }),
  setBrainLoading: (v) => set({ brainLoading: v }),
  setServerOnline: (v) => set({ serverOnline: v }),
  setIngestModalVisible: (v) => set({ ingestModalVisible: v }),

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('user_data');
    set({
      user: null,
      isAuthenticated: false,
      isOnboarded: false,
      onboardingGoals: [],
      onboardingTone: 'friendly',
      feedItems: [],
      wikiPages: [],
      brainStats: null,
    });
  },
}));
