import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CategoryChipProps {
  icon: string;
  label: string;
  count: number;
  bgColor: string;
}

export function CategoryChip({ icon, label, count, bgColor }: CategoryChipProps) {
  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 72,
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: {
    fontSize: 12,
  },
  label: {
    color: '#1C1C22',
    fontSize: 12,
    fontWeight: '700',
  },
  count: {
    color: '#36363E',
    fontSize: 11,
    fontWeight: '600',
  },
});
