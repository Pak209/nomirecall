import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesPackage,
} from 'react-native-purchases';
import * as SecureStore from 'expo-secure-store';
import { AuthAPI } from './api';
import { useStore } from '../store/useStore';
import { User } from '../types';

const REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
  process.env.REVENUECAT_IOS_KEY ||
  '';

const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
  process.env.REVENUECAT_ANDROID_KEY ||
  '';

const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ||
  'brain';

let configuredUserId: string | null = null;

export type AppTier = 'free' | 'brain' | 'pro';

export interface PaymentPlan {
  id: string;
  tier: AppTier;
  name: string;
  description: string;
  fallbackPrice: string;
  productId: string;
  package?: PurchasesPackage;
}

export const PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: 'brain_monthly',
    tier: 'brain',
    name: 'Brain',
    description: 'Higher monthly limits for capture, X discovery, and recall testing.',
    fallbackPrice: '$12/mo',
    productId: process.env.EXPO_PUBLIC_REVENUECAT_BRAIN_PRODUCT_ID || 'brain_monthly',
  },
  {
    id: 'brain_pro_monthly',
    tier: 'pro',
    name: 'Brain Pro',
    description: 'More room for heavy API testing while Nomi learns real usage costs.',
    fallbackPrice: '$29/mo',
    productId: process.env.EXPO_PUBLIC_REVENUECAT_PRO_PRODUCT_ID || 'brain_pro_monthly',
  },
];

function revenueCatKey() {
  return Platform.OS === 'ios' ? REVENUECAT_IOS_API_KEY : REVENUECAT_ANDROID_API_KEY;
}

export function paymentsConfigured() {
  return !!revenueCatKey();
}

export function configurePayments(user?: User | null) {
  const apiKey = revenueCatKey();
  if (!apiKey) return false;
  const appUserID = user?.id;
  if (configuredUserId === appUserID) return true;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey, appUserID });
  configuredUserId = appUserID || null;
  return true;
}

function planForPackage(pkg: PurchasesPackage) {
  const productId = pkg.product.identifier;
  return PAYMENT_PLANS.find((plan) => (
    plan.id === pkg.identifier ||
    plan.productId === productId ||
    productId.includes(plan.id)
  ));
}

export async function getPaymentPlans(user?: User | null): Promise<PaymentPlan[]> {
  if (!configurePayments(user)) return PAYMENT_PLANS;

  const offerings = await Purchases.getOfferings();
  const availablePackages = offerings.current?.availablePackages || [];
  return PAYMENT_PLANS.map((plan) => {
    const pkg = availablePackages.find((candidate) => {
      const candidatePlan = planForPackage(candidate);
      return candidatePlan?.id === plan.id;
    });
    return pkg ? { ...plan, package: pkg } : plan;
  });
}

function tierFromCustomerInfo(customerInfo: CustomerInfo, fallbackTier: AppTier = 'free'): AppTier {
  const active = customerInfo.entitlements.active || {};
  if (active.pro) return 'pro';
  if (active[ENTITLEMENT_ID]) return fallbackTier === 'pro' ? 'pro' : 'brain';
  return 'free';
}

async function persistUpdatedUser(patch: Partial<User>) {
  const current = useStore.getState().user;
  if (!current) return;
  const next = { ...current, ...patch };
  await Promise.all([
    SecureStore.setItemAsync('user_data', JSON.stringify(next)),
    current.token ? SecureStore.setItemAsync('auth_token', current.token) : Promise.resolve(),
  ]);
  useStore.getState().setUser(next);
}

async function syncTier(tier: AppTier) {
  await AuthAPI.updateTier(tier);
  await persistUpdatedUser({ tier });
}

export async function purchasePlan(plan: PaymentPlan, user?: User | null) {
  if (!configurePayments(user)) {
    throw new Error('Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to .env and restart Expo to test purchases.');
  }
  if (!plan.package) {
    throw new Error('RevenueCat offering is not returning this plan yet. Check product IDs and the current offering.');
  }

  const result = await Purchases.purchasePackage(plan.package);
  const tier = tierFromCustomerInfo(result.customerInfo, plan.tier);
  await syncTier(tier);
  return { tier, customerInfo: result.customerInfo };
}

export async function restorePurchases(user?: User | null) {
  if (!configurePayments(user)) {
    throw new Error('Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to .env and restart Expo to restore purchases.');
  }

  const customerInfo = await Purchases.restorePurchases();
  const tier = tierFromCustomerInfo(customerInfo);
  await syncTier(tier);
  return { tier, customerInfo };
}
