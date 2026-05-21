import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  MemoryFeedItem,
  getMemoryPreviewText,
  getMemorySourceLabel,
  getMemorySummary,
  getMemoryTags,
  getSourceIcon,
} from './homeFeedUtils';

interface MemoryFeedCardProps {
  memory: MemoryFeedItem;
  onPress?: () => void;
  onAskPress?: () => void;
  onConnectPress?: () => void;
  onOpenPress?: () => void;
}

export function MemoryFeedCard({
  memory,
  onPress,
  onAskPress,
  onConnectPress,
  onOpenPress,
}: MemoryFeedCardProps) {
  const preview = getMemoryPreviewText(memory);
  const summary = getMemorySummary(memory);
  const tags = getMemoryTags(memory);
  const sourceIcon = getSourceIcon(memory) as keyof typeof Ionicons.glyphMap;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.sourceRail}>
        <View style={styles.sourceAvatar}>
          <Ionicons name={sourceIcon} size={22} color="#EF6359" />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.sourceLine} numberOfLines={1}>{getMemorySourceLabel(memory)}</Text>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={18} color="#8F8888" />
          </TouchableOpacity>
        </View>

        <Text style={styles.previewText} numberOfLines={4}>{preview}</Text>

        {summary ? (
          <View style={styles.summaryBlock}>
            <View style={styles.summaryHeader}>
              <Ionicons name="sparkles" size={14} color="#F26C4F" />
              <Text style={styles.summaryLabel}>Nomi Summary</Text>
            </View>
            <Text style={styles.summaryText} numberOfLines={3}>{summary}</Text>
          </View>
        ) : null}

        {tags.length ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText} numberOfLines={1}>{tag.startsWith('#') ? tag : `#${tag}`}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton icon="chatbubble-outline" label="Ask" onPress={onAskPress} />
          <ActionButton icon="git-compare-outline" label="Connect" onPress={onConnectPress} />
          <ActionButton icon="open-outline" label="Open" onPress={onOpenPress || onPress} />
          <TouchableOpacity style={styles.compactAction} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="Save memory">
            <Ionicons name={memory.isFavorite ? 'bookmark' : 'bookmark-outline'} size={19} color="#77737A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.compactAction} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="More memory actions">
            <Ionicons name="ellipsis-horizontal" size={19} color="#77737A" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={17} color="#77737A" />
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#EDE5DE',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#2D201B',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  sourceRail: {
    width: 44,
    alignItems: 'flex-start',
  },
  sourceAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceLine: {
    flex: 1,
    color: '#252329',
    fontSize: 14,
    fontWeight: '800',
  },
  iconButton: {
    width: 28,
    height: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  previewText: {
    color: '#242329',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
    marginTop: 1,
  },
  summaryBlock: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: '#FFF4EF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    color: '#2E2828',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryText: {
    color: '#635956',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  tagPill: {
    maxWidth: 120,
    borderRadius: 999,
    backgroundColor: '#FFF0EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: '#EF6359',
    fontSize: 12,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 12,
  },
  actionButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    color: '#77737A',
    fontSize: 12,
    fontWeight: '700',
  },
  compactAction: {
    minWidth: 26,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
