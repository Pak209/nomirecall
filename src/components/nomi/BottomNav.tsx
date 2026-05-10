import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface BottomNavItemProps {
  icon: string;
  label: string;
  focused: boolean;
}

export function BottomNavItem({ icon, label, focused }: BottomNavItemProps) {
  return (
    <View style={styles.itemWrap}>
      <Text style={[styles.icon, focused && styles.active]}>{icon}</Text>
      <Text style={[styles.label, focused && styles.active]}>{label}</Text>
    </View>
  );
}

export function BottomNavAddButton() {
  return (
    <LinearGradient
      colors={['#FF8A00', '#FF5B5B', '#FF2D8E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.addButton}
    >
      <Text style={styles.addIcon}>＋</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  itemWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  icon: {
    fontSize: 18,
    color: '#8F8A84',
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    color: '#8F8A84',
    fontWeight: '600',
  },
  active: {
    color: '#FF2D8E',
  },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#FF5B5B',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  addIcon: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '400',
  },
});
