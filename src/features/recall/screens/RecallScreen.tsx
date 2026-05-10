import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrainAPI, MemoryAPI } from '../../../services/api';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function RecallScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [question, setQuestion] = useState('');
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const memoriesQuery = useQuery({
    queryKey: ['memories', search, selectedCategory, selectedTag, selectedType],
    queryFn: () => MemoryAPI.list({
      search: search.trim() || undefined,
      category: selectedCategory,
      tag: selectedTag,
      type: selectedType,
    }),
  });

  const allMemoriesQuery = useQuery({
    queryKey: ['memories', 'filter-options'],
    queryFn: () => MemoryAPI.list(),
  });

  const askMutation = useMutation({
    mutationFn: () => BrainAPI.query(question),
    onSuccess: (res) => {
      setRelatedIds(res.sources || []);
      showToast('Nomi answered your question', 'success');
    },
    onError: (e: any) => showToast(e?.message || 'Nomi could not answer right now', 'error'),
  });

  const relatedMemories = useMemo(() => {
    const all = memoriesQuery.data?.memories || [];
    if (!relatedIds.length) return [];
    const lookup = new Set(relatedIds);
    return all.filter((memory) => lookup.has(memory.id));
  }, [memoriesQuery.data?.memories, relatedIds]);

  const filterOptions = useMemo(() => {
    const memories = allMemoriesQuery.data?.memories || memoriesQuery.data?.memories || [];
    const categories = Array.from(new Set(memories.map((item) => item.category || 'General'))).sort();
    const tags = Array.from(new Set(memories.flatMap((item) => item.tags || []))).sort();
    const types = Array.from(new Set(memories.map((item) => item.source_type))).sort();
    return { categories, tags, types };
  }, [allMemoriesQuery.data?.memories, memoriesQuery.data?.memories]);

  const hasActiveFilters = !!selectedCategory || !!selectedTag || !!selectedType;
  const activeFilterCount = [selectedCategory, selectedTag, selectedType].filter(Boolean).length;

  function clearFilters() {
    setSelectedCategory(undefined);
    setSelectedTag(undefined);
    setSelectedType(undefined);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>Recall</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search memories..."
          placeholderTextColor="#B8ACA5"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Feather name="sliders" size={19} color={hasActiveFilters ? '#fff' : '#655C57'} />
          {activeFilterCount ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {hasActiveFilters ? (
        <View style={styles.activeFilterRow}>
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {[selectedCategory, selectedTag ? `#${selectedTag}` : undefined, selectedType === 'tweet' ? 'X posts' : selectedType]
              .filter(Boolean)
              .join(' • ')}
          </Text>
          <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearFilters}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.askCard}>
        <TextInput style={styles.askInput} placeholder="Ask Nomi a question..." value={question} onChangeText={setQuestion} />
        <TouchableOpacity style={styles.askButton} onPress={() => askMutation.mutate()} disabled={askMutation.isLoading || !question.trim()}>
          {askMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.askText}>Ask</Text>}
        </TouchableOpacity>
      </View>

      {askMutation.data?.answer ? <Text style={styles.answer}>{askMutation.data.answer}</Text> : null}

      {memoriesQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#FF2D8E" /></View>
      ) : memoriesQuery.isError ? (
        <Text style={styles.stateText}>Could not load memories. Pull to retry.</Text>
      ) : !memoriesQuery.data?.memories?.length ? (
        <Text style={styles.stateText}>No memories yet. Capture your first one.</Text>
      ) : (
        <FlatList
          data={relatedMemories.length ? relatedMemories : memoriesQuery.data.memories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.memoryCard} onPress={() => nav.navigate('MemoryDetail', { memoryId: item.id })}>
              <Text style={styles.memoryTitle}>{item.title}</Text>
              <Text style={styles.memoryMeta}>
                {item.source_type === 'tweet' && item.authorUsername ? `@${item.authorUsername} • ` : ''}
                {item.category || 'General'} • {item.source_type === 'tweet' ? 'X post' : item.source_type}
                {item.postDate ? ` • ${item.postDate}` : ''}
              </Text>
              {item.source_type === 'tweet' && item.body ? (
                <Text style={styles.memoryBody} numberOfLines={3}>{item.body}</Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        animationType="slide"
        transparent
        visible={filtersOpen}
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFiltersOpen(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter memories</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.sheetCloseButton}>
                <Feather name="x" size={20} color="#655C57" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
              <FilterSection
                title="Categories"
                items={filterOptions.categories}
                selected={selectedCategory}
                emptyLabel="No categories yet"
                onSelect={(value) => setSelectedCategory((current) => (current === value ? undefined : value))}
              />
              <FilterSection
                title="Tags"
                items={filterOptions.tags}
                selected={selectedTag}
                emptyLabel="No tags yet"
                formatLabel={(value) => `#${value}`}
                onSelect={(value) => setSelectedTag((current) => (current === value ? undefined : value))}
              />
              <FilterSection
                title="Types"
                items={filterOptions.types}
                selected={selectedType}
                emptyLabel="No types yet"
                formatLabel={(value) => (value === 'tweet' ? 'X posts' : value)}
                onSelect={(value) => setSelectedType((current) => (current === value ? undefined : value))}
              />
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={clearFilters}>
                <Text style={styles.secondaryButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setFiltersOpen(false)}>
                <Text style={styles.primaryButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterSection({
  title,
  items,
  selected,
  emptyLabel,
  onSelect,
  formatLabel = (value: string) => value,
}: {
  title: string;
  items: string[];
  selected?: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  return (
    <View style={styles.sheetSection}>
      <Text style={styles.sheetSectionTitle}>{title}</Text>
      {items.length ? (
        <View style={styles.sheetChipWrap}>
          {items.map((item) => {
            const active = selected === item;
            return (
              <TouchableOpacity
                key={`${title}-${item}`}
                style={[styles.sheetChip, active && styles.sheetChipActive]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]} numberOfLines={1}>
                  {formatLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={styles.sheetEmpty}>{emptyLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22', marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 12, color: '#1C1C22' },
  filterButton: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { borderColor: '#FF2D8E', backgroundColor: '#FF2D8E' },
  filterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#FDF7F2' },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeFilterRow: { marginTop: 10, minHeight: 30, borderRadius: 10, backgroundColor: '#FFE9F4', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeFilterText: { flex: 1, color: '#9D125B', fontSize: 12, fontWeight: '700' },
  clearFilters: { color: '#FF2D8E', fontSize: 12, fontWeight: '800' },
  askCard: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  askInput: { flex: 1, minHeight: 36, color: '#1C1C22' },
  askButton: { height: 36, borderRadius: 10, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  askText: { color: '#fff', fontWeight: '700' },
  answer: { marginTop: 10, color: '#1C1C22', backgroundColor: '#FFF2DE', borderRadius: 12, padding: 10, lineHeight: 20 },
  list: { paddingTop: 12, paddingBottom: 120, gap: 10 },
  memoryCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', padding: 12 },
  memoryTitle: { color: '#1C1C22', fontWeight: '700' },
  memoryMeta: { color: '#776B64', marginTop: 2, fontSize: 12 },
  memoryBody: { color: '#1C1C22', marginTop: 8, lineHeight: 18, fontSize: 13 },
  center: { paddingTop: 36, alignItems: 'center' },
  stateText: { paddingTop: 24, color: '#776B64', textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28, 28, 34, 0.34)' },
  filterSheet: { maxHeight: '78%', backgroundColor: '#FDF7F2', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#E8D8CA', alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { flex: 1, color: '#1C1C22', fontSize: 20, fontWeight: '800' },
  sheetCloseButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8D8CA', alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { paddingBottom: 12 },
  sheetSection: { marginBottom: 18 },
  sheetSectionTitle: { color: '#655C57', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  sheetChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { maxWidth: '100%', minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  sheetChipActive: { borderColor: '#FF2D8E', backgroundColor: '#FFE9F4' },
  sheetChipText: { color: '#655C57', fontSize: 13, fontWeight: '800' },
  sheetChipTextActive: { color: '#FF2D8E' },
  sheetEmpty: { color: '#9B908A', fontSize: 13 },
  sheetActions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  secondaryButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#655C57', fontWeight: '800' },
  primaryButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FF2D8E', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
});
