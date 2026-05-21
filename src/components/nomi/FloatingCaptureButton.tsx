import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FloatingCaptureButtonProps {
  bottomOffset: number;
  onPress?: () => void;
}

export function FloatingCaptureButton({ bottomOffset, onPress }: FloatingCaptureButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, { bottom: bottomOffset }]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="Quick capture"
    >
      <LinearGradient
        colors={['#FF8A4C', '#F45C63', '#E54682']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.plus}>+</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 22,
    width: 62,
    height: 62,
    borderRadius: 31,
    shadowColor: '#E54682',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    zIndex: 20,
  },
  gradient: {
    flex: 1,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 44,
    fontWeight: '300',
  },
});
