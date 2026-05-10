import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Share,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Radius, SOURCE_LABELS } from '../constants/theme';
import { FeedAPI } from '../services/api';
import { RootStackParamList } from '../types';

type Route = RouteProp<RootStackParamList, 'FeedItemDetail'>;

export default function FeedItemDetailScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { item } = route.params;
  const addToBrainMutation = useMutation({
    mutationFn: () => FeedAPI.addToBrain(item.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['feed-items'] });
      queryClient.setQueriesData<{ items: any[] }>(
        { queryKey: ['feed-items'] },
        (current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((feedItem) => (
              feedItem.id === item.id ? { ...feedItem, in_brain: true } : feedItem
            )),
          };
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-categories'] });
    },
  });

  async function handleAddToBrain() {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToBrainMutation.mutate();
    nav.goBack();
  }

  const timeStr = new Date(item.published_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Handle bar */}
      <View style={styles.handle} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Source + time */}
        <View style={styles.meta}>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceTagText}>{SOURCE_LABELS[item.source_type] ?? item.source_name}</Text>
          </View>
          {item.market_probability !== undefined && (
            <Text style={styles.prob}>{Math.round(item.market_probability * 100)}% probability</Text>
          )}
          <Text style={styles.time}>{timeStr}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{item.title}</Text>

        {/* Summary */}
        <Text style={styles.summary}>{item.summary}</Text>

        {/* Claims */}
        {item.claims?.length > 0 && (
          <View style={styles.claimsBlock}>
            <Text style={styles.blockLabel}>Extracted claims</Text>
            {item.claims.map((claim, i) => (
              <View key={i} style={styles.claimRow}>
                <Text style={styles.claimDot}>·</Text>
                <Text style={styles.claimText}>{claim}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Entities */}
        {item.entities?.length > 0 && (
          <View style={styles.entitiesBlock}>
            <Text style={styles.blockLabel}>Entities</Text>
            <View style={styles.entityWrap}>
              {item.entities.map((e, i) => (
                <View key={i} style={styles.entityChip}>
                  <Text style={styles.entityText}>{e}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Open source */}
        {item.url && (
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL(item.url!)}
          >
            <Text style={styles.linkText}>View original source →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.dismissBtn} onPress={() => nav.goBack()}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addBtn, item.in_brain && styles.addBtnDone]}
          onPress={handleAddToBrain}
          disabled={item.in_brain}
        >
          <Text style={styles.addBtnText}>
            {item.in_brain ? '✓ In brain' : '+ Add to brain'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginTop: Spacing.md,
  },
  scroll: { padding: Spacing.xl, paddingBottom: Spacing.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  sourceTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, backgroundColor: Colors.bgElevated,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  sourceTagText: { fontSize: Typography.xs, color: Colors.textTertiary, fontFamily: 'Courier New' },
  prob: { fontSize: Typography.xs, color: Colors.purple },
  time: { fontSize: Typography.xs, color: Colors.textTertiary, marginLeft: 'auto' },
  title: {
    fontSize: Typography.xl, fontWeight: Typography.semibold,
    color: Colors.textPrimary, marginBottom: Spacing.md,
    lineHeight: 28, letterSpacing: -0.2,
  },
  summary: { fontSize: Typography.md, color: Colors.textSecondary, lineHeight: 24, marginBottom: Spacing.xl },
  blockLabel: {
    fontSize: Typography.xs, textTransform: 'uppercase', letterSpacing: 0.08,
    color: Colors.textTertiary, marginBottom: Spacing.sm, fontFamily: 'Courier New',
  },
  claimsBlock: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.lg,
  },
  claimRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  claimDot: { color: Colors.teal, fontSize: Typography.md },
  claimText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  entitiesBlock: { marginBottom: Spacing.xl },
  entityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  entityChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, backgroundColor: Colors.bgElevated,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  entityText: { fontSize: Typography.xs, color: Colors.textSecondary },
  linkRow: { paddingVertical: Spacing.md },
  linkText: { fontSize: Typography.sm, color: Colors.teal },
  footer: {
    flexDirection: 'row', gap: Spacing.md,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  dismissBtn: {
    flex: 1, height: 50, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissText: { fontSize: Typography.sm, color: Colors.textSecondary },
  addBtn: {
    flex: 2, height: 50, borderRadius: Radius.md,
    backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center',
  },
  addBtnDone: { backgroundColor: Colors.tealMuted },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textInverse },
});
