import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStore } from '../../store/useStore';

export type HomeFeedTab = 'for-you' | 'recent' | 'projects' | 'inbox';

const TABS: { id: HomeFeedTab; label: string }[] = [
  { id: 'for-you', label: 'For You' },
  { id: 'recent', label: 'Recent' },
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

interface HomeFeedTabsProps {
  activeTab: HomeFeedTab;
  onTabPress: (tab: HomeFeedTab) => void;
}

export function HomeFeedTabs({ activeTab, onTabPress }: HomeFeedTabsProps) {
  const dark = useStore((state) => state.theme === 'dark');

  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabButton}
            onPress={() => onTabPress(tab.id)}
            activeOpacity={0.78}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, dark && styles.tabTextDark, active && styles.tabTextActive]}>{tab.label}</Text>
            <View style={[styles.indicator, active && styles.indicatorActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EFE4DC',
    marginHorizontal: -4,
  },
  containerDark: {
    borderBottomColor: '#272A36',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 0,
  },
  tabText: {
    color: '#2B2A2F',
    fontSize: 15,
    fontWeight: '700',
    paddingBottom: 12,
  },
  tabTextDark: {
    color: '#C9C5D0',
  },
  tabTextActive: {
    color: '#EF6359',
  },
  indicator: {
    width: '68%',
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: '#EF6359',
  },
});
