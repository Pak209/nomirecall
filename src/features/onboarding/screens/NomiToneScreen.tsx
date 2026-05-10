import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';
import { useStore } from '../../../store/useStore';

const TONES = ['friendly', 'coach', 'calm', 'concise'] as const;
type Tone = (typeof TONES)[number];
type Nav = NativeStackNavigationProp<RootStackParamList, 'NomiTone'>;

export default function NomiToneScreen() {
  const nav = useNavigation<Nav>();
  const tone = useStore((s) => s.onboardingTone);
  const setTone = useStore((s) => s.setOnboardingTone);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Pick Nomi's tone</Text>
      <View style={styles.row}>
        {TONES.map((item) => (
          <TouchableOpacity key={item} style={[styles.chip, tone === item && styles.chipActive]} onPress={() => setTone(item as Tone)}>
            <Text style={[styles.chipText, tone === item && styles.chipTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={() => nav.navigate('Permissions')}>
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
  chipActive: { backgroundColor: '#7B3FF2', borderColor: '#7B3FF2' },
  chipText: { color: '#1C1C22', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  button: { marginTop: 24, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
