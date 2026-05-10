import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { API_BASE, AuthAPI } from './api';
import { useStore } from '../store/useStore';
import { InterestTag, User } from '../types';

interface EmailAuthResponse {
  token: string;
  user: User;
}

interface EmailAuthPayload {
  email: string;
  password: string;
  intent?: 'signin' | 'signup';
}

async function postEmailAuth(path: string, payload: EmailAuthPayload): Promise<EmailAuthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Cannot reach backend at ${API_BASE}. Make sure your server is running and API_BASE_URL is valid.`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Apple Sign In ─────────────────────────────────────────────────────────────
export async function signInWithApple(): Promise<User> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  // credential.identityToken is what we send to our backend
  const idToken = credential.identityToken;
  if (!idToken) throw new Error('Apple Sign In failed — no identity token');

  const { token, user } = await AuthAPI.signIn(idToken);

  const appUser: User = {
    id: user.id,
    email: user.email,
    displayName: credential.fullName?.givenName ?? user.email,
    token,
    tier: user.tier ?? 'free',
    onboardingCompleted: !!user.onboardingCompleted,
  };

  await persistUser(appUser, token);
  return appUser;
}

// ── Email / Password (dev / fallback) ─────────────────────────────────────────
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { token, user } = await postEmailAuth('/auth/email', { email, password, intent: 'signin' });
  const appUser: User = { ...user, token };
  await persistUser(appUser, token);
  return appUser;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  try {
    const { token, user } = await postEmailAuth('/auth/email/signup', { email, password, intent: 'signup' });
    const appUser: User = { ...user, token };
    await persistUser(appUser, token);
    return appUser;
  } catch (error: any) {
    // Fallback for backends that multiplex sign-in/sign-up under /auth/email.
    if (typeof error?.message === 'string' && /404|not found/i.test(error.message)) {
      const { token, user } = await postEmailAuth('/auth/email', { email, password, intent: 'signup' });
      const appUser: User = { ...user, token };
      await persistUser(appUser, token);
      return appUser;
    }
    throw error;
  }
}

export async function forgotPasswordWithEmail(email: string): Promise<{ ok: boolean; message: string; debugResetToken?: string }> {
  return AuthAPI.forgotPassword(email);
}

export async function resetPasswordWithToken(token: string, password: string): Promise<{ ok: boolean }> {
  return AuthAPI.resetPassword(token, password);
}

export async function markOnboardingComplete(): Promise<User> {
  const current = useStore.getState().user;
  if (!current?.token) throw new Error('Sign in before completing onboarding.');
  const { user } = await AuthAPI.updateOnboarding(true);
  const appUser: User = {
    ...current,
    ...user,
    token: current.token,
    onboardingCompleted: true,
  };
  await persistUser(appUser, current.token);
  return appUser;
}

// ── Onboarding sign-up ────────────────────────────────────────────────────────
export async function completeOnboarding(
  idToken: string,
  interests: InterestTag[],
): Promise<User> {
  const { token, user } = await AuthAPI.signUp(idToken, interests);
  const appUser: User = { ...user, token, onboardingCompleted: true };
  await persistUser(appUser, token);
  useStore.getState().setOnboarded(true);
  return appUser;
}

// ── Restore session ────────────────────────────────────────────────────────────
export async function restoreSession(): Promise<User | null> {
  try {
    const [token, raw] = await Promise.all([
      SecureStore.getItemAsync('auth_token'),
      SecureStore.getItemAsync('user_data'),
    ]);
    if (!token || !raw) return null;
    const user: User = JSON.parse(raw);
    useStore.getState().setUser(user);
    return user;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function persistUser(user: User, token: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync('auth_token', token),
    SecureStore.setItemAsync('user_data', JSON.stringify(user)),
  ]);
  useStore.getState().setUser(user);
}
