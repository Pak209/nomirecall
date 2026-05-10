import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Dimensions,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { INTERESTS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { AuthAPI } from '../services/api';
import { InterestTag, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'OnboardingIntro'>;
const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const { setActiveTopics, setOnboarded } = useStore();
  const [selected, setSelected] = useState<Set<InterestTag>>(new Set(['ai_tech', 'crypto']));
  const updateInterestsMutation = useMutation({
    mutationFn: (topics: InterestTag[]) => AuthAPI.updateInterests(topics),
    onSuccess: (_data, topics) => {
      setActiveTopics(topics);
      setOnboarded(true);
    },
    onError: (_error, topics) => {
      // Non-fatal — interests saved locally
      setActiveTopics(topics);
      setOnboarded(true);
    },
  });

  function toggle(id: InterestTag) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDone() {
    const topics = [...selected] as InterestTag[];
    updateInterestsMutation.mutate(topics);
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>What are you into?</Text>
        <Text style={styles.sub}>
          Your feed and brain will be tailored to these topics. You can change this anytime.
        </Text>

        <View style={styles.grid}>
          {INTERESTS.map((interest) => {
            const active = selected.has(interest.id as InterestTag);
            return (
              <TouchableOpacity
                key={interest.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggle(interest.id as InterestTag)}
                activeOpacity={0.75}
              >
                <Text style={styles.chipEmoji}>{interest.emoji}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {interest.label}
                </Text>
                <Text style={styles.chipDesc}>{interest.description}</Text>
                {active && <View style={styles.checkMark}><Text style={styles.checkText}>✓</Text></View>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerCount}>{selected.size} topic{selected.size !== 1 ? 's' : ''} selected</Text>
        <TouchableOpacity
          style={[styles.doneBtn, updateInterestsMutation.isLoading && { opacity: 0.7 }]}
          onPress={handleDone}
          disabled={updateInterestsMutation.isLoading}
        >
          {updateInterestsMutation.isLoading
            ? <ActivityIndicator color={Colors.textInverse} />
            : <Text style={styles.doneBtnText}>Build my brain  →</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CHIP_WIDTH = (width - Spacing.xl * 2 - Spacing.md) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
    paddingBottom: 120,
  },
  heading: {
    fontSize: Typography.xxl,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  chip: {
    width: CHIP_WIDTH,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    position: 'relative',
  },
  chipActive: {
    borderColor: Colors.teal,
    backgroundColor: Colors.tealDim,
  },
  chipEmoji: {
    fontSize: 22,
    marginBottom: Spacing.sm,
    color: Colors.textSecondary,
  },
  chipLabel: {
    fontSize: Typography.md,
    fontWeight: Typography.medium,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  chipLabelActive: {
    color: Colors.teal,
  },
  chipDesc: {
    fontSize: Typography.xs,
    color: Colors.textTertiary,
    lineHeight: 15,
  },
  checkMark: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 11,
    color: Colors.textInverse,
    fontWeight: Typography.bold,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    padding: Spacing.xl,
    paddingBottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerCount: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  doneBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.textInverse,
  },
});
