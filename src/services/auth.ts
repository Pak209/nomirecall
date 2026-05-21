import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
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

let googleConfigured = false;
const env = process.env as unknown as Record<string, string | undefined>;

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

function makeAppUser(user: User, token: string, displayName?: string | null): User {
  return {
    ...user,
    displayName: displayName || user.displayName || user.email,
    token,
    tier: user.tier ?? 'free',
    onboardingCompleted: !!user.onboardingCompleted,
  };
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

  const appUser = makeAppUser(user, token, credential.fullName?.givenName);

  await persistUser(appUser, token);
  return appUser;
}

// ── Google Sign In / Firebase Auth ───────────────────────────────────────────
function configureGoogleSignIn() {
  if (googleConfigured) return;
  const webClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  const iosClientId = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;

  if (!webClientId) {
    throw new Error('Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID from Firebase/Google Cloud, then restart Expo.');
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId,
    offlineAccess: false,
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<User> {
  try {
    configureGoogleSignIn();
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const result = await GoogleSignin.signIn();
    const idToken = result.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');

    const credential = auth.GoogleAuthProvider.credential(idToken);
    const firebaseResult = await auth().signInWithCredential(credential);
    const firebaseIdToken = await firebaseResult.user.getIdToken();
    const { token, user } = await AuthAPI.signIn(firebaseIdToken);
    const appUser = makeAppUser(user, token, firebaseResult.user.displayName);
    await persistUser(appUser, token);
    return appUser;
  } catch (error: any) {
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
      throw Object.assign(new Error('Google sign-in was cancelled.'), { code: 'ERR_REQUEST_CANCELED' });
    }
    throw error;
  }
}

// ── Email / Password (dev / fallback) ─────────────────────────────────────────
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { token, user } = await postEmailAuth('/auth/email', { email, password, intent: 'signin' });
  const appUser = makeAppUser(user, token);
  await persistUser(appUser, token);
  return appUser;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  try {
    const { token, user } = await postEmailAuth('/auth/email/signup', { email, password, intent: 'signup' });
    const appUser = makeAppUser(user, token);
    await persistUser(appUser, token);
    return appUser;
  } catch (error: any) {
    // Fallback for backends that multiplex sign-in/sign-up under /auth/email.
    if (typeof error?.message === 'string' && /404|not found/i.test(error.message)) {
      const { token, user } = await postEmailAuth('/auth/email', { email, password, intent: 'signup' });
      const appUser = makeAppUser(user, token);
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

export async function deleteCurrentAccount(): Promise<void> {
  const firebaseUser = auth().currentUser;
  if (firebaseUser) {
    await firebaseUser.delete();
  }

  await AuthAPI.deleteAccount();
  await GoogleSignin.signOut().catch(() => undefined);
  await auth().signOut().catch(() => undefined);
  await Promise.all([
    SecureStore.deleteItemAsync('auth_token'),
    SecureStore.deleteItemAsync('user_data'),
  ]);
  useStore.getState().setUser(null);
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
