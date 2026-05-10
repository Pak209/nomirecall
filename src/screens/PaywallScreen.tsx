import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useStore } from '../store/useStore';
import {
  getPaymentPlans,
  PaymentPlan,
  paymentsConfigured,
  PAYMENT_PLANS,
  purchasePlan,
  restorePurchases,
} from '../services/payments';

const FEATURE_COPY: Record<string, string[]> = {
  brain: [
    'Higher X discovery limits',
    'More AI summaries and recall queries',
    'More monthly captures for heavy testing',
    'Helps cover live API fees',
  ],
  pro: [
    'Everything in Brain',
    'More room for stress testing',
    'Priority room for future automations',
    'Best for API-heavy test accounts',
  ],
};

function planPrice(plan: PaymentPlan) {
  return plan.package?.product.priceString || plan.fallbackPrice;
}

export default function PaywallScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useStore();
  const [plans, setPlans] = useState<PaymentPlan[]>(PAYMENT_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState(PAYMENT_PLANS[0].id);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || plans[0],
    [plans, selectedPlanId],
  );
  const configured = paymentsConfigured();

  useEffect(() => {
    let active = true;
    setLoadingPlans(true);
    getPaymentPlans(user)
      .then((nextPlans) => {
        if (!active) return;
        setPlans(nextPlans);
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setPlans(PAYMENT_PLANS);
        setLoadError(error?.message || 'Could not load RevenueCat offerings.');
      })
      .finally(() => {
        if (active) setLoadingPlans(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handlePurchase() {
    if (!selectedPlan) return;
    setPurchaseLoading(true);
    try {
      const result = await purchasePlan(selectedPlan, user);
      Alert.alert('Purchase active', `Nomi ${result.tier} is now active.`, [
        { text: 'Nice', onPress: () => nav.goBack() },
      ]);
    } catch (error: any) {
      if (error?.userCancelled) return;
      Alert.alert('Purchase not completed', error?.message || 'RevenueCat could not complete this purchase.');
    } finally {
      setPurchaseLoading(false);
    }
  }

  async function handleRestore() {
    setRestoreLoading(true);
    try {
      const result = await restorePurchases(user);
      Alert.alert('Purchases restored', `Your current Nomi tier is ${result.tier}.`);
    } catch (error: any) {
      Alert.alert('Restore failed', error?.message || 'RevenueCat could not restore purchases.');
    } finally {
      setRestoreLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => nav.goBack()} accessibilityLabel="Close paywall">
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support Nomi</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Help cover the API fuel</Text>
          <Text style={styles.heroSub}>
            Test subscriptions before launch while keeping X discovery and AI recall costs under control.
          </Text>
        </View>

        {!configured ? (
          <View style={styles.configNotice}>
            <Text style={styles.configTitle}>RevenueCat key needed</Text>
            <Text style={styles.configText}>
              Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to .env, restart Expo, and use an iOS dev/TestFlight build to test purchases.
            </Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.configNotice}>
            <Text style={styles.configTitle}>Offerings not loaded</Text>
            <Text style={styles.configText}>{loadError}</Text>
          </View>
        ) : null}

        {loadingPlans ? (
          <ActivityIndicator color={Colors.teal} style={styles.loader} />
        ) : plans.map((plan) => {
          const selected = selectedPlanId === plan.id;
          const live = !!plan.package;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selected && styles.planCardSelected]}
              onPress={() => setSelectedPlanId(plan.id)}
              activeOpacity={0.84}
            >
              <View style={styles.planTop}>
                <View style={styles.radioOuter}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
                <View style={styles.planTitleBlock}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                </View>
                <View style={styles.priceBlock}>
                  <Text style={styles.planPrice}>{planPrice(plan)}</Text>
                  <Text style={styles.planLive}>{live ? 'Live' : 'Setup'}</Text>
                </View>
              </View>

              <View style={styles.planFeatures}>
                {(FEATURE_COPY[plan.tier] || []).map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Text style={styles.featureCheck}>✓</Text>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.legalNote}>
          Apple handles payment and renewal. Sandbox/TestFlight purchases will use Apple test accounts.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.ctaBtn, (!configured || !selectedPlan?.package || purchaseLoading) && styles.ctaBtnDisabled]}
          onPress={handlePurchase}
          disabled={!configured || !selectedPlan?.package || purchaseLoading}
        >
          {purchaseLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaBtnText}>
              {selectedPlan?.package ? `Start ${selectedPlan.name}` : 'Configure RevenueCat offering'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={!configured || restoreLoading}>
          <Text style={[styles.restoreText, (!configured || restoreLoading) && styles.restoreTextDisabled]}>
            {restoreLoading ? 'Restoring...' : 'Restore purchases'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: Colors.textPrimary, fontSize: 30, lineHeight: 32 },
  headerTitle: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontSize: Typography.lg, fontWeight: Typography.semibold },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  hero: { marginBottom: Spacing.lg },
  heroTitle: { fontSize: Typography.xxxl, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  heroSub: { fontSize: Typography.md, color: Colors.textSecondary, lineHeight: 22 },
  configNotice: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.amber,
    backgroundColor: Colors.amberBg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  configTitle: { color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: Typography.bold, marginBottom: 4 },
  configText: { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 19 },
  loader: { marginVertical: Spacing.xl },
  planCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  planCardSelected: { borderColor: Colors.teal, backgroundColor: Colors.tealDim },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.teal },
  planTitleBlock: { flex: 1 },
  planName: { color: Colors.textPrimary, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: 4 },
  planDescription: { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 19 },
  priceBlock: { alignItems: 'flex-end', maxWidth: 96 },
  planPrice: { color: Colors.textPrimary, fontSize: Typography.md, fontWeight: Typography.bold, textAlign: 'right' },
  planLive: { marginTop: 4, color: Colors.textTertiary, fontSize: Typography.xs, fontWeight: Typography.medium },
  planFeatures: { gap: 7, marginTop: Spacing.md, paddingLeft: 34 },
  featureRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  featureCheck: { color: Colors.teal, fontSize: Typography.sm, fontWeight: Typography.bold },
  featureText: { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 18, flex: 1 },
  legalNote: { fontSize: 10, color: Colors.textTertiary, textAlign: 'center', lineHeight: 16, marginTop: Spacing.md },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  ctaBtn: { height: 54, borderRadius: Radius.md, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center' },
  ctaBtnDisabled: { opacity: 0.58 },
  ctaBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#fff' },
  restoreButton: { alignItems: 'center', paddingVertical: Spacing.md },
  restoreText: { fontSize: Typography.sm, color: Colors.teal, fontWeight: Typography.semibold },
  restoreTextDisabled: { color: Colors.textTertiary },
});
