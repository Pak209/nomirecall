import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { signUpWithEmail } from '../../../services/auth';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const nav = useNavigation<Nav>();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const signUpMutation = useMutation({
    mutationFn: () => signUpWithEmail(email, password),
    onSuccess: () => showToast('Account created!', 'success'),
    onError: (e: any) => showToast(e?.message || 'Create account failed', 'error'),
  });

  function handleSubmit() {
    if (!email || !password) return showToast('Email and password are required', 'warning');
    if (password !== confirmPassword) return showToast('Passwords must match', 'warning');
    signUpMutation.mutate();
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create account</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TextInput style={styles.input} placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
      <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={signUpMutation.isLoading}>
        {signUpMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create account</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => nav.navigate('SignIn')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', justifyContent: 'center', paddingHorizontal: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#1C1C22', marginBottom: 20, textAlign: 'center' },
  input: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 14, marginBottom: 10 },
  primaryBtn: { height: 50, borderRadius: 12, backgroundColor: '#FF2D8E', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { marginTop: 12, color: '#7B3FF2', textAlign: 'center', fontWeight: '600' },
});
