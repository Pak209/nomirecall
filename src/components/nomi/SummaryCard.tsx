import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SummaryCardProps {
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  onPress?: () => void;
}

export function SummaryCard({ title, subtitle, body, ctaLabel, onPress }: SummaryCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>✨ {title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
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
        <View style={styles.glossyBlob}>
          <Text style={styles.glossyIcon}>✦</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    backgroundColor: '#FFF3EA',
    padding: 14,
    shadowColor: '#5A2D15',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    color: '#1C1C22',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    color: '#8B7163',
    fontSize: 12,
    fontWeight: '500',
  },
  body: {
    color: '#46392F',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  button: {
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#F6D9C8',
  },
  buttonText: {
    color: '#D75F39',
    fontSize: 12,
    fontWeight: '700',
  },
  glossyBlob: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFD8C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glossyIcon: {
    color: '#FF6C5A',
    fontSize: 22,
  },
});
