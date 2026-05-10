import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueries } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { QuickCaptureCard, QuickCaptureAction } from '../components/nomi/QuickCaptureCard';
import { SummaryCard } from '../components/nomi/SummaryCard';
import { MemoryCard } from '../components/nomi/MemoryCard';
import { RecentCaptureItem, RecentCaptureList } from '../components/nomi/RecentCaptureList';
import { CategoryChip } from '../components/nomi/CategoryChip';
import { DashboardAPI, DashboardCategory, DashboardMemory, DashboardSummary } from '../services/api';

type Nav = any;

const QUICK_CAPTURE_ACTIONS: QuickCaptureAction[] = [
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'link', label: 'Link', icon: '🔗' },
  { id: 'image', label: 'Image', icon: '🖼️' },
  { id: 'voice', label: 'Voice', icon: '🎙️' },
];

function SectionHeader({ title, action, onActionPress }: { title: string; action?: string; onActionPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onActionPress} disabled={!onActionPress}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type TodayItem =
  | { kind: 'summary'; id: string; data: DashboardSummary }
  | { kind: 'memory'; id: string; data: DashboardMemory }
  | { kind: 'capture'; id: string; data: RecentCaptureItem };

function TodayPostCard({ item, width, onPress }: { item: RecentCaptureItem; width: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.todayPostCard, { width }]} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.todayPostHeader}>
        <Text style={styles.todayPostIcon}>{item.icon}</Text>
        <View style={styles.todayPostTitleWrap}>
          <Text style={styles.todayPostTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.todayPostMeta} numberOfLines={1}>{item.meta}</Text>
        </View>
      </View>
      {item.body ? <Text style={styles.todayPostBody} numberOfLines={5}>{item.body}</Text> : null}
      <Text style={styles.todayPostTag}>{item.tag}</Text>
    </TouchableOpacity>
  );
}

export default function NomiDashboardScreen() {
  const nav = useNavigation<Nav>();
  const { width: windowWidth } = useWindowDimensions();
  const todayListRef = useRef<FlatList<TodayItem>>(null);
  const todayIndexRef = useRef(0);
  const user = useStore((s) => s.user);
  const serverOnline = useStore((s) => s.serverOnline);
  const firstName = user?.displayName?.split(' ')[0] || 'Alex';
  const [refreshing, setRefreshing] = useState(false);
  const [
    summaryQuery,
    memoryQuery,
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
        queryKey: ['dashboard-memory'],
        queryFn: DashboardAPI.getMemory,
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
  const memory: DashboardMemory | null = memoryQuery.data ?? null;
  const recent: RecentCaptureItem[] = recentQuery.data?.items ?? [];
  const categories: DashboardCategory[] = categoriesQuery.data?.categories ?? [];
  const loading = summaryQuery.isFetching || memoryQuery.isFetching || recentQuery.isFetching || categoriesQuery.isFetching;
  const todayCardWidth = Math.max(280, windowWidth - 56);
  const todayItems: TodayItem[] = useMemo(() => [
    ...(summary ? [{ kind: 'summary' as const, id: 'summary', data: summary }] : []),
    ...(memory ? [{ kind: 'memory' as const, id: 'memory', data: memory }] : []),
    ...recent.map((item) => ({ kind: 'capture' as const, id: item.id, data: item })),
  ], [memory, recent, summary]);

  useEffect(() => {
    if (todayItems.length <= 1) return undefined;
    const timer = setInterval(() => {
      const nextIndex = (todayIndexRef.current + 1) % todayItems.length;
      todayIndexRef.current = nextIndex;
      todayListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 5200);
    return () => clearInterval(timer);
  }, [todayItems.length]);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      summaryQuery.refetch(),
      memoryQuery.refetch(),
      recentQuery.refetch(),
      categoriesQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [summaryQuery, memoryQuery, recentQuery, categoriesQuery]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={refreshDashboard} />
        )}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Good morning, {firstName} ☀️</Text>
            <View style={styles.streakRow}>
              <Text style={styles.streakMain}>🔥 Streak 7 days</Text>
              <Text style={styles.streakSub}>Keep it going!</Text>
            </View>
          </View>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarEmoji}>🧑🏽</Text>
            <View style={styles.onlineDot} />
          </View>
        </View>

        <QuickCaptureCard
          title="Quick capture anything..."
          actions={QUICK_CAPTURE_ACTIONS}
          onActionPress={(action) => nav.navigate('Capture', { mode: action.id })}
        />

        <SectionHeader title="Today" action="See all" onActionPress={() => nav.navigate('Recall')} />
        {todayItems.length ? (
          <FlatList
            ref={todayListRef}
            horizontal
            data={todayItems}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            showsHorizontalScrollIndicator={false}
            snapToInterval={todayCardWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={styles.todayCarousel}
            onMomentumScrollEnd={(event) => {
              todayIndexRef.current = Math.round(event.nativeEvent.contentOffset.x / (todayCardWidth + 12));
            }}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <View style={{ width: todayCardWidth, marginRight: 12 }}>
                {item.kind === 'summary' ? (
                  <SummaryCard
                    title={item.data.title}
                    subtitle={item.data.subtitle}
                    body={item.data.body}
                    ctaLabel={item.data.ctaLabel}
                    onPress={() => nav.navigate('Recall')}
                  />
                ) : item.kind === 'memory' ? (
                  <MemoryCard
                    title={item.data.title}
                    timestamp={item.data.timestamp}
                    quote={item.data.quote}
                    author={item.data.author}
                    ctaLabel={item.data.ctaLabel}
                    onPress={() => nav.navigate('Recall')}
                  />
                ) : (
                  <TodayPostCard
                    item={item.data}
                    width={todayCardWidth}
                    onPress={() => nav.navigate('MemoryDetail', { memoryId: item.data.id })}
                  />
                )}
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyToday}>
            <Text style={styles.emptyTitle}>No captures yet</Text>
            <Text style={styles.emptyBody}>Capture a note, link, or post and it will show up here.</Text>
          </View>
        )}

        <SectionHeader title="Recent captures" action="See all" onActionPress={() => nav.navigate('Recall')} />
        <RecentCaptureList
          items={recent}
          onItemPress={(item) => nav.navigate('MemoryDetail', { memoryId: item.id })}
        />

        <SectionHeader title="Categories" />
        {categories.length ? (
          <View style={styles.categoriesRow}>
            {categories.map((chip) => (
              <CategoryChip
                key={chip.id}
                icon={chip.icon}
                label={chip.label}
                count={chip.count}
                bgColor={chip.bgColor}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCategory}>
            <Text style={styles.emptyBody}>Categories will appear after your first capture.</Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#FF2D8E" />
          </View>
        )}

        <TouchableOpacity style={styles.footerBrand} activeOpacity={0.85}>
          <Text style={styles.footerBrandText}>Nomi — capture anything, remember everything.</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FDF7F2',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 140,
    gap: 12,
  },
  headerRow: {
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    color: '#1C1C22',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  streakRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakMain: {
    color: '#FF6A3D',
    fontSize: 13,
    fontWeight: '700',
  },
  streakSub: {
    color: '#8A817B',
    fontSize: 12,
    fontWeight: '600',
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFE9DB',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEmoji: {
    fontSize: 21,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2ECF70',
    borderWidth: 2,
    borderColor: '#fff',
    position: 'absolute',
    right: -1,
    bottom: -1,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#1C1C22',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionAction: {
    color: '#7B3FF2',
    fontSize: 12,
    fontWeight: '700',
  },
  todayCarousel: {
    paddingRight: 4,
  },
  todayPostCard: {
    minHeight: 214,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#261A12',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  todayPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  todayPostIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF3EA',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 18,
    overflow: 'hidden',
  },
  todayPostTitleWrap: {
    flex: 1,
  },
  todayPostTitle: {
    color: '#1C1C22',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 23,
  },
  todayPostMeta: {
    color: '#8A817B',
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
  },
  todayPostBody: {
    color: '#342D2A',
    fontSize: 15,
    lineHeight: 22,
  },
  todayPostTag: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: '#F4EDFF',
    color: '#7B3FF2',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyToday: {
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 18,
  },
  emptyCategory: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
  },
  emptyTitle: {
    color: '#1C1C22',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyBody: {
    color: '#8A817B',
    marginTop: 4,
    lineHeight: 19,
    fontSize: 13,
    fontWeight: '600',
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
  },
  footerBrand: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerBrandText: {
    color: '#9A8F87',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
});
