import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Switch, Linking,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, INTERESTS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { InterestTag, RootStackParamList } from '../types';
import { AuthAPI } from '../services/api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function SettingsRow({ label, value, onPress, danger, right }: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress && !right}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {right ? right : (
        value ? <Text style={styles.rowValue}>{value}</Text> : null
      )}
      {onPress && !right && <Text style={styles.rowArrow}>›</Text>}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user, activeTopics, setActiveTopics, logout, serverOnline } = useStore();
  const updateInterestsMutation = useMutation({
    mutationFn: (interests: InterestTag[]) => AuthAPI.updateInterests(interests),
  });

  function toggleTopic(id: InterestTag) {
    const next = activeTopics.includes(id)
      ? activeTopics.filter((t) => t !== id)
      : [...activeTopics, id];
    if (next.length === 0) return;
    setActiveTopics(next);
    updateInterestsMutation.mutate(next);
  }

  function handleUpgrade() {
    nav.navigate('Paywall', {});
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  const tierLabel = user?.tier === 'pro' ? 'Brain Pro ◈' : user?.tier === 'brain' ? 'Brain ⬡' : 'Free';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>◎ Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow label="Email" value={user?.email ?? '—'} />
          <SettingsRow label="Plan" value={tierLabel} onPress={handleUpgrade} />
          {user?.tier === 'free' && (
            <TouchableOpacity style={styles.supportCard} onPress={handleUpgrade}>
              <Text style={styles.supportTitle}>Support API testing</Text>
              <Text style={styles.supportDesc}>Test subscriptions while helping cover X discovery and AI recall costs.</Text>
              <View style={styles.supportBtn}>
                <Text style={styles.supportBtnText}>View plans</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Server */}
        <SectionHeader title="Server" />
        <View style={styles.section}>
          <SettingsRow
            label="Connection"
            right={
              <View style={[styles.statusPill, { backgroundColor: serverOnline ? Colors.greenBg : Colors.redBg, borderColor: serverOnline ? Colors.green : Colors.red }]}>
                <Text style={[styles.statusPillText, { color: serverOnline ? Colors.green : Colors.red }]}>
                  {serverOnline ? '● online' : '● offline'}
                </Text>
              </View>
            }
          />
        </View>

        {/* Interests */}
        <SectionHeader title="Feed interests" />
        <View style={styles.section}>
          {INTERESTS.map((interest) => {
            const on = activeTopics.includes(interest.id as InterestTag);
            return (
              <View key={interest.id} style={styles.row}>
                <Text style={styles.interestEmoji}>{interest.emoji}</Text>
                <Text style={[styles.rowLabel, { flex: 1 }]}>{interest.label}</Text>
                <Switch
                  value={on}
                  onValueChange={() => toggleTopic(interest.id as InterestTag)}
                  trackColor={{ false: Colors.border, true: Colors.teal }}
                  thumbColor="#fff"
                  ios_backgroundColor={Colors.border}
                />
              </View>
            );
          })}
        </View>

        {/* Legal */}
        <SectionHeader title="Legal" />
        <View style={styles.section}>
          <SettingsRow
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://yourapp.com/privacy')}
          />
          <SettingsRow
            label="Terms of Service"
            onPress={() => Linking.openURL('https://yourapp.com/terms')}
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Account" />
        <View style={styles.section}>
          <SettingsRow label="Sign out" onPress={handleSignOut} danger />
        </View>

        <Text style={styles.versionText}>Nomi v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.semibold, color: Colors.textPrimary },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 100 },

  sectionHeader: {
    fontSize: Typography.xs, textTransform: 'uppercase', letterSpacing: 0.1,
    color: Colors.textTertiary, marginTop: Spacing.xl, marginBottom: Spacing.sm,
    fontFamily: 'Courier New',
  },
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    minHeight: 50,
  },
  rowLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  rowLabelDanger: { color: Colors.red },
  rowValue: { fontSize: Typography.sm, color: Colors.textSecondary },
  rowArrow: { fontSize: 18, color: Colors.textTertiary, marginLeft: Spacing.sm },

  statusPill: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 0.5,
  },
  statusPillText: { fontSize: Typography.xs, fontFamily: 'Courier New' },

  interestEmoji: { fontSize: 16, marginRight: Spacing.md, color: Colors.textTertiary },

  supportCard: {
    margin: Spacing.md, padding: Spacing.lg,
    backgroundColor: Colors.tealDim, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.teal,
  },
  supportTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.teal, marginBottom: 4 },
  supportDesc: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  supportBtn: {
    alignSelf: 'flex-start', paddingHorizontal: Spacing.lg,
    paddingVertical: 8, borderRadius: Radius.md,
    backgroundColor: Colors.teal,
  },
  supportBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textInverse },

  versionText: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xxxl },
});
