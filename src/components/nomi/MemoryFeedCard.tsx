import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import {
  MemoryFeedItem,
  getMemoryPreviewText,
  getMemorySourceLabel,
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
  const dark = useStore((state) => state.theme === 'dark');
  const preview = getMemoryPreviewText(memory);
  const tags = getMemoryTags(memory);
  const sourceIcon = getSourceIcon(memory) as keyof typeof Ionicons.glyphMap;
  const media = memory.media ?? [];

  return (
    <TouchableOpacity style={[styles.card, dark && styles.cardDark]} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.sourceRail}>
        <View style={[styles.sourceAvatar, dark && styles.sourceAvatarDark]}>
          <Ionicons name={sourceIcon} size={22} color="#EF6359" />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.sourceLine, dark && styles.sourceLineDark]} numberOfLines={1}>{getMemorySourceLabel(memory)}</Text>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={18} color="#8F8888" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.previewText, dark && styles.previewTextDark]} numberOfLines={4}>{preview}</Text>

        {media.length ? (
          <View style={styles.mediaGrid}>
            {media.slice(0, 4).map((item, index) => (
              <View key={`${item.url || item.previewImageUrl || item.type}-${index}`} style={[styles.mediaTile, dark && styles.mediaTileDark]}>
                {item.previewImageUrl || item.url ? (
                  <Image source={{ uri: item.previewImageUrl || item.url }} style={styles.mediaImage} resizeMode="cover" />
                ) : (
                  <Ionicons name={item.type === 'video' ? 'play-circle' : 'image'} size={24} color="#EF6359" />
                )}
                {item.type === 'video' || item.type === 'animated_gif' ? (
                  <View style={styles.videoBadge}>
                    <Ionicons name="play" size={11} color="#fff" />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {tags.length ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={[styles.tagPill, dark && styles.tagPillDark]}>
                <Text style={styles.tagText} numberOfLines={1}>{tag.startsWith('#') ? tag : `#${tag}`}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton icon="chatbubble-outline" label="Ask" onPress={onAskPress} dark={dark} />
          <ActionButton icon="git-compare-outline" label="Connect" onPress={onConnectPress} dark={dark} />
          <ActionButton icon="open-outline" label="Open" onPress={onOpenPress || onPress} dark={dark} />
          <TouchableOpacity style={styles.compactAction} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="Save memory">
            <Ionicons name={memory.isFavorite ? 'bookmark' : 'bookmark-outline'} size={19} color={dark ? '#B5B0BE' : '#77737A'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.compactAction} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel="More memory actions">
            <Ionicons name="ellipsis-horizontal" size={19} color={dark ? '#B5B0BE' : '#77737A'} />
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
  dark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  dark?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={17} color={dark ? '#B5B0BE' : '#77737A'} />
      <Text style={[styles.actionText, dark && styles.actionTextDark]}>{label}</Text>
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
  cardDark: {
    borderColor: '#2E2A34',
    backgroundColor: '#171820',
    shadowColor: '#000',
    shadowOpacity: 0.16,
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
  sourceAvatarDark: {
    backgroundColor: '#2B2430',
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
  sourceLineDark: {
    color: '#F7F4F8',
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
  previewTextDark: {
    color: '#EEEAF1',
  },
  mediaGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaTile: {
    width: 132,
    height: 98,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F4E2D8',
  },
  mediaTileDark: {
    backgroundColor: '#24202B',
    borderColor: '#37313D',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.56)',
    alignItems: 'center',
    justifyContent: 'center',
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
  tagPillDark: {
    backgroundColor: '#2D2430',
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
  actionTextDark: {
    color: '#B5B0BE',
  },
  compactAction: {
    minWidth: 26,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
