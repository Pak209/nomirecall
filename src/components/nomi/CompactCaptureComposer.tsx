import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuickCaptureAction } from './QuickCaptureCard';

interface CompactCaptureComposerProps {
  actions: QuickCaptureAction[];
  onActionPress?: (action: QuickCaptureAction) => void;
}

const ACTION_ICONS: Record<QuickCaptureAction['id'], keyof typeof Ionicons.glyphMap> = {
  note: 'reader',
  link: 'link',
  image: 'image',
  voice: 'mic',
};

export function CompactCaptureComposer({ actions, onActionPress }: CompactCaptureComposerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.promptRow}>
        <View style={styles.nomiAvatar}>
          <Image
            source={require('../../../assets/nomi-mascot.png')}
            style={styles.nomiImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Text style={styles.placeholder}>What do you want to remember?</Text>
      </View>
      <View style={styles.actionsRow}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.actionButton}
            onPress={() => onActionPress?.(action)}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={`Capture ${action.label}`}
          >
            <Ionicons name={ACTION_ICONS[action.id]} size={18} color="#EF6359" />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#F3D8D4',
    borderRadius: 18,
    backgroundColor: '#FFFDFB',
    padding: 12,
    gap: 12,
    shadowColor: '#4B2C22',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  nomiAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nomiImage: {
    width: 34,
    height: 34,
  },
  placeholder: {
    flex: 1,
    color: '#A9A0A2',
    fontSize: 15,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#F1DAD6',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: {
    color: '#242329',
    fontSize: 13,
    fontWeight: '800',
  },
});
