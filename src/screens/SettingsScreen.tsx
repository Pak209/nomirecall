import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Switch, Linking, ActivityIndicator, Share, Modal, TextInput, Image, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, INTERESTS } from '../constants/theme';
import { useStore } from '../store/useStore';
import { InterestTag, MemoryItem, RootStackParamList } from '../types';
import { API_BASE, AuthAPI, MemoryAPI, XBookmarkAPI } from '../services/api';
import { deleteCurrentAccount, updateCurrentUserProfile } from '../services/auth';
import { restorePurchases } from '../services/payments';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const env = process.env as unknown as Record<string, string | undefined>;
const APP_PACKAGE = 'com.dkimoto.nomi';

function publicBackendUrl(path: 'privacy' | 'terms') {
  const configured = path === 'privacy'
    ? env.EXPO_PUBLIC_PRIVACY_POLICY_URL
    : env.EXPO_PUBLIC_TERMS_OF_USE_URL;
  if (configured) return configured;
  return API_BASE.replace(/\/api\/?$/, `/${path}`);
}

function subscriptionManagementUrl() {
  if (Platform.OS === 'android') {
    return `https://play.google.com/store/account/subscriptions?package=${APP_PACKAGE}`;
  }
  return 'https://apps.apple.com/account/subscriptions';
}

function supportUrl() {
  return env.EXPO_PUBLIC_SUPPORT_URL || 'mailto:support@nomirecall.app?subject=Nomi%20Recall%20Support';
}

function SettingsRow({ label, value, onPress, danger, right, disabled }: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  const dark = useStore((state) => state.theme === 'dark');
  return (
    <TouchableOpacity
      style={[styles.row, dark && styles.rowDark, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled || (!onPress && !right)}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowLabel, dark && styles.rowLabelDark, danger && styles.rowLabelDanger]}>{label}</Text>
      {right ? right : (
        value ? <Text style={[styles.rowValue, dark && styles.rowValueDark]}>{value}</Text> : null
      )}
      {onPress && !right && <Text style={[styles.rowArrow, dark && styles.rowArrowDark]}>›</Text>}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  const dark = useStore((state) => state.theme === 'dark');
  return <Text style={[styles.sectionHeader, dark && styles.sectionHeaderDark]}>{title}</Text>;
}

function markdownValue(value?: string) {
  return String(value || '').replace(/"/g, '\\"');
}

function memoryToMarkdown(memory: MemoryItem) {
  const body = memory.body || '';
  const tags = memory.tags?.length ? memory.tags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ') : '';
  return [
    '---',
    `title: "${markdownValue(memory.title)}"`,
    `type: "${markdownValue(memory.source_type)}"`,
    `category: "${markdownValue(memory.category || 'General')}"`,
    memory.source_url ? `source: "${markdownValue(memory.source_url)}"` : '',
    memory.authorUsername ? `author: "@${markdownValue(memory.authorUsername)}"` : '',
    memory.postDate ? `postDate: "${markdownValue(memory.postDate)}"` : '',
    '---',
    '',
    `# ${memory.title || 'Untitled memory'}`,
    '',
    body || '_No body saved._',
    '',
    tags,
  ].filter(Boolean).join('\n');
}

function exportMarkdown(memories: MemoryItem[]) {
  const exportedAt = new Date().toISOString();
  return [
    '# Nomi Obsidian Export',
    '',
    `Exported: ${exportedAt}`,
    `Memories: ${memories.length}`,
    '',
    memories.map(memoryToMarkdown).join('\n\n---\n\n'),
  ].join('\n');
}

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user, activeTopics, setActiveTopics, logout, serverOnline, theme } = useStore();
  const dark = theme === 'dark';
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? '');
  const [displayNameDraft, setDisplayNameDraft] = useState(user?.displayName ?? user?.username ?? '');
  const [photoDraft, setPhotoDraft] = useState(user?.photoURL ?? '');
  const memoriesQuery = useQuery({
    queryKey: ['settings-memory-counts'],
    queryFn: () => MemoryAPI.list(),
    enabled: serverOnline,
  });
  const xStatusQuery = useQuery({
    queryKey: ['x-bookmark-status'],
    queryFn: () => XBookmarkAPI.status(),
    enabled: serverOnline,
  });
  const updateInterestsMutation = useMutation({
    mutationFn: (interests: InterestTag[]) => AuthAPI.updateInterests(interests),
  });
  const updateProfileMutation = useMutation({
    mutationFn: (payload: { username: string; displayName: string; photoURL?: string | null }) => updateCurrentUserProfile(payload),
    onSuccess: () => {
      setProfileOpen(false);
      Alert.alert('Profile saved', 'Your profile has been updated.');
    },
    onError: (e: any) => Alert.alert('Profile failed', e?.message || 'Could not update your profile.'),
  });
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { memories } = await MemoryAPI.list();
      const markdown = exportMarkdown(memories);
      const fileUri = `${FileSystem.cacheDirectory}nomi-obsidian-export.md`;
      await FileSystem.writeAsStringAsync(fileUri, markdown);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: 'Export Nomi Markdown',
          mimeType: 'text/markdown',
          UTI: 'net.daringfireball.markdown',
        });
      } else {
        await Share.share({ title: 'Nomi Obsidian Export', message: markdown });
      }
    },
    onError: (e: any) => Alert.alert('Export failed', e?.message || 'Could not export Markdown.'),
  });
  const deleteAccountMutation = useMutation({
    mutationFn: deleteCurrentAccount,
    onError: (e: any) => Alert.alert('Account deletion failed', e?.message || 'Could not delete this account.'),
  });
  const restorePurchasesMutation = useMutation({
    mutationFn: () => restorePurchases(user),
    onSuccess: (result) => Alert.alert('Purchases restored', `Your current Nomi tier is ${result.tier}.`),
    onError: (e: any) => Alert.alert('Restore failed', e?.message || 'Could not restore purchases.'),
  });
  const connectXMutation = useMutation({
    mutationFn: () => XBookmarkAPI.connect(),
    onSuccess: async (response) => {
      if (!response.configured || !response.authorizationUrl) {
        Alert.alert('X is not ready', 'X OAuth is not configured on the backend yet.');
        return;
      }
      await Linking.openURL(response.authorizationUrl);
      Alert.alert('Finish in X', 'After approving X, return here and tap Refresh.');
    },
    onError: (e: any) => Alert.alert('X connection failed', e?.message || 'Could not start X connection.'),
  });
  const syncXMutation = useMutation({
    mutationFn: () => XBookmarkAPI.sync(25),
    onSuccess: (result) => {
      xStatusQuery.refetch();
      memoriesQuery.refetch();
      const imported = result.importedCount ?? result.imported ?? 0;
      const skipped = result.duplicateCount ?? result.skipped ?? 0;
      const failed = result.failedCount ?? 0;
      if (result.status === 'partial_success') {
        Alert.alert('X sync finished', `Imported ${imported}, skipped ${skipped}, failed ${failed}.`);
      } else if (imported === 0) {
        Alert.alert('X sync finished', skipped > 0 ? `No new bookmarks. ${skipped} already saved.` : 'No new X bookmarks found.');
      } else {
        Alert.alert('X sync finished', `Imported ${imported} new X bookmarks. ${skipped} skipped.`);
      }
    },
    onError: (e: any) => {
      xStatusQuery.refetch();
      Alert.alert('X sync failed', e?.message || 'Could not sync X bookmarks.');
    },
  });
  const updateDailyXMutation = useMutation({
    mutationFn: (enabled: boolean) => XBookmarkAPI.updateDailySyncEnabled(enabled),
    onSuccess: () => xStatusQuery.refetch(),
    onError: (e: any) => Alert.alert('Daily sync failed', e?.message || 'Could not update daily X sync.'),
  });
  const disconnectXMutation = useMutation({
    mutationFn: () => XBookmarkAPI.disconnect(),
    onSuccess: () => {
      xStatusQuery.refetch();
      Alert.alert('X disconnected', 'X bookmarks are no longer connected.');
    },
    onError: (e: any) => Alert.alert('Disconnect failed', e?.message || 'Could not disconnect X.'),
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

  function handleDeleteAccount() {
    Alert.alert('Delete account?', `${Platform.OS === 'android' ? 'Your Google Play subscription is managed separately and must be canceled in Google Play. ' : ''}This removes your Nomi profile, memories, uploaded files, X connection, and AI metadata tied to this account, then signs you out. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => deleteAccountMutation.mutate() },
    ]);
  }

  async function openManagedUrl(url: string) {
    const canOpen = await Linking.canOpenURL(url).catch(() => true);
    if (!canOpen) {
      Alert.alert('Cannot open link', url);
      return;
    }
    await Linking.openURL(url);
  }

  const tierLabel = user?.tier === 'pro' ? 'Brain Pro ◈' : user?.tier === 'brain' ? 'Brain ⬡' : 'Free';
  const normalizedUsername = normalizeUsername(usernameDraft);
  const memories = memoriesQuery.data?.memories ?? [];
  const categories = useMemo(() => Array.from(new Set(memories.map((item) => item.category || 'General'))), [memories]);
  const displayName = user?.displayName || user?.username || 'Nomi friend';
  const handle = user?.username ? `@${user.username}` : user?.email || 'Choose your username';
  const xStatus = xStatusQuery.data;
  const xConnected = xStatus?.connected === true;
  const xBusy = xStatusQuery.isFetching || connectXMutation.isLoading || syncXMutation.isLoading || updateDailyXMutation.isLoading || disconnectXMutation.isLoading;
  const xLastSyncLabel = xStatus?.lastSyncedAt ? shortDate(xStatus.lastSyncedAt) : 'Never';

  function openProfileEditor() {
    setUsernameDraft(user?.username ?? '');
    setDisplayNameDraft(user?.displayName ?? user?.username ?? '');
    setPhotoDraft(user?.photoURL ?? '');
    setProfileOpen(true);
  }

  async function chooseProfilePhoto() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoDraft(result.assets[0].uri);
  }

  function saveProfile() {
    if (normalizedUsername.length < 3) {
      Alert.alert('Username too short', 'Use at least 3 letters or numbers.');
      return;
    }
    updateProfileMutation.mutate({
      username: normalizedUsername,
      displayName: displayNameDraft.trim() || normalizedUsername,
      photoURL: photoDraft || null,
    });
  }

  const interestRows = INTERESTS.map((interest) => {
    const on = activeTopics.includes(interest.id as InterestTag);
    return (
      <View key={interest.id} style={[styles.row, dark && styles.rowDark]}>
        <Text style={styles.interestEmoji}>{interest.emoji}</Text>
        <Text style={[styles.rowLabel, dark && styles.rowLabelDark, { flex: 1 }]}>{interest.label}</Text>
        <Switch
          value={on}
          onValueChange={() => toggleTopic(interest.id as InterestTag)}
          trackColor={{ false: Colors.border, true: Colors.teal }}
          thumbColor="#fff"
          ios_backgroundColor={Colors.border}
        />
      </View>
    );
  });

  return (
    <View style={[styles.root, dark && styles.rootDark, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, dark && styles.headerTitleDark]}>Settings</Text>
          <Text style={[styles.headerSubtitle, dark && styles.headerSubtitleDark]}>Manage your profile and connections</Text>
        </View>
        <TouchableOpacity style={[styles.moreButton, dark && styles.moreButtonDark]} onPress={() => setMoreOpen(true)} accessibilityRole="button" accessibilityLabel="Open settings options">
          <Text style={[styles.moreButtonText, dark && styles.moreButtonTextDark]}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Profile" />
        <View style={[styles.section, dark && styles.sectionDark]}>
          <View style={[styles.profileBlock, dark && styles.profileBlockDark]}>
            <TouchableOpacity style={styles.avatarWrap} onPress={openProfileEditor} accessibilityRole="button" accessibilityLabel="Edit profile photo">
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarCircle, dark && styles.avatarCircleDark]}>
                  <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.avatarBadge, dark && styles.avatarBadgeDark]}>
                <Text style={styles.avatarBadgeText}>+</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.profileText}>
              <Text style={[styles.profileName, dark && styles.profileNameDark]} numberOfLines={1}>{displayName}</Text>
              <Text style={[styles.profileHandle, dark && styles.profileHandleDark]} numberOfLines={1}>{handle}</Text>
              <TouchableOpacity onPress={openProfileEditor}>
                <Text style={styles.inlineAction}>{user?.username ? 'Edit profile' : 'Choose username'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.profileStats}>
              <View style={styles.inlineStatRow}>
                <Text style={[styles.inlineStatLabel, dark && styles.inlineStatLabelDark]}>Captures</Text>
                <Text style={[styles.inlineStatValue, dark && styles.inlineStatValueDark]}>{memories.length}</Text>
              </View>
              <View style={styles.inlineStatRow}>
                <Text style={[styles.inlineStatLabel, dark && styles.inlineStatLabelDark]}>Categories</Text>
                <Text style={[styles.inlineStatValue, dark && styles.inlineStatValueDark]}>{categories.length}</Text>
              </View>
            </View>
          </View>
          <SettingsRow label="Email" value={user?.email ?? '—'} />
          <SettingsRow label="AI usage" value="Free" />
          <SettingsRow label="Onboarding" value={user?.onboardingCompleted ? 'Complete' : 'Open'} />
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="X Bookmarks" />
        <View style={[styles.section, dark && styles.sectionDark]}>
          <SettingsRow
            label="Status"
            right={
            <View style={[styles.statusPill, { backgroundColor: xConnected ? Colors.greenBg : Colors.redBg, borderColor: xConnected ? Colors.green : Colors.red }]}>
                <Text style={[styles.statusPillText, { color: xConnected ? Colors.green : Colors.red }]}>
                  {xConnected ? '● connected' : '● not connected'}
                </Text>
              </View>
            }
          />
          {xConnected ? (
            <>
              <SettingsRow label="Account" value={xStatus?.username ? `@${xStatus.username}` : 'Connected'} />
              <SettingsRow label="Last sync" value={xLastSyncLabel} />
              <SettingsRow
                label="Daily sync"
                right={
                  <Switch
                    value={xStatus?.dailySyncEnabled === true}
                    onValueChange={(enabled) => updateDailyXMutation.mutate(enabled)}
                    disabled={xBusy}
                    trackColor={{ false: Colors.border, true: Colors.teal }}
                    thumbColor="#fff"
                    ios_backgroundColor={Colors.border}
                  />
                }
              />
              {xStatus?.lastSyncError ? <Text style={styles.xErrorText}>{xStatus.lastSyncError}</Text> : null}
            </>
          ) : (
            <Text style={[styles.xHelpText, dark && styles.xHelpTextDark]}>Import new X bookmarks into private Nomi memories when you sync.</Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, dark && styles.actionButtonDark]}
              onPress={() => (xConnected ? syncXMutation.mutate() : connectXMutation.mutate())}
              disabled={xBusy || !serverOnline}
            >
              {connectXMutation.isLoading || syncXMutation.isLoading ? (
                <ActivityIndicator color={Colors.teal} />
              ) : (
                <Text style={styles.actionButtonText}>{xConnected ? 'Sync now' : 'Connect X'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, dark && styles.actionButtonDark]} onPress={() => xStatusQuery.refetch()} disabled={xBusy || !serverOnline}>
              {xStatusQuery.isFetching ? <ActivityIndicator color={Colors.teal} /> : <Text style={styles.actionButtonText}>Refresh</Text>}
            </TouchableOpacity>
            {xConnected && (
              <TouchableOpacity
                style={[styles.actionButton, dark && styles.actionButtonDark]}
                onPress={() => {
                  Alert.alert('Disconnect X?', 'Nomi will stop importing new X bookmarks.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Disconnect', style: 'destructive', onPress: () => disconnectXMutation.mutate() },
                  ]);
                }}
                disabled={xBusy}
              >
                {disconnectXMutation.isLoading ? <ActivityIndicator color={Colors.red} /> : <Text style={[styles.actionButtonText, styles.dangerText]}>Disconnect</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionButton, dark && styles.actionButtonDark]} onPress={() => setInterestsOpen(true)}>
              <Text style={styles.actionButtonText}>Feed interests</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Export */}
        <SectionHeader title="Export" />
        <View style={[styles.section, dark && styles.sectionDark]}>
          <SettingsRow
            label="Obsidian Markdown"
            onPress={() => exportMutation.mutate()}
            disabled={!serverOnline || exportMutation.isLoading}
            right={exportMutation.isLoading ? <ActivityIndicator color={Colors.teal} /> : undefined}
          />
          {!serverOnline && (
            <Text style={[styles.xHelpText, dark && styles.xHelpTextDark]}>You're offline. Reconnect to export your memories.</Text>
          )}
        </View>

        <Text style={styles.versionText}>Nomi v1.0.0</Text>
      </ScrollView>

      <Modal animationType="slide" transparent visible={moreOpen} onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setMoreOpen(false)} />
          <View style={[styles.sheet, dark && styles.sheetDark, { paddingBottom: insets.bottom + 18 }]}>
            <View style={[styles.sheetHandle, dark && styles.sheetHandleDark]} />
            <Text style={[styles.sheetTitle, dark && styles.sheetTitleDark]}>More</Text>
            <SectionHeader title="Nomi Pro" />
            <View style={[styles.section, dark && styles.sectionDark]}>
              <SettingsRow label="Plan" value={tierLabel} onPress={handleUpgrade} />
              <SettingsRow label="Manage Subscription" onPress={() => openManagedUrl(subscriptionManagementUrl())} />
              <SettingsRow
                label="Restore Purchases"
                onPress={() => restorePurchasesMutation.mutate()}
                right={restorePurchasesMutation.isLoading ? <ActivityIndicator color={Colors.teal} /> : undefined}
              />
              <Text style={[styles.policyHelpText, dark && styles.policyHelpTextDark]}>
                {Platform.OS === 'android'
                  ? 'Google Play handles Nomi Pro billing, renewal, cancellation, and refunds. Deleting your Nomi account does not cancel a Google Play subscription.'
                  : 'Apple handles Nomi Pro billing, renewal, cancellation, and refunds. Deleting your Nomi account does not cancel an Apple subscription.'}
              </Text>
              {user?.tier === 'free' && (
                <TouchableOpacity style={[styles.supportCard, dark && styles.supportCardDark]} onPress={handleUpgrade}>
                  <Text style={styles.supportTitle}>Support API testing</Text>
                  <Text style={[styles.supportDesc, dark && styles.supportDescDark]}>Test subscriptions while helping cover X discovery and AI recall costs.</Text>
                  <View style={styles.supportBtn}>
                    <Text style={styles.supportBtnText}>View plans</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
            <SectionHeader title="Legal" />
            <View style={[styles.section, dark && styles.sectionDark]}>
              <SettingsRow label="Privacy Policy" onPress={() => openManagedUrl(publicBackendUrl('privacy'))} />
              <SettingsRow label="Terms of Use" onPress={() => openManagedUrl(publicBackendUrl('terms'))} />
              <SettingsRow label="Contact Support" onPress={() => openManagedUrl(supportUrl())} />
            </View>
            <SectionHeader title="Account" />
            <View style={[styles.section, dark && styles.sectionDark]}>
              <SettingsRow
                label="Delete account"
                onPress={handleDeleteAccount}
                danger
                right={deleteAccountMutation.isLoading ? <ActivityIndicator color={Colors.red} /> : undefined}
              />
            </View>
            {__DEV__ && (
              <>
                <SectionHeader title="Developer Debug" />
                <View style={[styles.section, dark && styles.sectionDark]}>
                  <SettingsRow label="Connection" value={serverOnline ? 'online' : 'offline'} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={profileOpen} onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setProfileOpen(false)} />
          <View style={[styles.sheet, dark && styles.sheetDark, { paddingBottom: insets.bottom + 18 }]}>
            <View style={[styles.sheetHandle, dark && styles.sheetHandleDark]} />
            <Text style={[styles.sheetTitle, dark && styles.sheetTitleDark]}>Edit profile</Text>
            <TouchableOpacity style={styles.photoPicker} onPress={chooseProfilePhoto}>
              {photoDraft ? (
                <Image source={{ uri: photoDraft }} style={styles.photoPickerImage} />
              ) : (
                <View style={[styles.photoPickerEmpty, dark && styles.avatarCircleDark]}>
                  <Text style={styles.avatarText}>{(displayNameDraft || displayName).charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.inlineAction}>Edit photo</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.usernameInput, dark && styles.usernameInputDark]}
              value={displayNameDraft}
              onChangeText={setDisplayNameDraft}
              placeholder="Display name"
              placeholderTextColor={dark ? '#80768B' : Colors.textTertiary}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.usernameInput, dark && styles.usernameInputDark]}
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              placeholder="username"
              placeholderTextColor={dark ? '#80768B' : Colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={updateProfileMutation.isLoading}>
              {updateProfileMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={interestsOpen} onRequestClose={() => setInterestsOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setInterestsOpen(false)} />
          <View style={[styles.sheet, dark && styles.sheetDark, { paddingBottom: insets.bottom + 18 }]}>
            <View style={[styles.sheetHandle, dark && styles.sheetHandleDark]} />
            <Text style={[styles.sheetTitle, dark && styles.sheetTitleDark]}>Feed interests</Text>
            <View style={[styles.section, dark && styles.sectionDark, styles.sheetSection]}>
              {interestRows}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function normalizeUsername(value: string) {
  return value.trim().replace(/@/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  rootDark: { backgroundColor: '#05020A' },
  header: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.semibold, color: Colors.textPrimary },
  headerTitleDark: { color: '#FFFFFF' },
  headerSubtitle: { marginTop: 3, fontSize: Typography.sm, color: Colors.textSecondary },
  headerSubtitleDark: { color: '#AFA8B8' },
  moreButton: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 0.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonDark: {
    backgroundColor: '#171820',
    borderColor: '#342D39',
  },
  moreButtonText: { color: Colors.textPrimary, fontSize: 18, fontWeight: Typography.semibold },
  moreButtonTextDark: { color: '#FFFFFF' },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 100 },

  sectionHeader: {
    fontSize: Typography.xs, textTransform: 'uppercase', letterSpacing: 0.1,
    color: Colors.textTertiary, marginTop: Spacing.xl, marginBottom: Spacing.sm,
    fontFamily: 'Courier New',
  },
  sectionHeaderDark: {
    color: '#AFA8B8',
  },
  section: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden',
  },
  sectionDark: {
    backgroundColor: '#171820',
    borderColor: '#342D39',
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  profileBlockDark: {
    borderBottomColor: '#342D39',
  },
  avatarWrap: {
    width: 64,
    height: 64,
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleDark: {
    backgroundColor: '#2B2430',
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.tealDim,
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.teal,
    borderWidth: 2,
    borderColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeDark: {
    borderColor: '#171820',
  },
  avatarBadgeText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: Typography.bold,
  },
  avatarText: { color: Colors.teal, fontSize: 22, fontWeight: Typography.bold },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  profileNameDark: { color: '#FFFFFF' },
  profileHandle: { marginTop: 3, fontSize: Typography.sm, color: Colors.textSecondary },
  profileHandleDark: { color: '#BDB3C8' },
  inlineAction: { marginTop: 5, fontSize: Typography.xs, color: Colors.teal, fontWeight: Typography.semibold },
  profileStats: {
    width: 86,
    gap: 5,
    alignItems: 'stretch',
  },
  inlineStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  inlineStatLabel: {
    flex: 1,
    color: Colors.textTertiary,
    fontSize: 10,
  },
  inlineStatLabelDark: {
    color: '#BDB3C8',
  },
  inlineStatValue: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    minWidth: 18,
    textAlign: 'right',
  },
  inlineStatValueDark: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    minHeight: 50,
  },
  rowDark: {
    borderBottomColor: '#342D39',
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  rowLabelDark: { color: '#F5EFFB' },
  rowLabelDanger: { color: Colors.red },
  rowValue: { fontSize: Typography.sm, color: Colors.textSecondary },
  rowValueDark: { color: '#BDB3C8' },
  rowArrow: { fontSize: 18, color: Colors.textTertiary, marginLeft: Spacing.sm },
  rowArrowDark: { color: '#80768B' },

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
  supportCardDark: {
    backgroundColor: 'rgba(255,45,142,0.12)',
    borderColor: '#FF2D8E',
  },
  supportTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.teal, marginBottom: 4 },
  supportDesc: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  supportDescDark: { color: '#D6CFDD' },
  supportBtn: {
    alignSelf: 'flex-start', paddingHorizontal: Spacing.lg,
    paddingVertical: 8, borderRadius: Radius.md,
    backgroundColor: Colors.teal,
  },
  supportBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textInverse },
  policyHelpText: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    lineHeight: 18,
  },
  policyHelpTextDark: {
    color: '#D6CFDD',
  },

  signOutButton: {
    margin: Spacing.md,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonText: {
    color: Colors.teal,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  xHelpText: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    lineHeight: 20,
  },
  xHelpTextDark: {
    color: '#BDB3C8',
  },
  xErrorText: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    color: Colors.red,
    fontSize: Typography.xs,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  actionButton: {
    minHeight: 42,
    flexGrow: 1,
    flexBasis: 96,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  actionButtonDark: {
    borderColor: '#342D39',
    backgroundColor: '#20212C',
  },
  actionButtonText: {
    color: Colors.teal,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  dangerText: { color: Colors.red },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,28,34,0.28)' },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  sheetDark: {
    backgroundColor: '#0D0E16',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  sheetHandleDark: {
    backgroundColor: '#342D39',
  },
  sheetTitle: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sheetTitleDark: { color: '#FFFFFF' },
  sheetSection: { marginTop: Spacing.md },
  photoPicker: {
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  photoPickerImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.tealDim,
  },
  photoPickerEmpty: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usernameInput: {
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
  },
  usernameInputDark: {
    borderColor: '#342D39',
    backgroundColor: '#171820',
    color: '#FFFFFF',
  },
  primaryButton: {
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  primaryButtonText: { color: Colors.textInverse, fontSize: Typography.sm, fontWeight: Typography.semibold },

  versionText: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xxxl },
});
