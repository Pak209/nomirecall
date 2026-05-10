import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { IngestAPI } from '../services/api';
import { useStore } from '../store/useStore';

type Tab = 'text' | 'url' | 'tweet' | 'file';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'text', label: 'Note', icon: '≡' },
  { id: 'url', label: 'URL', icon: '⊕' },
  { id: 'tweet', label: 'Tweet', icon: '✕' },
  { id: 'file', label: 'File', icon: '◫' },
];

export default function IngestScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { serverOnline } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const [done, setDone] = useState(false);

  // Fields
  const [rawText, setRawText] = useState('');
  const [url, setUrl] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [tweetText, setTweetText] = useState('');
  const [title, setTitle] = useState('');
  const [pickedFile, setPickedFile] = useState<{ name: string; uri: string; size?: number } | null>(null);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  function flashDone() {
    setDone(true);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.05, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setDone(false), 2000);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/markdown', 'text/html', 'application/json', 'text/csv'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPickedFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0 });
  }

  function reset() {
    setRawText(''); setUrl(''); setTweetUrl(''); setTweetText(''); setTitle(''); setPickedFile(null);
  }

  const ingestMutation = useMutation({
    mutationFn: (payload: Parameters<typeof IngestAPI.ingest>[0]) => IngestAPI.ingest(payload),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flashDone();
      reset();
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-memory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-categories'] });
      queryClient.invalidateQueries({ queryKey: ['brain-overview'] });
    },
    onError: (e: any) => {
      Alert.alert('Ingest failed', e?.message || 'Unknown error');
    },
  });

  async function handleIngest() {
    if (!serverOnline) {
      Alert.alert('Server offline', 'Start your Second Brain server first.');
      return;
    }
    try {
      if (activeTab === 'text') {
        if (!rawText.trim()) { Alert.alert('Empty', 'Enter some text.'); return; }
        await ingestMutation.mutateAsync({ raw_text: rawText, title: title || undefined, type: 'text' });
      } else if (activeTab === 'url') {
        if (!url.trim()) { Alert.alert('Empty', 'Enter a URL.'); return; }
        await ingestMutation.mutateAsync({ url, title: title || undefined, type: 'url' });
      } else if (activeTab === 'tweet') {
        const text = tweetText.trim();
        const link = tweetUrl.trim();
        if (!text && !link) { Alert.alert('Empty', 'Enter a tweet URL or paste tweet text.'); return; }
        await ingestMutation.mutateAsync(
          link
            ? { url: link, type: 'tweet', title: title || 'Tweet' }
            : { raw_text: text, type: 'tweet', title: title || 'Tweet' },
        );
      } else if (activeTab === 'file') {
        if (!pickedFile) { Alert.alert('No file', 'Pick a file first.'); return; }
        const content = await FileSystem.readAsStringAsync(pickedFile.uri);
        await ingestMutation.mutateAsync({ raw_text: content, title: title || pickedFile.name, type: 'text' });
      }
    } catch {}
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>+ Ingest</Text>
        {!serverOnline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>server offline</Text>
          </View>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === t.id && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Text tab */}
        {activeTab === 'text' && (
          <>
            <Text style={styles.fieldLabel}>Content</Text>
            <TextInput
              style={[styles.textarea, { minHeight: 180 }]}
              multiline
              placeholder="Paste notes, article excerpts, research findings..."
              placeholderTextColor={Colors.textTertiary}
              value={rawText}
              onChangeText={setRawText}
              textAlignVertical="top"
            />
          </>
        )}

        {/* URL tab */}
        {activeTab === 'url' && (
          <>
            <Text style={styles.fieldLabel}>Page URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com/article"
              placeholderTextColor={Colors.textTertiary}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
            <Text style={styles.hint}>The server will fetch and extract the page content automatically.</Text>
          </>
        )}

        {/* Tweet tab */}
        {activeTab === 'tweet' && (
          <>
            <Text style={styles.fieldLabel}>Tweet URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://x.com/user/status/..."
              placeholderTextColor={Colors.textTertiary}
              value={tweetUrl}
              onChangeText={setTweetUrl}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
            <View style={styles.orRow}>
              <View style={styles.orLine} /><Text style={styles.orText}>or paste tweet text</Text><View style={styles.orLine} />
            </View>
            <Text style={styles.fieldLabel}>Tweet text</Text>
            <TextInput
              style={[styles.textarea, { minHeight: 120 }]}
              multiline
              placeholder="Paste the tweet content here..."
              placeholderTextColor={Colors.textTertiary}
              value={tweetText}
              onChangeText={setTweetText}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{(tweetText).length} chars</Text>
          </>
        )}

        {/* File tab */}
        {activeTab === 'file' && (
          <>
            <TouchableOpacity style={styles.dropZone} onPress={pickFile} activeOpacity={0.75}>
              <Text style={styles.dropIcon}>◫</Text>
              <Text style={styles.dropTitle}>
                {pickedFile ? pickedFile.name : 'Tap to pick a file'}
              </Text>
              <Text style={styles.dropSub}>
                {pickedFile
                  ? `${((pickedFile.size ?? 0) / 1024).toFixed(1)} KB`
                  : '.txt · .md · .html · .json · .csv'}
              </Text>
            </TouchableOpacity>
            {pickedFile && (
              <TouchableOpacity onPress={() => setPickedFile(null)} style={styles.clearFile}>
                <Text style={styles.clearFileText}>✕ Remove</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Title (all tabs) */}
        <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Auto-extracted if blank"
          placeholderTextColor={Colors.textTertiary}
          value={title}
          onChangeText={setTitle}
        />
      </ScrollView>

      {/* Submit button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Animated.View style={[{ flex: 1 }, { transform: [{ scale: scaleAnim }] }]}>
          <TouchableOpacity
            style={[styles.submitBtn, done && styles.submitBtnDone, ingestMutation.isLoading && { opacity: 0.7 }]}
            onPress={handleIngest}
            disabled={ingestMutation.isLoading || done}
          >
            {ingestMutation.isLoading ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.submitBtnText}>
                {done ? '✓ Ingested' : 'Ingest + Process'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  offlineBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.sm, backgroundColor: Colors.redBg,
    borderWidth: 0.5, borderColor: Colors.red,
  },
  offlineBadgeText: { fontSize: Typography.xs, color: Colors.red },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border,
    backgroundColor: Colors.bgCard, gap: 3,
  },
  tabBtnActive: { borderColor: Colors.teal, backgroundColor: Colors.tealDim },
  tabIcon: { fontSize: 16, color: Colors.textTertiary },
  tabLabel: { fontSize: 11, color: Colors.textTertiary },
  tabLabelActive: { color: Colors.teal, fontWeight: Typography.medium },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl },

  fieldLabel: {
    fontSize: Typography.xs, textTransform: 'uppercase',
    letterSpacing: 0.08, color: Colors.textTertiary,
    marginBottom: Spacing.sm, fontFamily: 'Courier New',
  },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg, height: 48,
    fontSize: Typography.sm, color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  textarea: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: Spacing.md, fontSize: Typography.sm,
    color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  hint: { fontSize: Typography.xs, color: Colors.textTertiary, marginBottom: Spacing.md },
  charCount: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'right', marginBottom: Spacing.md },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  orLine: { flex: 1, height: 0.5, backgroundColor: Colors.border },
  orText: { fontSize: Typography.xs, color: Colors.textTertiary },

  dropZone: {
    borderWidth: 0.5, borderStyle: 'dashed', borderColor: Colors.borderLight,
    borderRadius: Radius.lg, padding: Spacing.xxxl,
    alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgCard, marginBottom: Spacing.sm,
  },
  dropIcon: { fontSize: 32, color: Colors.textTertiary },
  dropTitle: { fontSize: Typography.md, fontWeight: Typography.medium, color: Colors.textPrimary },
  dropSub: { fontSize: Typography.xs, color: Colors.textTertiary },
  clearFile: { alignSelf: 'center', marginBottom: Spacing.md },
  clearFileText: { fontSize: Typography.sm, color: Colors.red },

  footer: {
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  submitBtn: {
    height: 52, borderRadius: Radius.md,
    backgroundColor: Colors.teal,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDone: { backgroundColor: Colors.tealMuted },
  submitBtnText: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textInverse },
});
