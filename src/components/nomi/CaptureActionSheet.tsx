import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickCaptureAction } from './QuickCaptureCard';

interface CaptureActionSheetProps {
  visible: boolean;
  actions: QuickCaptureAction[];
  onClose: () => void;
  onActionPress: (action: QuickCaptureAction) => void;
}

const ACTION_ICONS: Record<QuickCaptureAction['id'], keyof typeof Ionicons.glyphMap> = {
  note: 'reader',
  link: 'link',
  image: 'image',
  voice: 'mic',
};

export function CaptureActionSheet({ visible, actions, onClose, onActionPress }: CaptureActionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Capture to Nomi</Text>
          <View style={styles.grid}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.action}
                onPress={() => onActionPress(action)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Capture ${action.label}`}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={ACTION_ICONS[action.id]} size={22} color="#EF6359" />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.xImport} onPress={() => onActionPress({ id: 'link', label: 'Link', icon: '' })} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FFF4EF', '#FFEAF1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.xImportGradient}
            >
              <Ionicons name="logo-twitter" size={19} color="#EF6359" />
              <Text style={styles.xImportText}>Import from X</Text>
              <Ionicons name="chevron-forward" size={18} color="#EF6359" />
            </LinearGradient>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(30, 25, 25, 0.34)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFDFB',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#E6DAD4',
    marginBottom: 14,
  },
  title: {
    color: '#211F25',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
    minHeight: 86,
    borderWidth: 1,
    borderColor: '#F0DFD8',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#242329',
    fontSize: 13,
    fontWeight: '800',
  },
  xImport: {
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  xImportGradient: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  xImportText: {
    flex: 1,
    color: '#EF6359',
    fontSize: 14,
    fontWeight: '800',
  },
});
