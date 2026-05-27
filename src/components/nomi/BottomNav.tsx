import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface BottomNavItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  secondaryIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
}

export function BottomNavItem({ icon, secondaryIcon, label, focused }: BottomNavItemProps) {
  const color = focused ? '#EF6359' : '#8F8A84';
  return (
    <View style={styles.itemWrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={color} />
        {secondaryIcon ? (
          <View style={styles.secondaryIcon}>
            <Ionicons name={secondaryIcon} size={10} color={color} />
          </View>
        ) : null}
      </View>
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
      <Ionicons name="add" size={34} color="#fff" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  itemWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  iconWrap: {
    width: 24,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIcon: {
    position: 'absolute',
    right: -2,
    top: -3,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    color: '#8F8A84',
    fontWeight: '600',
  },
  active: {
    color: '#EF6359',
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
});
