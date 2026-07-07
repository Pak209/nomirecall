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
import { BrainAPI, BrainQuerySource, MemoryAPI } from '../../../services/api';
import { RootStackParamList } from '../../../types';
import { useToast } from '../../ui/shared/ToastProvider';
import { useStore } from '../../../store/useStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function RecallScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const dark = useStore((state) => state.theme === 'dark');
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
      setRelatedIds((res.sources || []).map((source) => source.memoryId));
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
    <View style={[styles.root, dark && styles.rootDark, { paddingTop: insets.top + 16 }]}>
      <Text style={[styles.title, dark && styles.titleDark]}>Recall</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, dark && styles.inputDark]}
          placeholder="Search memories..."
          placeholderTextColor={dark ? '#80768B' : '#B8ACA5'}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={[styles.filterButton, dark && styles.filterButtonDark, hasActiveFilters && styles.filterButtonActive]}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Feather name="sliders" size={19} color={hasActiveFilters ? '#fff' : dark ? '#D6CFDD' : '#655C57'} />
          {activeFilterCount ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {hasActiveFilters ? (
        <View style={[styles.activeFilterRow, dark && styles.activeFilterRowDark]}>
          <Text style={[styles.activeFilterText, dark && styles.activeFilterTextDark]} numberOfLines={1}>
            {[selectedCategory, selectedTag ? `#${selectedTag}` : undefined, selectedType === 'tweet' ? 'X posts' : selectedType]
              .filter(Boolean)
              .join(' • ')}
          </Text>
          <TouchableOpacity onPress={clearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearFilters}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.askCard, dark && styles.askCardDark]}>
        <TextInput
          style={[styles.askInput, dark && styles.inputDark]}
          placeholder="Ask Nomi a question..."
          placeholderTextColor={dark ? '#80768B' : '#B8ACA5'}
          value={question}
          onChangeText={setQuestion}
        />
        <TouchableOpacity style={styles.askButton} onPress={() => askMutation.mutate()} disabled={askMutation.isLoading || !question.trim()}>
          {askMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.askText}>Ask</Text>}
        </TouchableOpacity>
      </View>

      {askMutation.isError ? (
        <View style={[styles.answerCard, dark && styles.answerCardDark]}>
          <Text style={styles.errorText}>
            {(askMutation.error as Error)?.message || 'Nomi could not answer right now.'}
          </Text>
        </View>
      ) : null}

      {askMutation.data?.answer ? (
        <View style={[styles.answerCard, dark && styles.answerCardDark]}>
          <Text style={[styles.answer, dark && styles.answerDark]}>{askMutation.data.answer}</Text>
          <Text style={[styles.answerMeta, dark && styles.answerMetaDark]}>
            Confidence: {askMutation.data.confidence} • {askMutation.data.retrievalMode}
          </Text>
          {askMutation.data.sources.length ? (
            <View style={styles.sourceList}>
              <Text style={[styles.sourceHeader, dark && styles.sourceHeaderDark]}>Sources</Text>
              {askMutation.data.sources.map((source) => (
                <CitationSource key={source.memoryId} source={source} />
              ))}
            </View>
          ) : (
            <Text style={[styles.noSources, dark && styles.answerMetaDark]}>No saved memories matched that question.</Text>
          )}
        </View>
      ) : null}

      {memoriesQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#FF2D8E" /></View>
      ) : memoriesQuery.isError ? (
        <Text style={[styles.stateText, dark && styles.stateTextDark]}>Could not load memories. Pull to retry.</Text>
      ) : !memoriesQuery.data?.memories?.length ? (
        <Text style={[styles.stateText, dark && styles.stateTextDark]}>No memories yet. Capture your first one.</Text>
      ) : (
        <FlatList
          style={[styles.memoryList, { marginBottom: Math.max(insets.bottom, 8) + 100 }]}
          data={relatedMemories.length ? relatedMemories : memoriesQuery.data.memories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.memoryCard, dark && styles.memoryCardDark]} onPress={() => nav.navigate('MemoryDetail', { memoryId: item.id })}>
              <Text style={[styles.memoryTitle, dark && styles.memoryTitleDark]}>{item.title}</Text>
              <Text style={[styles.memoryMeta, dark && styles.memoryMetaDark]}>
                {item.source_type === 'tweet' && item.authorUsername ? `@${item.authorUsername} • ` : ''}
                {item.category || 'General'} • {item.source_type === 'tweet' ? 'X post' : item.source_type}
                {item.postDate ? ` • ${item.postDate}` : ''}
              </Text>
              {item.source_type === 'tweet' && item.body ? (
                <Text style={[styles.memoryBody, dark && styles.memoryBodyDark]} numberOfLines={3}>{item.body}</Text>
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
          <View style={[styles.filterSheet, dark && styles.filterSheetDark, { paddingBottom: insets.bottom + 18 }]}>
            <View style={[styles.sheetHandle, dark && styles.sheetHandleDark]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, dark && styles.titleDark]}>Filter memories</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)} style={[styles.sheetCloseButton, dark && styles.sheetCloseButtonDark]}>
                <Feather name="x" size={20} color={dark ? '#D6CFDD' : '#655C57'} />
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

function CitationSource({ source }: { source: BrainQuerySource }) {
  const dark = useStore((state) => state.theme === 'dark');
  return (
    <View style={[styles.sourceRow, dark && styles.sourceRowDark]}>
      <Text style={[styles.sourceTitle, dark && styles.sourceTitleDark]} numberOfLines={1}>{source.title || 'Untitled memory'}</Text>
      {source.relevanceReason ? (
        <Text style={styles.sourceReason} numberOfLines={1}>{source.relevanceReason}</Text>
      ) : null}
      <Text style={[styles.sourceSnippet, dark && styles.sourceSnippetDark]} numberOfLines={2}>{source.snippet}</Text>
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
  const dark = useStore((state) => state.theme === 'dark');
  return (
    <View style={styles.sheetSection}>
      <Text style={[styles.sheetSectionTitle, dark && styles.sheetSectionTitleDark]}>{title}</Text>
      {items.length ? (
        <View style={styles.sheetChipWrap}>
          {items.map((item) => {
            const active = selected === item;
            return (
              <TouchableOpacity
                key={`${title}-${item}`}
                style={[styles.sheetChip, dark && styles.sheetChipDark, active && styles.sheetChipActive]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.sheetChipText, dark && styles.sheetChipTextDark, active && styles.sheetChipTextActive]} numberOfLines={1}>
                  {formatLabel(item)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.sheetEmpty, dark && styles.stateTextDark]}>{emptyLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', paddingHorizontal: 16 },
  rootDark: { backgroundColor: '#05020A' },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C22', marginBottom: 12 },
  titleDark: { color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 12, color: '#1C1C22' },
  inputDark: { borderColor: '#342D39', backgroundColor: '#171820', color: '#FFFFFF' },
  filterButton: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  filterButtonDark: { borderColor: '#342D39', backgroundColor: '#171820' },
  filterButtonActive: { borderColor: '#FF2D8E', backgroundColor: '#FF2D8E' },
  filterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#FDF7F2' },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeFilterRow: { marginTop: 10, minHeight: 30, borderRadius: 10, backgroundColor: '#FFE9F4', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeFilterRowDark: { backgroundColor: 'rgba(255,45,142,0.16)' },
  activeFilterText: { flex: 1, color: '#9D125B', fontSize: 12, fontWeight: '700' },
  activeFilterTextDark: { color: '#FF8ABD' },
  clearFilters: { color: '#FF2D8E', fontSize: 12, fontWeight: '800' },
  askCard: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  askCardDark: { borderColor: '#342D39', backgroundColor: '#171820' },
  askInput: { flex: 1, minHeight: 36, color: '#1C1C22' },
  askButton: { height: 36, borderRadius: 10, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  askText: { color: '#fff', fontWeight: '700' },
  answerCard: { marginTop: 10, backgroundColor: '#FFF2DE', borderRadius: 12, padding: 10 },
  answerCardDark: { backgroundColor: '#191A24', borderWidth: 1, borderColor: '#302A36' },
  answer: { color: '#1C1C22', lineHeight: 20 },
  answerDark: { color: '#F5EFFB' },
  answerMeta: { color: '#776B64', fontSize: 11, fontWeight: '700', marginTop: 8, textTransform: 'capitalize' },
  answerMetaDark: { color: '#BDB3C8' },
  errorText: { color: '#FF5B5B', fontWeight: '800' },
  sourceList: { marginTop: 10, gap: 8 },
  sourceHeader: { color: '#655C57', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  sourceHeaderDark: { color: '#D6CFDD' },
  sourceRow: { borderRadius: 10, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', padding: 9 },
  sourceRowDark: { borderColor: '#342D39', backgroundColor: '#101119' },
  sourceTitle: { color: '#1C1C22', fontSize: 13, fontWeight: '800' },
  sourceTitleDark: { color: '#FFFFFF' },
  sourceReason: { color: '#7B3FF2', fontSize: 11, fontWeight: '700', marginTop: 2 },
  sourceSnippet: { color: '#655C57', fontSize: 12, lineHeight: 17, marginTop: 4 },
  sourceSnippetDark: { color: '#BDB3C8' },
  noSources: { color: '#776B64', fontSize: 12, marginTop: 8 },
  memoryList: { flex: 1 },
  list: { paddingTop: 12, paddingBottom: 18, gap: 10 },
  memoryCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', padding: 12 },
  memoryCardDark: { borderColor: '#342D39', backgroundColor: '#171820' },
  memoryTitle: { color: '#1C1C22', fontWeight: '700' },
  memoryTitleDark: { color: '#FFFFFF' },
  memoryMeta: { color: '#776B64', marginTop: 2, fontSize: 12 },
  memoryMetaDark: { color: '#BDB3C8' },
  memoryBody: { color: '#1C1C22', marginTop: 8, lineHeight: 18, fontSize: 13 },
  memoryBodyDark: { color: '#EEEAF1' },
  center: { paddingTop: 36, alignItems: 'center' },
  stateText: { paddingTop: 24, color: '#776B64', textAlign: 'center' },
  stateTextDark: { color: '#BDB3C8' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28, 28, 34, 0.34)' },
  filterSheet: { maxHeight: '78%', backgroundColor: '#FDF7F2', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  filterSheetDark: { backgroundColor: '#0D0E16' },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#E8D8CA', alignSelf: 'center', marginBottom: 12 },
  sheetHandleDark: { backgroundColor: '#332D39' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { flex: 1, color: '#1C1C22', fontSize: 20, fontWeight: '800' },
  sheetCloseButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8D8CA', alignItems: 'center', justifyContent: 'center' },
  sheetCloseButtonDark: { backgroundColor: '#171820', borderColor: '#342D39' },
  sheetScroll: { paddingBottom: 12 },
  sheetSection: { marginBottom: 18 },
  sheetSectionTitle: { color: '#655C57', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
  sheetSectionTitleDark: { color: '#AFA8B8' },
  sheetChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { maxWidth: '100%', minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  sheetChipDark: { borderColor: '#342D39', backgroundColor: '#171820' },
  sheetChipActive: { borderColor: '#FF2D8E', backgroundColor: '#FFE9F4' },
  sheetChipText: { color: '#655C57', fontSize: 13, fontWeight: '800' },
  sheetChipTextDark: { color: '#D6CFDD' },
  sheetChipTextActive: { color: '#FF2D8E' },
  sheetEmpty: { color: '#9B908A', fontSize: 13 },
  sheetActions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  secondaryButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8CA', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#655C57', fontWeight: '800' },
  primaryButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FF2D8E', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
});
