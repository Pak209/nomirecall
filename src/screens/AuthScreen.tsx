import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useMutation } from '@tanstack/react-query';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import {
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
  forgotPasswordWithEmail,
  resetPasswordWithToken,
} from '../services/auth';

export default function AuthScreen() {
  const [mode, setMode] = useState<'landing' | 'email_signin' | 'email_signup' | 'forgot_password' | 'reset_password'>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  function resetEmailFields() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setResetToken('');
    setNewPassword('');
    setConfirmNewPassword('');
  }

  const signInAppleMutation = useMutation({
    mutationFn: signInWithApple,
    onError: (error: any) => {
      if (error?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', error?.message || 'Unknown error');
      }
    },
  });

  const signInEmailMutation = useMutation({
    mutationFn: ({ nextEmail, nextPassword }: { nextEmail: string; nextPassword: string }) => (
      signInWithEmail(nextEmail, nextPassword)
    ),
    onError: (error: any) => {
      Alert.alert('Sign in failed', error?.message || 'Unknown error');
    },
  });

  const signUpEmailMutation = useMutation({
    mutationFn: ({ nextEmail, nextPassword }: { nextEmail: string; nextPassword: string }) => (
      signUpWithEmail(nextEmail, nextPassword)
    ),
    onError: (error: any) => {
      Alert.alert('Create account failed', error?.message || 'Unknown error');
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: (nextEmail: string) => forgotPasswordWithEmail(nextEmail),
    onSuccess: (data) => {
      const debugTokenMessage = data.debugResetToken ? `\n\nDev reset token:\n${data.debugResetToken}` : '';
      if (data.debugResetToken) setResetToken(data.debugResetToken);
      Alert.alert('Reset email requested', `${data.message}${debugTokenMessage}`);
      setMode('reset_password');
    },
    onError: (error: any) => {
      Alert.alert('Reset request failed', error?.message || 'Unknown error');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ token, passwordValue }: { token: string; passwordValue: string }) => (
      resetPasswordWithToken(token, passwordValue)
    ),
    onSuccess: () => {
      Alert.alert('Password updated', 'You can now sign in with your new password.');
      setMode('email_signin');
      setPassword('');
    },
    onError: (error: any) => {
      Alert.alert('Reset failed', error?.message || 'Unknown error');
    },
  });

  const loading =
    signInAppleMutation.isLoading ||
    signInEmailMutation.isLoading ||
    signUpEmailMutation.isLoading ||
    forgotPasswordMutation.isLoading ||
    resetPasswordMutation.isLoading;

  async function handleEmail() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Enter email and password');
      return;
    }
    signInEmailMutation.mutate({ nextEmail: email, nextPassword: password });
  }

  async function handleCreateAccount() {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Enter email, password, and confirm password');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords must match');
      return;
    }
    signUpEmailMutation.mutate({ nextEmail: email, nextPassword: password });
  }

  function handleForgotPassword() {
    if (!email) {
      Alert.alert('Missing email', 'Enter your account email first.');
      return;
    }
    forgotPasswordMutation.mutate(email);
  }

  function handleResetPassword() {
    if (!resetToken || !newPassword || !confirmNewPassword) {
      Alert.alert('Missing fields', 'Enter token and your new password.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Password mismatch', 'New passwords must match.');
      return;
    }
    resetPasswordMutation.mutate({ token: resetToken, passwordValue: newPassword });
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / Wordmark */}
        <View style={styles.hero}>
          <Text style={styles.logo}>⬡</Text>
          <Text style={styles.wordmark}>Nomi</Text>
          <Text style={styles.tagline}>
            Your AI memory companion.{'\n'}Capture anything. Remember everything.
          </Text>
        </View>

        {mode === 'landing' && (
          <View style={styles.authBlock}>
            {/* Apple Sign In */}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={Radius.md}
              style={styles.appleBtn}
              onPress={() => signInAppleMutation.mutate()}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.emailBtn}
              onPress={() => {
                resetEmailFields();
                setMode('email_signin');
              }}
              accessibilityLabel="Continue with email to sign in"
            >
              <Text style={styles.emailBtnText}>Continue with email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createAccountBtn}
              onPress={() => {
                resetEmailFields();
                setMode('email_signup');
              }}
              accessibilityLabel="Create a new account with email"
            >
              <Text style={styles.createAccountBtnText}>Create an account</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'email_signin' && (
          <View style={styles.authBlock}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Password"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleEmail}
              disabled={loading}
              accessibilityLabel="Sign in with email"
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('forgot_password')}
              style={styles.backLink}
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                resetEmailFields();
                setMode('landing');
              }}
              style={styles.backLink}
              accessibilityLabel="Back to sign in options"
            >
              <Text style={styles.backLinkText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'forgot_password' && (
          <View style={styles.authBlock}>
            <TextInput
              style={styles.input}
              placeholder="Account email"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleForgotPassword}
              disabled={loading}
              accessibilityLabel="Request password reset"
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Send reset instructions</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('email_signin')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back to sign in</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'reset_password' && (
          <View style={styles.authBlock}>
            <TextInput
              style={styles.input}
              placeholder="Reset token"
              placeholderTextColor={Colors.textTertiary}
              value={resetToken}
              onChangeText={setResetToken}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="New password"
              placeholderTextColor={Colors.textTertiary}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="password-new"
            />
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Confirm new password"
              placeholderTextColor={Colors.textTertiary}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              autoComplete="password-new"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Reset password</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('email_signin')} style={styles.backLink}>
              <Text style={styles.backLinkText}>← Back to sign in</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'email_signup' && (
          <View style={styles.authBlock}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Password"
              placeholderTextColor={Colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
            />
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Confirm password"
              placeholderTextColor={Colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="password-new"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleCreateAccount}
              disabled={loading}
              accessibilityLabel="Create account with email"
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                resetEmailFields();
                setMode('landing');
              }}
              style={styles.backLink}
              accessibilityLabel="Back to sign in options"
            >
              <Text style={styles.backLinkText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.legal}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>

      {loading && mode === 'landing' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.teal} size="large" />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.section,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  logo: {
    fontSize: 56,
    color: Colors.teal,
    marginBottom: Spacing.md,
  },
  wordmark: {
    fontSize: Typography.xxxl,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  tagline: {
    fontSize: Typography.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  authBlock: {
    width: '100%',
  },
  appleBtn: {
    width: '100%',
    height: 52,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: Typography.sm,
    color: Colors.textTertiary,
  },
  emailBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailBtnText: {
    fontSize: Typography.md,
    color: Colors.textPrimary,
    fontWeight: Typography.medium,
  },
  createAccountBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  createAccountBtnText: {
    fontSize: Typography.md,
    color: Colors.teal,
    fontWeight: Typography.medium,
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgInput,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    fontSize: Typography.md,
    color: Colors.textPrimary,
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  primaryBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    color: Colors.textInverse,
  },
  backLink: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  backLinkText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  forgotLinkText: {
    fontSize: Typography.sm,
    color: Colors.teal,
    fontWeight: Typography.medium,
  },
  legal: {
    fontSize: Typography.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xxxl,
    lineHeight: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg + 'cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
