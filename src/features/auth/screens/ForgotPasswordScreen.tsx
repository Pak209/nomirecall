import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { forgotPasswordWithEmail, resetPasswordWithToken } from '../../../services/auth';
import { useToast } from '../../ui/shared/ToastProvider';

export default function ForgotPasswordScreen() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');

  const forgotMutation = useMutation({
    mutationFn: () => forgotPasswordWithEmail(email),
    onSuccess: (res) => {
      if (res.debugResetToken) setToken(res.debugResetToken);
      showToast('Reset instructions generated', 'info');
    },
    onError: (e: any) => showToast(e?.message || 'Reset failed', 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPasswordWithToken(token, password),
    onSuccess: () => showToast('Password reset successful', 'success'),
    onError: (e: any) => showToast(e?.message || 'Reset failed', 'error'),
  });

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Forgot password</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => forgotMutation.mutate()} disabled={forgotMutation.isLoading}>
        {forgotMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Request reset</Text>}
      </TouchableOpacity>
      <Text style={styles.section}>Reset token</Text>
      <TextInput style={styles.input} placeholder="Paste token" value={token} onChangeText={setToken} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="New password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => resetMutation.mutate()} disabled={resetMutation.isLoading}>
        {resetMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset password</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', paddingHorizontal: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#1C1C22', marginBottom: 16, textAlign: 'center' },
  section: { marginTop: 14, marginBottom: 8, color: '#655C57', fontWeight: '700' },
  input: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 14, marginBottom: 10 },
  primaryBtn: { height: 50, borderRadius: 12, backgroundColor: '#FF2D8E', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
