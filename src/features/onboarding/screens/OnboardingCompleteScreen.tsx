import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { markOnboardingComplete } from '../../../services/auth';
import { useToast } from '../../ui/shared/ToastProvider';

export default function OnboardingCompleteScreen() {
  const { showToast } = useToast();
  const completeMutation = useMutation({
    mutationFn: markOnboardingComplete,
    onSuccess: () => showToast('Onboarding complete. Welcome to Nomi!', 'success'),
    onError: (e: any) => showToast(e?.message || 'Could not save onboarding progress', 'error'),
  });

  return (
    <View style={styles.root}>
      <Text style={styles.title}>You are all set</Text>
      <Text style={styles.body}>Your memory space is ready. Start capturing moments and let Nomi help you recall them.</Text>
      <TouchableOpacity
        style={[styles.button, completeMutation.isLoading && styles.buttonDisabled]}
        onPress={() => completeMutation.mutate()}
        disabled={completeMutation.isLoading}
      >
        {completeMutation.isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Go to Home</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', padding: 22 },
  title: { fontSize: 32, fontWeight: '800', color: '#1C1C22' },
  body: { marginTop: 10, color: '#655C57', lineHeight: 24 },
  button: { marginTop: 26, backgroundColor: '#FF2D8E', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
