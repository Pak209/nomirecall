import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';
import { useStore } from '../../../store/useStore';

const GOALS = ['Work notes', 'Personal moments', 'Fitness progress', 'Learning', 'Ideas'] as const;
type Goal = (typeof GOALS)[number];
type Nav = NativeStackNavigationProp<RootStackParamList, 'MemoryGoals'>;

export default function MemoryGoalsScreen() {
  const nav = useNavigation<Nav>();
  const goals = useStore((s) => s.onboardingGoals);
  const setGoals = useStore((s) => s.setOnboardingGoals);
  const canContinue = useMemo(() => goals.length > 0, [goals.length]);

  function toggle(goal: Goal) {
    const next = goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal];
    setGoals(next);
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>What should Nomi help with?</Text>
      <View style={styles.row}>
        {GOALS.map((goal) => (
          <TouchableOpacity key={goal} style={[styles.chip, goals.includes(goal) && styles.chipActive]} onPress={() => toggle(goal)}>
            <Text style={[styles.chipText, goals.includes(goal) && styles.chipTextActive]}>{goal}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.button, !canContinue && styles.buttonDisabled]} onPress={() => nav.navigate('NomiTone')} disabled={!canContinue}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', padding: 22 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { borderWidth: 1, borderColor: '#E8D8CA', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#FF2D8E', borderColor: '#FF2D8E' },
  chipText: { color: '#1C1C22', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  button: { marginTop: 24, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
