import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User } from '../../types';

interface NomiSideDrawerProps {
  visible: boolean;
  user: User | null;
  memoryCount: number;
  projectCount: number;
  onClose: () => void;
  onNavigate?: (destination: string) => void;
}

const DRAWER_WIDTH = Math.min(332, Dimensions.get('window').width * 0.84);

const MENU_ITEMS: {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  badge?: string;
  dividerBefore?: boolean;
}[] = [
  { id: 'profile', label: 'Profile', icon: 'person-outline' },
  { id: 'nomi-pro', label: 'Nomi Pro', icon: 'diamond-outline', accent: '#F29A3F', badge: 'Pro' },
  { id: 'daily-brief', label: 'Daily Brief', icon: 'sunny-outline', accent: '#F29A3F' },
  { id: 'projects', label: 'Projects', icon: 'folder-outline', dividerBefore: true },
  { id: 'connected-ideas', label: 'Connected Ideas', icon: 'git-network-outline' },
  { id: 'obsidian-export', label: 'Obsidian Export', icon: 'prism-outline', accent: '#7C56E8' },
  { id: 'import-sources', label: 'Import Sources', icon: 'download-outline' },
  { id: 'settings', label: 'Settings & Privacy', icon: 'settings-outline', dividerBefore: true },
  { id: 'help', label: 'Help', icon: 'help-circle-outline' },
];

export function NomiSideDrawer({
  visible,
  user,
  memoryCount,
  projectCount,
  onClose,
  onNavigate,
}: NomiSideDrawerProps) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  useEffect(() => {
    if (!rendered) return;
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        damping: 23,
        stiffness: 220,
        mass: 0.8,
      }),
      Animated.timing(backdropOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [backdropOpacity, rendered, translateX, visible]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(Math.max(-DRAWER_WIDTH, Math.min(0, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -70 || gesture.vx < -0.55) {
        onClose();
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
        }).start();
      }
    },
  }), [onClose, translateX]);

  if (!rendered) return null;

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Nomi user';
  const handle = user?.email ? `@${user.email.split('@')[0]}` : '@nomi';

  function handleNavigate(destination: string) {
    onClose();
    onNavigate?.(destination);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            paddingTop: insets.top + 22,
            paddingBottom: insets.bottom + 18,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.profileHeader}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userText}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.spark}>+</Text>
            </View>
            <Text style={styles.handle} numberOfLines={1}>{handle}</Text>
          </View>
          <View style={styles.nomiStatus}>
            <Image
              source={require('../../../assets/nomi-mascot.png')}
              style={styles.nomiImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.onlineDot} />
          </View>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{memoryCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Memories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{projectCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <View key={item.id}>
              {item.dividerBefore ? <View style={styles.divider} /> : null}
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate(item.id)} activeOpacity={0.78}>
                <Ionicons name={item.icon} size={25} color={item.accent || '#202026'} />
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#8D8787" />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.proCard} onPress={() => handleNavigate('nomi-pro')} activeOpacity={0.88}>
          <LinearGradient
            colors={['#FFF3EF', '#FFE5F0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proGradient}
          >
            <View style={styles.proIcon}>
              <Ionicons name="diamond-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.proCopy}>
              <Text style={styles.proTitle}>Nomi Pro</Text>
              <Text style={styles.proBody}>More recaps, smarter insights, and unlimited connections.</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color="#EF6359" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 22, 22, 0.42)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: '#FFFDFB',
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 10, height: 0 },
    elevation: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E9DDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#242329',
    fontSize: 22,
    fontWeight: '800',
  },
  userText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  displayName: {
    color: '#151419',
    fontSize: 18,
    fontWeight: '900',
  },
  spark: {
    color: '#EF6359',
    fontSize: 18,
    fontWeight: '900',
  },
  handle: {
    color: '#8A8385',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  nomiStatus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  nomiImage: {
    width: 42,
    height: 42,
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#37C66B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statsCard: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: '#F2DED9',
    borderRadius: 18,
    backgroundColor: '#FFF7F3',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 22,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#1E1D22',
    fontSize: 20,
    fontWeight: '900',
  },
  statLabel: {
    color: '#8E8585',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#F0DFD8',
  },
  menu: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE4DE',
    marginVertical: 11,
  },
  menuItem: {
    minHeight: 53,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuLabel: {
    flex: 1,
    color: '#202026',
    fontSize: 17,
    fontWeight: '800',
  },
  badge: {
    borderRadius: 999,
    backgroundColor: '#FFE7E3',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    color: '#EF6359',
    fontSize: 13,
    fontWeight: '900',
  },
  proCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  proGradient: {
    minHeight: 86,
    borderWidth: 1,
    borderColor: '#F5CAD0',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  proIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EF6359',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proCopy: {
    flex: 1,
  },
  proTitle: {
    color: '#EF4E67',
    fontSize: 16,
    fontWeight: '900',
  },
  proBody: {
    color: '#EF4E67',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 4,
  },
});
