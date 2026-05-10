import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { IngestAPI } from '../../../services/api';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FirstCapture'>;

function fallbackTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Quick memory';
  return trimmed.split(/\s+/).slice(0, 6).join(' ');
}

export default function FirstCaptureScreen() {
  const nav = useNavigation<Nav>();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const canSave = useMemo(() => text.trim().length > 0, [text]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      IngestAPI.ingest({
        raw_text: text,
        type: 'note',
        title: fallbackTitle(text),
      }),
    onSuccess: () => {
      showToast('First memory saved', 'success');
      setText('');
      nav.navigate('OnboardingComplete');
    },
    onError: (e: any) => showToast(e?.message || 'Save failed. Draft kept.', 'error'),
  });

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Capture your first memory</Text>
      <TextInput
        style={styles.input}
        placeholder="Today I learned..."
        value={text}
        onChangeText={setText}
        multiline
      />
      <TouchableOpacity style={[styles.button, !canSave && styles.disabled]} onPress={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isLoading}>
        {saveMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save memory</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', padding: 22 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22', marginBottom: 10 },
  input: {
    minHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    padding: 14,
    textAlignVertical: 'top',
  },
  button: { marginTop: 18, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
