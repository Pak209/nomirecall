import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IngestAPI, TikTokAPI, TikTokPreview, XPostAPI } from '../../../services/api';
import { MainTabParamList, MemoryLink, MemoryMedia } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type CaptureMode = 'note' | 'link' | 'image' | 'voice';
type CaptureRoute = RouteProp<MainTabParamList, 'Capture'>;

const CAPTURE_MODES: { id: CaptureMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'note', label: 'Note', icon: 'reader' },
  { id: 'link', label: 'Link', icon: 'link' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'voice', label: 'Voice', icon: 'mic' },
];

const CATEGORIES = ['General', 'Work', 'Personal', 'AI & Tech', 'Finance', 'Health', 'Ideas'];

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

function normalizeTikTokUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?(tiktok|vm\.tiktok|vt\.tiktok)\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isTikTokUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:tiktok|vm\.tiktok|vt\.tiktok)\.com\//i.test(url.trim());
}

function parseTags(value: string): string[] {
  return Array.from(new Set(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )).slice(0, 12);
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
  const [tagText, setTagText] = useState('');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [xPostText, setXPostText] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [xPostDate, setXPostDate] = useState('');
  const [xLinks, setXLinks] = useState<MemoryLink[]>([]);
  const [xMedia, setXMedia] = useState<MemoryMedia[]>([]);
  const [tiktokPreview, setTikTokPreview] = useState<TikTokPreview | null>(null);
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
  const isTikTok = mode === 'link' && isTikTokUrl(link);
  const tags = useMemo(() => parseTags(tagText), [tagText]);

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
    setTagText('');
    setCategoryMenuOpen(false);
    setXPostText('');
    setXUsername('');
    setXPostDate('');
    setXLinks([]);
    setXMedia([]);
    setTikTokPreview(null);
    setPickedImage(null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      IngestAPI.ingest({
        raw_text: mode === 'link' && !isXPost ? undefined : captureText,
        url: mode === 'link' ? link.trim() : undefined,
        title: title.trim()
          || (isTikTok ? (tiktokPreview?.title || 'TikTok video') : undefined)
          || (isXPost && xUsername ? `@${xUsername} on X` : fallbackTitle(captureText, mode)),
        type: isTikTok ? 'tiktok_video' : (isXPost ? 'tweet' : (mode === 'link' ? 'url' : mode)),
        category: category.trim() || 'General',
        tags: isTikTok ? (tiktokPreview?.tags || ['tiktok', 'video', ...tags]) : (isXPost ? ['xpost', ...tags] : tags.length ? tags : undefined),
        authorUsername: isXPost ? xUsername.trim().replace(/^@/, '') || parseXUsername(link) : undefined,
        postDate: isXPost ? xPostDate.trim() || undefined : undefined,
        links: isXPost ? xLinks : undefined,
        media: isXPost ? xMedia : undefined,
        processWithAI: true,
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
      if (post.tags?.length) setTagText(post.tags.join(', '));
      setXLinks(post.links || []);
      setXMedia(post.media || []);
      showToast(res.needsApiKey ? (res.message || 'X API key needed for automatic content.') : 'Post content imported', res.needsApiKey ? 'warning' : 'success');
    },
    onError: (e: any) => showToast(e?.message || 'Could not fetch this X post', 'error'),
  });

  const fetchTikTokMutation = useMutation({
    mutationFn: () => TikTokAPI.preview(normalizeTikTokUrl(link)),
    onSuccess: (res) => {
      const preview = res.tiktok;
      setTikTokPreview(preview);
      const previewUrl = preview.canonicalUrl || preview.originalUrl || normalizeTikTokUrl(link);
      setLink((current) => (current === previewUrl ? current : previewUrl));
      setTitle((current) => current || preview.title || 'TikTok video');
      if (preview.category) setCategory(preview.category);
      if (preview.tags?.length) setTagText(preview.tags.join(', '));
      showToast('TikTok preview loaded', 'success');
    },
    onError: (e: any) => {
      setTikTokPreview(null);
      showToast(e?.message || 'Could not preview this TikTok', 'error');
    },
  });

  useEffect(() => {
    if (mode !== 'link' || !isTikTokUrl(link)) {
      setTikTokPreview(null);
      return;
    }
    const normalized = normalizeTikTokUrl(link);
    if (tiktokPreview?.canonicalUrl === normalized || tiktokPreview?.originalUrl === normalized) return;
    const handle = setTimeout(() => {
      if (!fetchTikTokMutation.isLoading) fetchTikTokMutation.mutate();
    }, 650);
    return () => clearTimeout(handle);
  }, [link, mode, tiktokPreview?.canonicalUrl, tiktokPreview?.originalUrl, fetchTikTokMutation.isLoading]);

  const saveButton = (
    <TouchableOpacity
      style={[styles.button, (!canSave || saveMutation.isLoading) && styles.buttonDisabled]}
      onPress={() => saveMutation.mutate()}
      disabled={!canSave || saveMutation.isLoading}
      activeOpacity={0.9}
    >
      <LinearGradient
        colors={['#FFB172', '#FF2D8E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.buttonGradient}
      >
        {saveMutation.isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save memory</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.navTitle}>Quick Capture</Text>

        <View style={styles.header}>
          <Text style={styles.title}>Save anything</Text>
          <Text style={styles.subtitle}>Capture notes, links, images, and voice thoughts to your Nomi memory.</Text>
        </View>

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
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={active ? '#FF2D72' : '#111116'}
                />
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Optional title"
          placeholderTextColor="#B9B4B7"
          value={title}
          onChangeText={setTitle}
        />

        {mode === 'note' ? (
          <View style={styles.textareaWrap}>
            <TextInput
              style={styles.textarea}
              placeholder="Write a thought, quote, or idea..."
              placeholderTextColor="#B9B4B7"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
            />
          </View>
        ) : null}

        {mode === 'link' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              placeholderTextColor="#B9B4B7"
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {isTikTok ? (
              <View style={styles.xCard}>
                <Text style={styles.xHeader}>TikTok video</Text>
                {tiktokPreview?.thumbnail_url ? (
                  <Image source={{ uri: tiktokPreview.thumbnail_url }} style={styles.tiktokThumb} resizeMode="cover" />
                ) : null}
                {tiktokPreview ? (
                  <View style={styles.importedCard}>
                    <Text style={styles.importedTitle} numberOfLines={3}>{tiktokPreview.title || 'TikTok video'}</Text>
                    <Text style={styles.importedMeta}>{tiktokPreview.author_name || 'TikTok creator'}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.fetchButton, fetchTikTokMutation.isLoading && styles.buttonDisabled]}
                  onPress={() => fetchTikTokMutation.mutate()}
                  disabled={fetchTikTokMutation.isLoading}
                  activeOpacity={0.9}
                >
                  {fetchTikTokMutation.isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.fetchButtonText}>{tiktokPreview ? 'Refresh preview' : 'Load preview'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : isXPost ? (
              <View style={styles.xCard}>
                <Text style={styles.xHeader}>X post import</Text>
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
                {xLinks.length || xMedia.length ? (
                  <View style={styles.importedCard}>
                    <Text style={styles.importedTitle}>Imported extras</Text>
                    <View style={styles.importedRow}>
                      {xMedia.length ? <Text style={styles.importedMeta}>{xMedia.length} media</Text> : null}
                      {xLinks.length ? <Text style={styles.importedMeta}>{xLinks.length} links</Text> : null}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {saveButton}

            {isXPost ? (
              <View style={styles.xCard}>
                <TextInput
                  style={styles.input}
                  placeholder="@username"
                  placeholderTextColor="#B9B4B7"
                  value={xUsername}
                  onChangeText={setXUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.textareaWrap}>
                  <TextInput
                    style={[styles.textarea, styles.xTextarea]}
                    placeholder="Paste the post text..."
                    placeholderTextColor="#B9B4B7"
                    value={xPostText}
                    onChangeText={setXPostText}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
                <TextInput
                  style={[styles.input, styles.xDateInput]}
                  placeholder="May 7, 2026"
                  placeholderTextColor="#B9B4B7"
                  value={xPostDate}
                  onChangeText={setXPostDate}
                />
              </View>
            ) : null}
            {!isXPost ? (
              <View style={styles.textareaWrap}>
                <TextInput
                  style={styles.textarea}
                  placeholder="Add notes about this link..."
                  placeholderTextColor="#B9B4B7"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : null}
          </>
        ) : null}

        {mode === 'image' ? (
          <View style={styles.textareaWrap}>
            <TouchableOpacity style={styles.picker} onPress={pickImage} activeOpacity={0.85}>
              <Ionicons name="image" size={30} color="#FF2D72" />
              <Text style={styles.pickerTitle}>{pickedImage?.name || 'Choose an image'}</Text>
              <Text style={styles.pickerSub}>
                {pickedImage ? 'Ready to save with this memory' : 'Select from Photos or Files'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mode === 'voice' ? (
          <View style={styles.textareaWrap}>
            <TextInput
              style={styles.textarea}
              placeholder="Record-to-text is next; add the voice thought transcript here for now..."
              placeholderTextColor="#B9B4B7"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
            />
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Tags, separated by commas"
          placeholderTextColor="#C8C3C6"
          value={tagText}
          onChangeText={setTagText}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.categoryLabel}>Category</Text>
        <TouchableOpacity
          style={styles.categoryPicker}
          onPress={() => setCategoryMenuOpen((open) => !open)}
          activeOpacity={0.86}
        >
          <Text style={styles.categoryValue}>{category}</Text>
          <Ionicons
            name={categoryMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#FF2D72"
          />
        </TouchableOpacity>
        {categoryMenuOpen ? (
          <View style={styles.categoryMenu}>
            {CATEGORIES.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.categoryOption, item === category && styles.categoryOptionActive]}
                onPress={() => {
                  setCategory(item);
                  setCategoryMenuOpen(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.categoryOptionText, item === category && styles.categoryOptionTextActive]}>
                  {item}
                </Text>
                {item === category ? <Ionicons name="checkmark" size={18} color="#FF2D72" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mode !== 'link' ? saveButton : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2' },
  content: { paddingHorizontal: 18, paddingBottom: 132 },
  navTitle: {
    color: '#111116',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 32,
    textAlign: 'center',
  },
  header: { marginBottom: 24 },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#111116',
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 8,
    color: '#8E878C',
    fontSize: 16,
    lineHeight: 23,
  },
  modeRow: {
    marginBottom: 24,
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    height: 74,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#EEE8EA',
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  modeButtonActive: {
    borderColor: '#FF2D72',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  modeLabel: { color: '#111116', fontWeight: '800', fontSize: 12 },
  modeLabelActive: { color: '#FF2D72' },
  categoryLabel: {
    color: '#111116',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 10,
  },
  input: {
    minHeight: 78,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEE8EA',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 18,
    color: '#1C1C22',
    fontSize: 17,
    marginBottom: 14,
  },
  textareaWrap: {
    marginBottom: 14,
  },
  textarea: {
    minHeight: 216,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEE8EA',
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 18,
    textAlignVertical: 'top',
    color: '#1C1C22',
    fontSize: 17,
    lineHeight: 24,
  },
  picker: {
    minHeight: 216,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEE8EA',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  pickerTitle: { marginTop: 10, color: '#1C1C22', fontWeight: '800', textAlign: 'center', fontSize: 16 },
  pickerSub: { marginTop: 4, color: '#8E878C', textAlign: 'center', fontSize: 13 },
  xCard: {
    marginBottom: 14,
    gap: 10,
  },
  xHeader: { color: '#8E878C', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  importedCard: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
    padding: 12,
  },
  importedTitle: { color: '#8E878C', fontSize: 12, fontWeight: '800' },
  importedRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  importedMeta: { color: '#FF2D72', fontWeight: '800', fontSize: 12 },
  tiktokThumb: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#F1E8E2',
  },
  xTextarea: { minHeight: 150 },
  xDateInput: { minHeight: 56 },
  fetchButton: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEE8EA',
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchButtonText: { color: '#FF2D72', fontWeight: '800', fontSize: 14 },
  categoryPicker: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryValue: {
    color: '#FF2D72',
    fontSize: 18,
    fontWeight: '500',
  },
  categoryMenu: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#EEE8EA',
    overflow: 'hidden',
    marginTop: -4,
    marginBottom: 14,
  },
  categoryOption: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryOptionActive: {
    backgroundColor: '#FFF0F7',
  },
  categoryOptionText: {
    color: '#514C50',
    fontSize: 15,
    fontWeight: '600',
  },
  categoryOptionTextActive: {
    color: '#FF2D72',
  },
  button: {
    marginTop: 10,
    height: 74,
    borderRadius: 18,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 17 },
});
