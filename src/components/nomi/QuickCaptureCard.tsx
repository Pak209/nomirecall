import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface QuickCaptureAction {
  id: 'note' | 'link' | 'image' | 'voice';
  label: string;
  icon: string;
}

interface QuickCaptureCardProps {
  title: string;
  actions: QuickCaptureAction[];
  onActionPress?: (action: QuickCaptureAction) => void;
}

export function QuickCaptureCard({ title, actions, onActionPress }: QuickCaptureCardProps) {
  return (
    <LinearGradient
      colors={['#FF8A00', '#FF5B5B', '#FF2D8E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Text style={styles.title}>{title}</Text>
      <View style={styles.actionsRow}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.actionButton}
            onPress={() => onActionPress?.(action)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Quick capture ${action.label}`}
          >
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>{action.icon}</Text>
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
