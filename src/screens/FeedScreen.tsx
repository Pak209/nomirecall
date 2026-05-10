import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated, useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, INTERESTS, SOURCE_LABELS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { FeedAPI } from '../services/api';
import { FeedItem, InterestTag, RootStackParamList } from '../types';
import * as Haptics from 'expo-haptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Feed Item Card ─────────────────────────────────────────────────────────────
function FeedCard({ item, onAdd, onPress }: {
  item: FeedItem;
  onAdd: (item: FeedItem) => void;
  onPress: (item: FeedItem) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  }

  const timeAgo = formatTimeAgo(item.published_at);
  const sourceName = SOURCE_LABELS[item.source_type] ?? item.source_name;

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={() => onPress(item)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceTagText}>{sourceName}</Text>
          </View>
          {item.market_probability !== undefined && (
            <View style={styles.probTag}>
              <Text style={styles.probText}>{Math.round(item.market_probability * 100)}%</Text>
            </View>
          )}
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>

        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={3}>{item.title}</Text>

        {/* Summary */}
        <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>

        {/* Entities */}
        {item.entities?.length > 0 && (
          <View style={styles.entityRow}>
            {item.entities.slice(0, 4).map((e, i) => (
              <View key={i} style={styles.entityChip}>
                <Text style={styles.entityText}>{e}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Add to Brain */}
      <TouchableOpacity
        style={[styles.addBtn, item.in_brain && styles.addBtnDone]}
        onPress={() => !item.in_brain && onAdd(item)}
        disabled={item.in_brain}
      >
        <Text style={[styles.addBtnText, item.in_brain && styles.addBtnTextDone]}>
          {item.in_brain ? '✓ In brain' : '+ Add to brain'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Topic Filter Bar ──────────────────────────────────────────────────────────
function TopicBar({ active, onToggle }: { active: Set<InterestTag>; onToggle: (id: InterestTag) => void }) {
  return (
    <FlatList
      horizontal
      data={INTERESTS}
      keyExtractor={(i) => i.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.topicBar}
      style={styles.topicBarList}
      renderItem={({ item }) => {
        const on = active.has(item.id as InterestTag);
        return (
          <TouchableOpacity
            style={[styles.topicChip, on && styles.topicChipActive]}
            onPress={() => onToggle(item.id as InterestTag)}
          >
            <Text style={styles.topicEmoji}>{item.emoji}</Text>
            <Text style={[styles.topicLabel, on && styles.topicLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { activeTopics, setActiveTopics, serverOnline } = useStore();
  const cardWidth = Math.max(280, width - (Spacing.xl * 3));

  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Set<InterestTag>>(new Set(activeTopics));

  const activeFilterArray = [...activeFilter];

  useEffect(() => {
    setActiveTopics(activeFilterArray);
  }, [activeFilter]);

  const feedQuery = useQuery({
    queryKey: ['feed-items', activeFilterArray],
    queryFn: () => FeedAPI.getItems({
      topics: activeFilterArray,
      limit: 50,
    }),
    enabled: serverOnline,
  });

  const feedItems = feedQuery.data?.items ?? [];
  const feedLoading = feedQuery.isFetching;
  const discoveryNotice = feedQuery.data?.needsApiKey
    ? 'Add X_BEARER_TOKEN to the backend .env to load discovery posts.'
    : feedQuery.data?.errors?.[0]?.message;

  const addToBrainMutation = useMutation({
    mutationFn: (feedItemId: string) => FeedAPI.addToBrain(feedItemId),
    onMutate: async (feedItemId) => {
      await queryClient.cancelQueries({ queryKey: ['feed-items'] });
      const previous = queryClient.getQueryData<{ items: FeedItem[] }>(['feed-items', activeFilterArray]);
      queryClient.setQueryData<{ items: FeedItem[] }>(['feed-items', activeFilterArray], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => (
            item.id === feedItemId ? { ...item, in_brain: true } : item
          )),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['feed-items', activeFilterArray], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-items'] });
    },
  });

  function toggleTopic(id: InterestTag) {
    setActiveFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAddToBrain(item: FeedItem) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addToBrainMutation.mutate(item.id);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <View style={[styles.onlineDot, { backgroundColor: serverOnline ? Colors.green : Colors.border }]} />
      </View>

      {/* Topic bar */}
      <TopicBar active={activeFilter} onToggle={toggleTopic} />

      {/* Items */}
      {!serverOnline && feedItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⬡</Text>
          <Text style={styles.emptyTitle}>Server offline</Text>
          <Text style={styles.emptySub}>Start your Second Brain server to load your feed.</Text>
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(i) => i.id}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToAlignment="start"
          snapToInterval={cardWidth + Spacing.md}
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <FeedCard
                item={item}
                onAdd={handleAddToBrain}
                onPress={(it) => nav.navigate('FeedItemDetail', { item: it })}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                feedQuery.refetch().finally(() => setRefreshing(false));
              }}
              tintColor={Colors.teal}
            />
          }
          ListFooterComponent={feedLoading ? <ActivityIndicator color={Colors.teal} style={{ marginVertical: Spacing.xxl }} /> : null}
          ListEmptyComponent={
            !feedLoading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>◈</Text>
                <Text style={styles.emptyTitle}>No items yet</Text>
                <Text style={styles.emptySub}>
                  {discoveryNotice || 'Pull down to refresh or choose another interest.'}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  topicBar: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  topicBarList: {
    maxHeight: 46,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minHeight: 34,
    borderRadius: Radius.full,
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignSelf: 'flex-start',
  },
  topicChipActive: {
    borderColor: Colors.teal,
    backgroundColor: Colors.tealDim,
  },
  topicEmoji: { fontSize: 13 },
  topicLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  topicLabelActive: { color: Colors.teal, fontWeight: Typography.medium },

  list: { paddingHorizontal: Spacing.xl, paddingBottom: 100, gap: Spacing.md },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    minHeight: 280,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sourceTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.bgElevated,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  sourceTagText: { fontSize: Typography.xs, color: Colors.textTertiary, fontFamily: 'Courier New' },
  probTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.purpleBg,
    borderWidth: 0.5,
    borderColor: Colors.purple,
  },
  probText: { fontSize: Typography.xs, color: Colors.purple, fontWeight: Typography.medium },
  timeAgo: { fontSize: Typography.xs, color: Colors.textTertiary, marginLeft: 'auto' },

  cardTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    lineHeight: 21,
  },
  cardSummary: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  entityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: Spacing.md,
  },
  entityChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.bgElevated,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  entityText: { fontSize: Typography.xs, color: Colors.textTertiary },

  addBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 0.5,
    borderColor: Colors.teal,
  },
  addBtnDone: { borderColor: Colors.border },
  addBtnText: { fontSize: Typography.sm, color: Colors.teal, fontWeight: Typography.medium },
  addBtnTextDone: { color: Colors.textTertiary },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: Spacing.xl },
  emptyIcon: { fontSize: 36, color: Colors.textTertiary, marginBottom: Spacing.lg },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptySub: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
