import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueries } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { QuickCaptureAction } from '../components/nomi/QuickCaptureCard';
import { CompactCaptureComposer } from '../components/nomi/CompactCaptureComposer';
import { HomeFeedTab, HomeFeedTabs } from '../components/nomi/HomeFeedTabs';
import { MemoryFeedCard } from '../components/nomi/MemoryFeedCard';
import { NomiSideDrawer } from '../components/nomi/NomiSideDrawer';
import { CaptureActionSheet } from '../components/nomi/CaptureActionSheet';
import { DashboardAPI, DashboardCategory, DashboardSummary } from '../services/api';
import { MemoryFeedItem } from '../components/nomi/homeFeedUtils';

type Nav = any;

const QUICK_CAPTURE_ACTIONS: QuickCaptureAction[] = [
  { id: 'note', label: 'Note', icon: 'note' },
  { id: 'link', label: 'Link', icon: 'link' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'voice', label: 'Voice', icon: 'voice' },
];

const EMPTY_FEED_ITEMS: MemoryFeedItem[] = [];
const EMPTY_CATEGORIES: DashboardCategory[] = [];

function isProjectMemory(item: MemoryFeedItem) {
  const label = `${item.category || ''} ${item.tag || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
  return !!item.projectIds?.length || label.includes('project');
}

function isInboxMemory(item: MemoryFeedItem) {
  return item.sync?.importStatus === 'pending' || item.ai?.processingStatus === 'pending';
}

export default function NomiDashboardScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const user = useStore((s) => s.user);
  const serverOnline = useStore((s) => s.serverOnline);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const dark = theme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeFeedTab>('for-you');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);

  const [
    summaryQuery,
    recentQuery,
    categoriesQuery,
  ] = useQueries({
    queries: [
      {
        queryKey: ['dashboard-summary'],
        queryFn: DashboardAPI.getSummary,
        enabled: serverOnline,
      },
      {
        queryKey: ['dashboard-recent'],
        queryFn: DashboardAPI.getRecent,
        enabled: serverOnline,
      },
      {
        queryKey: ['dashboard-categories'],
        queryFn: DashboardAPI.getCategories,
        enabled: serverOnline,
      },
    ],
  });

  const summary: DashboardSummary | null = summaryQuery.data ?? null;
  const recent: MemoryFeedItem[] = recentQuery.data?.items ?? EMPTY_FEED_ITEMS;
  const categories: DashboardCategory[] = categoriesQuery.data?.categories ?? EMPTY_CATEGORIES;
  const loading = summaryQuery.isFetching || recentQuery.isFetching || categoriesQuery.isFetching;
  const memoryCount = summary?.stats?.totalCaptures ?? recent.length;
  const projectCount = categories.find((category) => category.label.toLowerCase() === 'projects')?.count ?? 0;
  const summaryFeedItem: MemoryFeedItem | null = useMemo(() => {
    if (!summary) return null;
    return {
      id: 'nomi-daily-summary',
      title: summary.title,
      meta: summary.subtitle || 'Nomi · For You',
      tag: 'recap',
      icon: 'sparkles',
      body: summary.body,
      summary: summary.body,
      source_type: 'nomi',
      category: 'recap',
    };
  }, [summary]);

  const feedItems = useMemo(() => {
    if (activeTab === 'projects') return recent.filter(isProjectMemory);
    if (activeTab === 'inbox') return recent.filter(isInboxMemory);
    if (activeTab === 'for-you' && summaryFeedItem) return [summaryFeedItem, ...recent];
    return recent;
  }, [activeTab, recent, summaryFeedItem]);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      summaryQuery.refetch(),
      recentQuery.refetch(),
      categoriesQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [summaryQuery, recentQuery, categoriesQuery]);

  function openCapture(action: QuickCaptureAction) {
    setCaptureSheetOpen(false);
    nav.navigate('Capture', { mode: action.id });
  }

  function handleDrawerNavigate(destination: string) {
    if (destination === 'profile') nav.navigate('Profile');
    if (destination === 'projects') nav.navigate('Recall');
    if (destination === 'nomi-pro') nav.navigate('Paywall', { feature: 'Nomi Pro' });
    if (destination === 'daily-brief' || destination === 'connected-ideas') nav.navigate('Recall');
    if (destination === 'import-sources') nav.navigate('Capture', { mode: 'link' });
  }

  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]} edges={['top', 'left', 'right']}>
      <View style={[styles.root, dark && styles.rootDark]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.userAvatar}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
          >
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.userAvatarImage} />
            ) : (
              <Text style={styles.userInitial}>{(user?.displayName || user?.email || 'N').charAt(0).toUpperCase()}</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.headerTitle, dark && styles.headerTitleDark]}>Home</Text>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} onPress={toggleTheme} activeOpacity={0.76} accessibilityRole="button" accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Ionicons name={dark ? 'sunny' : 'moon'} size={27} color={dark ? '#FFFFFF' : '#16151A'} />
            </TouchableOpacity>
            <View style={styles.nomiOrb}>
              <Image
                source={require('../../assets/nomi-mascot.png')}
                style={styles.nomiOrbImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <View style={[styles.onlineDot, dark && styles.onlineDotDark]} />
            </View>
          </View>
        </View>

        <View style={dark && styles.tabBandDark}>
          <HomeFeedTabs activeTab={activeTab} onTabPress={setActiveTab} />
        </View>

        <ScrollView
          style={[styles.feedScroller, { marginBottom: Math.max(insets.bottom, 8) + 100 }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={refreshDashboard} tintColor="#EF6359" />
          )}
        >
          <CompactCaptureComposer actions={QUICK_CAPTURE_ACTIONS} onActionPress={openCapture} />

          {loading && !feedItems.length ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color="#EF6359" />
            </View>
          ) : null}

          {feedItems.length ? (
            <View style={styles.feedList}>
              {feedItems.map((item) => (
                <MemoryFeedCard
                  key={item.id}
                  memory={item}
                  onPress={() => (item.id === 'nomi-daily-summary' ? nav.navigate('Recall') : nav.navigate('MemoryDetail', { memoryId: item.id }))}
                  onAskPress={() => nav.navigate('Recall')}
                  onConnectPress={() => nav.navigate('Recall')}
                  onOpenPress={() => (item.id === 'nomi-daily-summary' ? nav.navigate('Recall') : nav.navigate('MemoryDetail', { memoryId: item.id }))}
                />
              ))}
            </View>
          ) : (
            <EmptyFeedState activeTab={activeTab} />
          )}
        </ScrollView>

        <CaptureActionSheet
          visible={captureSheetOpen}
          actions={QUICK_CAPTURE_ACTIONS}
          onClose={() => setCaptureSheetOpen(false)}
          onActionPress={openCapture}
        />

        <NomiSideDrawer
          visible={drawerOpen}
          user={user}
          memoryCount={memoryCount}
          projectCount={projectCount}
          onClose={() => setDrawerOpen(false)}
          onNavigate={handleDrawerNavigate}
        />
      </View>
    </SafeAreaView>
  );
}

function EmptyFeedState({ activeTab }: { activeTab: HomeFeedTab }) {
  const copy = {
    'for-you': {
      title: 'Your memory feed is ready',
      body: 'Save a note, link, image, or voice thought and Nomi will turn it into a calm personal feed.',
    },
    recent: {
      title: 'No recent captures yet',
      body: 'Your newest memories will land here as compact feed cards.',
    },
    projects: {
      title: 'No project-linked memories',
      body: 'When memories are connected to projects, they will appear here for faster review.',
    },
    inbox: {
      title: 'Inbox is clear',
      body: 'Unprocessed or newly imported captures will show here when Nomi needs your attention.',
    },
  }[activeTab];

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={activeTab === 'inbox' ? 'file-tray-outline' : 'sparkles'} size={25} color="#EF6359" />
      </View>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FDF7F2',
  },
  safeDark: {
    backgroundColor: '#05020A',
  },
  root: {
    flex: 1,
    backgroundColor: '#FDF7F2',
  },
  rootDark: {
    backgroundColor: '#05020A',
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EDE2DA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  userInitial: {
    color: '#201F24',
    fontSize: 16,
    fontWeight: '900',
  },
  headerTitle: {
    position: 'absolute',
    left: 88,
    right: 88,
    color: '#151419',
    textAlign: 'center',
    fontSize: 27,
    fontWeight: '900',
  },
  headerTitleDark: {
    color: '#FFFFFF',
  },
  headerActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomiOrb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  nomiOrbImage: {
    width: 37,
    height: 37,
  },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#37C66B',
    borderWidth: 2,
    borderColor: '#FDF7F2',
  },
  onlineDotDark: {
    borderColor: '#05020A',
  },
  tabBandDark: {
    backgroundColor: '#05020A',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 14,
  },
  feedScroller: {
    flex: 1,
  },
  loadingBlock: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 22,
    alignItems: 'center',
  },
  feedList: {
    gap: 12,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: '#EFE0D9',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#201F24',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#7F7777',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 7,
  },
});
