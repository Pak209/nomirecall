import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MemoryAPI } from '../../../services/api';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type DetailRoute = RouteProp<RootStackParamList, 'MemoryDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatPostDate(value?: string): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function MemoryDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const memoryId = route.params.memoryId;
  const [infoVisible, setInfoVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');

  const memoryQuery = useQuery({
    queryKey: ['memory', memoryId],
    queryFn: () => MemoryAPI.get(memoryId),
    onSuccess: (res) => {
      setTitleDraft(res.memory?.title || '');
      setCategoryDraft(res.memory?.category || 'General');
    },
  });

  const memory = useMemo(() => memoryQuery.data?.memory, [memoryQuery.data?.memory]);

  const updateMutation = useMutation({
    mutationFn: () => MemoryAPI.update(memoryId, { title: titleDraft, category: categoryDraft }),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['memory', memoryId] });
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      showToast('Memory updated', 'success');
    },
    onError: (e: any) => showToast(e?.message || 'Update failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => MemoryAPI.remove(memoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      showToast('Memory deleted', 'warning');
      nav.goBack();
    },
    onError: (e: any) => showToast(e?.message || 'Delete failed', 'error'),
  });

  function confirmDelete() {
    Alert.alert('Delete memory?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  useEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={confirmDelete}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="Delete memory"
            disabled={deleteMutation.isLoading}
          >
            <Ionicons name="trash-outline" size={22} color="#FF5B5B" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setInfoVisible(true)}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="Show memory info"
          >
            <Ionicons name="information-circle-outline" size={25} color="#1C1C22" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [deleteMutation.isLoading, nav]);

  if (memoryQuery.isLoading) return <View style={styles.center}><ActivityIndicator color="#FF2D8E" /></View>;
  if (memoryQuery.isError || !memory) return <View style={styles.center}><Text style={styles.stateText}>Memory unavailable.</Text></View>;

  const isTweet = memory.source_type === 'tweet';
  const body = memory.body || 'No content saved for this memory.';
  const links = memory.links || [];
  const media = memory.media || [];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.readerContent} showsVerticalScrollIndicator={false}>
        {isEditing ? (
          <>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
            />
          </>
        ) : (
          <Text style={styles.title}>{memory.title}</Text>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaPill}>{memory.category || 'General'}</Text>
          <Text style={styles.metaText}>{isTweet ? 'X post' : memory.source_type}</Text>
        </View>

        <Text style={styles.bodyText}>{body}</Text>

        {media.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Media</Text>
            {media.map((item, index) => {
              const imageUrl = item.type === 'photo' ? item.url : item.previewImageUrl;
              const playableUrl = item.variants
                ?.filter((variant) => variant.contentType?.includes('mp4') || variant.url.includes('.mp4'))
                .sort((a, b) => (b.bitRate || 0) - (a.bitRate || 0))[0]?.url;
              return (
                <TouchableOpacity
                  key={`${item.type}-${index}`}
                  style={styles.mediaCard}
                  activeOpacity={0.88}
                  onPress={() => {
                    const target = playableUrl || item.url || item.previewImageUrl;
                    if (target) Linking.openURL(target);
                  }}
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.mediaImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.mediaFallback}>
                      <Ionicons name="play-circle-outline" size={34} color="#776B64" />
                    </View>
                  )}
                  <View style={styles.mediaMeta}>
                    <Text style={styles.mediaType}>{item.type === 'photo' ? 'Image' : 'Video'}</Text>
                    {item.altText ? <Text style={styles.mediaAlt} numberOfLines={2}>{item.altText}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {links.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Links</Text>
            {links.map((item, index) => (
              <TouchableOpacity
                key={`${item.url}-${index}`}
                style={styles.linkCard}
                activeOpacity={0.86}
                onPress={() => Linking.openURL(item.url)}
              >
                <Ionicons name="link-outline" size={18} color="#3762A8" />
                <View style={styles.linkTextWrap}>
                  <Text style={styles.linkTitle} numberOfLines={2}>{item.title || item.displayUrl || item.url}</Text>
                  <Text style={styles.linkUrl} numberOfLines={1}>{item.displayUrl || item.url}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={infoVisible}
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.infoSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Memory info</Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#1C1C22" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              value={categoryDraft}
              editable={isEditing}
              onChangeText={setCategoryDraft}
            />

            <Text style={styles.label}>Type</Text>
            <Text style={styles.value}>{isTweet ? 'X post' : memory.source_type}</Text>

            {isTweet ? (
              <>
                <Text style={styles.label}>Username</Text>
                <Text style={styles.value}>{memory.authorUsername ? `@${memory.authorUsername}` : 'Unknown'}</Text>
                <Text style={styles.label}>Post date</Text>
                <Text style={styles.value}>{formatPostDate(memory.postDate)}</Text>
              </>
            ) : null}

            {memory.source_url ? (
              <>
                <Text style={styles.label}>Source URL</Text>
                <Text style={styles.urlText}>{memory.source_url}</Text>
              </>
            ) : null}

            {!isEditing ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setIsEditing(true)}>
                <Text style={styles.primaryText}>Edit memory</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => updateMutation.mutate()} disabled={updateMutation.isLoading}>
                {updateMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save changes</Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={confirmDelete}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? <ActivityIndicator color="#FF5B5B" /> : <Text style={styles.deleteText}>Delete memory</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF7F2' },
  stateText: { color: '#776B64' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  readerContent: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 56 },
  title: { color: '#1C1C22', fontSize: 31, fontWeight: '800', lineHeight: 38 },
  titleInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    color: '#1C1C22',
    fontSize: 20,
    fontWeight: '700',
  },
  metaRow: { marginTop: 14, marginBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaPill: {
    borderRadius: 999,
    backgroundColor: '#FFE9F4',
    color: '#FF2D8E',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontWeight: '800',
    fontSize: 12,
  },
  metaText: { color: '#776B64', fontSize: 13, fontWeight: '700' },
  bodyText: { color: '#1C1C22', fontSize: 19, lineHeight: 30 },
  section: { marginTop: 28 },
  sectionTitle: { color: '#655C57', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  mediaCard: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  mediaImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#F0E7DE' },
  mediaFallback: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E7DE' },
  mediaMeta: { padding: 12 },
  mediaType: { color: '#1C1C22', fontWeight: '900' },
  mediaAlt: { color: '#776B64', marginTop: 4, lineHeight: 18 },
  linkCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D8CA',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
  },
  linkTextWrap: { flex: 1 },
  linkTitle: { color: '#1C1C22', fontWeight: '800', lineHeight: 19 },
  linkUrl: { color: '#3762A8', marginTop: 3, fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,28,34,0.28)' },
  infoSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FDF7F2',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 34,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: '#1C1C22', fontSize: 22, fontWeight: '800' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 10, marginBottom: 6, color: '#655C57', fontWeight: '800' },
  input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 12, color: '#1C1C22' },
  value: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#F9F3EE', padding: 12, color: '#1C1C22' },
  urlText: { borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#F9F3EE', padding: 12, color: '#3762A8', lineHeight: 18 },
  primaryBtn: { marginTop: 18, height: 50, borderRadius: 12, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  deleteBtn: { marginTop: 10, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#FF5B5B', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  deleteText: { color: '#FF5B5B', fontWeight: '800' },
});
