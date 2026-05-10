import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IngestAPI, XPostAPI } from '../../../services/api';
import { MainTabParamList, MemoryLink, MemoryMedia } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type CaptureMode = 'note' | 'link' | 'image' | 'voice';
type CaptureRoute = RouteProp<MainTabParamList, 'Capture'>;

const CAPTURE_MODES: { id: CaptureMode; label: string; icon: string }[] = [
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'link', label: 'Link', icon: '🔗' },
  { id: 'image', label: 'Image', icon: '🖼️' },
  { id: 'voice', label: 'Voice', icon: '🎙️' },
];

function fallbackTitle(text: string, mode: CaptureMode): string {
  const trimmed = text.trim();
  if (!trimmed) {
    if (mode === 'link') return 'Saved link';
    if (mode === 'image') return 'Image memory';
    if (mode === 'voice') return 'Voice memory';
    return 'Quick memory';
  }
  return trimmed.split(/\s+/).slice(0, 7).join(' ');
}

function parseXUsername(url: string): string {
  const match = url.trim().match(/(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/\d+/i);
  return match?.[1] && !['i', 'intent', 'share'].includes(match[1].toLowerCase()) ? match[1] : '';
}

function normalizeXUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(x|twitter)\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isXPostUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/[^/?#]+\/status\/\d+/i.test(url.trim());
}

export default function CaptureScreen() {
  const route = useRoute<CaptureRoute>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [mode, setMode] = useState<CaptureMode>(route.params?.mode ?? 'note');
  const [draft, setDraft] = useState('');
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [xPostText, setXPostText] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [xPostDate, setXPostDate] = useState('');
  const [xLinks, setXLinks] = useState<MemoryLink[]>([]);
  const [xMedia, setXMedia] = useState<MemoryMedia[]>([]);
  const [pickedImage, setPickedImage] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
  }, [route.params?.mode]);

  useEffect(() => {
    if (mode !== 'link' || !isXPostUrl(link)) return;
    const parsed = parseXUsername(link);
    if (parsed && !xUsername) setXUsername(parsed);
  }, [link, mode, xUsername]);

  const isXPost = mode === 'link' && isXPostUrl(link);

  const captureText = useMemo(() => {
    if (mode === 'link') return isXPost ? xPostText || link : link;
    if (mode === 'image') return pickedImage ? `Image capture: ${pickedImage.name}\nLocal URI: ${pickedImage.uri}` : '';
    return draft;
  }, [draft, isXPost, link, mode, pickedImage, xPostText]);

  const canSave = useMemo(() => captureText.trim().length > 0, [captureText]);

  async function pickImage() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    setPickedImage(result.assets[0]);
  }

  function resetCurrentMode() {
    setDraft('');
    setLink('');
    setTitle('');
    setCategory('General');
    setXPostText('');
    setXUsername('');
    setXPostDate('');
    setXLinks([]);
    setXMedia([]);
    setPickedImage(null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      IngestAPI.ingest({
        raw_text: mode === 'link' && !isXPost ? undefined : captureText,
        url: mode === 'link' ? link.trim() : undefined,
        title: title.trim() || (isXPost && xUsername ? `@${xUsername} on X` : fallbackTitle(captureText, mode)),
        type: isXPost ? 'tweet' : (mode === 'link' ? 'url' : mode),
        category: category.trim() || 'General',
        tags: isXPost ? ['xpost', category.trim() || 'General'] : undefined,
        authorUsername: isXPost ? xUsername.trim().replace(/^@/, '') || parseXUsername(link) : undefined,
        postDate: isXPost ? xPostDate.trim() || undefined : undefined,
        links: isXPost ? xLinks : undefined,
        media: isXPost ? xMedia : undefined,
      }),
    onSuccess: () => {
      resetCurrentMode();
      showToast('Memory saved to your account', 'success');
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-memory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-categories'] });
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
    onError: (e: any) => {
      showToast(e?.message || 'Save failed. Draft kept in editor.', 'error');
    },
  });

  const fetchXPostMutation = useMutation({
    mutationFn: () => XPostAPI.preview(normalizeXUrl(link)),
    onSuccess: (res) => {
      const post = res.post;
      setLink(post.url || normalizeXUrl(link));
      setXUsername(post.username || xUsername);
      setTitle((current) => current || post.title || (post.username ? `@${post.username} on X` : 'X post'));
      if (post.text) setXPostText(post.text);
      if (post.postDate) setXPostDate(new Date(post.postDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }));
      if (post.category) setCategory(post.category);
      setXLinks(post.links || []);
      setXMedia(post.media || []);
      showToast(res.needsApiKey ? (res.message || 'X API key needed for automatic content.') : 'Post content imported', res.needsApiKey ? 'warning' : 'success');
    },
    onError: (e: any) => showToast(e?.message || 'Could not fetch this X post', 'error'),
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Quick capture</Text>
        <Text style={styles.subtitle}>Save notes, links, images, and voice thoughts to your Nomi memory.</Text>

        <View style={styles.modeRow}>
          {CAPTURE_MODES.map((item) => {
            const active = mode === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.modeButton, active && styles.modeButtonActive]}
                onPress={() => setMode(item.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.modeIcon}>{item.icon}</Text>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor="#A09187"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <TextInput
          style={styles.input}
          placeholder="General"
          placeholderTextColor="#A09187"
          value={category}
          onChangeText={setCategory}
        />

        {mode === 'note' ? (
          <>
            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Write your memory..."
              placeholderTextColor="#A09187"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
            />
          </>
        ) : null}

        {mode === 'link' ? (
          <>
            <Text style={styles.fieldLabel}>Link</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste a link or X post URL"
              placeholderTextColor="#A09187"
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {isXPost ? (
              <View style={styles.xCard}>
                <Text style={styles.xHeader}>X post import</Text>
                <Text style={styles.xHint}>Fetch post content automatically with an X API key, or paste the text manually.</Text>
                <TouchableOpacity
                  style={[styles.fetchButton, fetchXPostMutation.isLoading && styles.buttonDisabled]}
                  onPress={() => fetchXPostMutation.mutate()}
                  disabled={fetchXPostMutation.isLoading}
                  activeOpacity={0.9}
                >
                  {fetchXPostMutation.isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.fetchButtonText}>Fetch post</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="@username"
                  placeholderTextColor="#A09187"
                  value={xUsername}
                  onChangeText={setXUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldLabel}>Post content</Text>
                <TextInput
                  style={[styles.textarea, styles.xTextarea]}
                  placeholder="Paste the post text..."
                  placeholderTextColor="#A09187"
                  value={xPostText}
                  onChangeText={setXPostText}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.fieldLabel}>Post date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="May 7, 2026"
                  placeholderTextColor="#A09187"
                  value={xPostDate}
                  onChangeText={setXPostDate}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {mode === 'image' ? (
          <>
            <Text style={styles.fieldLabel}>Image</Text>
            <TouchableOpacity style={styles.picker} onPress={pickImage} activeOpacity={0.85}>
              <Text style={styles.pickerIcon}>🖼️</Text>
              <Text style={styles.pickerTitle}>{pickedImage?.name || 'Choose an image'}</Text>
              <Text style={styles.pickerSub}>
                {pickedImage ? 'Ready to save with this memory' : 'Select from Photos or Files'}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {mode === 'voice' ? (
          <>
            <Text style={styles.fieldLabel}>Voice thought</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Record-to-text is next; add the voice thought transcript here for now..."
              placeholderTextColor="#A09187"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
            />
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.button, (!canSave || saveMutation.isLoading) && styles.buttonDisabled]}
          onPress={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isLoading}
          activeOpacity={0.9}
        >
          {saveMutation.isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save memory</Text>
          )}
        </TouchableOpacity>

        {!canSave ? <Text style={styles.emptyHint}>Add content to enable save.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2' },
  content: { padding: 20, paddingBottom: 130 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22' },
  subtitle: { marginTop: 4, color: '#655C57', lineHeight: 20 },
  modeRow: {
    marginTop: 18,
    marginBottom: 18,
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modeButtonActive: {
    borderColor: '#FF2D8E',
    backgroundColor: '#FFF0F7',
  },
  modeIcon: { fontSize: 22 },
  modeLabel: { color: '#655C57', fontWeight: '700', fontSize: 12 },
  modeLabelActive: { color: '#FF2D8E' },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 8,
    color: '#8A817B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    color: '#1C1C22',
  },
  textarea: {
    minHeight: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    padding: 14,
    textAlignVertical: 'top',
    color: '#1C1C22',
  },
  picker: {
    minHeight: 170,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  pickerIcon: { fontSize: 34, marginBottom: 8 },
  pickerTitle: { color: '#1C1C22', fontWeight: '800', textAlign: 'center' },
  pickerSub: { marginTop: 4, color: '#8A817B', textAlign: 'center', fontSize: 12 },
  xCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    padding: 12,
  },
  xHeader: { color: '#1C1C22', fontWeight: '800', fontSize: 15 },
  xHint: { marginTop: 4, marginBottom: 6, color: '#776B64', lineHeight: 18, fontSize: 12 },
  xTextarea: { minHeight: 130 },
  fetchButton: {
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1C1C22',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  fetchButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  button: {
    marginTop: 18,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2D8E',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyHint: { marginTop: 10, color: '#A09187', fontSize: 12, textAlign: 'center' },
});
