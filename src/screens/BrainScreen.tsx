import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, CLAIM_STATUS_CONFIG } from '../constants/theme';
import { useStore } from '../store/useStore';
import { BrainAPI } from '../services/api';
import { WikiPage, BrainStats, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ stats }: { stats: BrainStats }) {
  return (
    <View style={styles.statsRow}>
      <StatPill label="sources" value={stats.sources.total} />
      <StatPill label="entities" value={stats.entities} />
      <StatPill label="claims" value={stats.claims.total} color={Colors.teal} />
      <StatPill label="pages" value={stats.wiki_pages} />
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Wiki Page Card ─────────────────────────────────────────────────────────────
function WikiCard({ page, onPress }: { page: WikiPage; onPress: () => void }) {
  const updated = new Date(page.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <TouchableOpacity style={styles.wikiCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.wikiCardInner}>
        <Text style={styles.wikiTitle}>{page.title}</Text>
        <View style={styles.wikiMeta}>
          {page.claim_count > 0 && (
            <Text style={styles.wikiMetaText}>{page.claim_count} claims</Text>
          )}
          {page.source_count > 0 && (
            <Text style={styles.wikiMetaText}>{page.source_count} sources</Text>
          )}
          <Text style={styles.wikiMetaText}>{updated}</Text>
        </View>
      </View>
      <Text style={styles.wikiArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ── Claim Pills strip ─────────────────────────────────────────────────────────
function ClaimPills({ onFilter, active }: { onFilter: (s: string) => void; active: string }) {
  const statuses = ['all', 'supported', 'disputed', 'weak'];
  return (
    <View style={styles.claimFilterRow}>
      {statuses.map((s) => (
        <TouchableOpacity
          key={s}
          style={[styles.claimPill, active === s && styles.claimPillActive]}
          onPress={() => onFilter(s)}
        >
          <Text style={[styles.claimPillText, active === s && styles.claimPillTextActive]}>
            {s}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BrainScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { serverOnline } = useStore();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'wiki' | 'claims'>('wiki');
  const [claimFilter, setClaimFilter] = useState('all');

  const overviewQuery = useQuery({
    queryKey: ['brain-overview'],
    queryFn: async () => {
      const [{ pages }, stats] = await Promise.all([
        BrainAPI.getWikiPages(),
        BrainAPI.getStats(),
      ]);
      return { pages, stats };
    },
    enabled: serverOnline,
  });

  const claimsQuery = useQuery({
    queryKey: ['brain-claims', claimFilter],
    queryFn: () => BrainAPI.getClaims(claimFilter === 'all' ? undefined : claimFilter),
    enabled: serverOnline && view === 'claims',
  });

  const wikiPages = overviewQuery.data?.pages ?? [];
  const brainStats = overviewQuery.data?.stats ?? null;
  const brainLoading = overviewQuery.isFetching;
  const claims = claimsQuery.data?.claims ?? [];

  useFocusEffect(useCallback(() => {
    overviewQuery.refetch();
    if (view === 'claims') claimsQuery.refetch();
  }, [serverOnline, view, claimFilter]));

  const filteredPages = wikiPages.filter((p) =>
    !query || p.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⬡ Brain</Text>
      </View>

      {/* Stats */}
      {brainStats && <StatsStrip stats={brainStats} />}

      {/* View switcher */}
      <View style={styles.viewSwitch}>
        <TouchableOpacity
          style={[styles.switchBtn, view === 'wiki' && styles.switchBtnActive]}
          onPress={() => setView('wiki')}
        >
          <Text style={[styles.switchBtnText, view === 'wiki' && styles.switchBtnTextActive]}>Wiki pages</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, view === 'claims' && styles.switchBtnActive]}
          onPress={() => setView('claims')}
        >
          <Text style={[styles.switchBtnText, view === 'claims' && styles.switchBtnTextActive]}>Claims</Text>
        </TouchableOpacity>
      </View>

      {view === 'wiki' ? (
        <>
          {/* Search */}
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>⊕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search wiki pages..."
              placeholderTextColor={Colors.textTertiary}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <FlatList
            data={filteredPages}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <WikiCard
                page={item}
                onPress={() => nav.navigate('WikiPage', { slug: item.slug, title: item.title })}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  overviewQuery.refetch().finally(() => setRefreshing(false));
                }}
                tintColor={Colors.teal}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>⬡</Text>
                <Text style={styles.emptyTitle}>
                  {!serverOnline ? 'Server offline' : 'No wiki pages yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {!serverOnline
                    ? 'Start your Second Brain server.'
                    : 'Ingest some content to build your brain.'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        <>
          <ClaimPills active={claimFilter} onFilter={setClaimFilter} />
          <FlatList
            data={claims}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => {
              const cfg = CLAIM_STATUS_CONFIG[item.status as keyof typeof CLAIM_STATUS_CONFIG];
              return (
                <View style={[styles.claimCard, { borderLeftColor: cfg.color, backgroundColor: cfg.bg }]}>
                  <View style={styles.claimTop}>
                    <View style={[styles.claimBadge, { borderColor: cfg.color }]}>
                      <Text style={[styles.claimBadgeText, { color: cfg.color }]}>
                        {cfg.icon} {cfg.label}
                      </Text>
                    </View>
                    <Text style={styles.claimConfidence}>
                      {Math.round(item.confidence_score * 100)}%
                    </Text>
                  </View>
                  <Text style={styles.claimText}>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptySub}>No {claimFilter === 'all' ? '' : claimFilter} claims yet.</Text>
              </View>
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.semibold, color: Colors.textPrimary },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statPill: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statValue: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary },
  statLabel: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 2 },

  viewSwitch: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  switchBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  switchBtnActive: { backgroundColor: Colors.tealDim, borderColor: Colors.teal },
  switchBtnText: { fontSize: Typography.sm, color: Colors.textSecondary },
  switchBtnTextActive: { color: Colors.teal, fontWeight: Typography.medium },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchIcon: { fontSize: Typography.md, color: Colors.textTertiary },
  searchInput: { flex: 1, height: 40, fontSize: Typography.sm, color: Colors.textPrimary },

  list: { paddingHorizontal: Spacing.xl, paddingBottom: 100 },

  wikiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  wikiCardInner: { flex: 1 },
  wikiTitle: { fontSize: Typography.md, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: 4 },
  wikiMeta: { flexDirection: 'row', gap: Spacing.md },
  wikiMetaText: { fontSize: Typography.xs, color: Colors.textTertiary },
  wikiArrow: { fontSize: 20, color: Colors.textTertiary },

  claimFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  claimPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  claimPillActive: { borderColor: Colors.teal, backgroundColor: Colors.tealDim },
  claimPillText: { fontSize: Typography.xs, color: Colors.textSecondary },
  claimPillTextActive: { color: Colors.teal, fontWeight: Typography.medium },

  claimCard: {
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  claimTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  claimBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5 },
  claimBadgeText: { fontSize: Typography.xs, fontWeight: Typography.medium },
  claimConfidence: { fontSize: Typography.xs, color: Colors.textTertiary },
  claimText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 18 },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 32, color: Colors.textTertiary, marginBottom: Spacing.lg },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptySub: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center' },
});
