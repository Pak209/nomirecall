import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface RecentCaptureItem {
  id: string;
  title: string;
  meta: string;
  tag: string;
  icon: string;
  body?: string;
  source_type?: string;
  media?: unknown[];
}

interface RecentCaptureListProps {
  items: RecentCaptureItem[];
  onItemPress?: (item: RecentCaptureItem) => void;
}

export function RecentCaptureList({ items, onItemPress }: RecentCaptureListProps) {
  if (!items.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No captures yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.itemRow, index !== items.length - 1 && styles.itemDivider]}
          onPress={() => onItemPress?.(item)}
          activeOpacity={0.86}
        >
          <View style={styles.leftIcon}>
            <Text style={styles.iconText}>{item.icon}</Text>
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{item.meta}</Text>
          </View>
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{item.tag}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#261A12',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F2EAE2',
  },
  leftIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFF3EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#1C1C22',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  meta: {
    color: '#8A817B',
    fontSize: 11,
  },
  tagPill: {
    borderRadius: 999,
    backgroundColor: '#F4EDFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: '#7B3FF2',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 18,
  },
  emptyText: {
    color: '#8A817B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
