import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface MemoryCardProps {
  title: string;
  timestamp: string;
  quote: string;
  author: string;
  ctaLabel: string;
  onPress?: () => void;
}

export function MemoryCard({ title, timestamp, quote, author, ctaLabel, onPress }: MemoryCardProps) {
  return (
    <LinearGradient
      colors={['#F6EEFF', '#F1E8FF', '#F6E9FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>✨ {title}</Text>
        <Text style={styles.time}>{timestamp}</Text>
      </View>
      <Text style={styles.quote}>{quote}</Text>
      <Text style={styles.author}>— {author}</Text>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.buttonText}>{ctaLabel}</Text>
        </TouchableOpacity>
        <View style={styles.mascotWrap}>
          <Image
            source={require('../../../assets/nomi-mascot.png')}
            style={styles.mascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: '#1C1C22',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  time: {
    color: '#8A7AA0',
    fontSize: 11,
    fontWeight: '600',
  },
  quote: {
    color: '#3B3354',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  author: {
    color: '#625B80',
    fontSize: 12,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D2C0F5',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    color: '#6F4ACC',
    fontSize: 12,
    fontWeight: '700',
  },
  mascotWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E9D6FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mascot: {
    width: 44,
    height: 44,
  },
});
