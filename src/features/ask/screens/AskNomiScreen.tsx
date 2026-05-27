import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BrainAPI } from '../../../services/api';
import { useStore } from '../../../store/useStore';

const SUGGESTIONS = [
  'What patterns are showing up in my recent saves?',
  'What should I revisit from this week?',
  'Connect my notes about AI and product ideas.',
];

export default function AskNomiScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const theme = useStore((s) => s.theme);
  const dark = theme === 'dark';
  const [question, setQuestion] = useState('');
  const askMutation = useMutation({
    mutationFn: (text: string) => BrainAPI.query(text),
  });

  function ask(text = question) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    askMutation.mutate(trimmed);
  }

  return (
    <View style={[styles.root, dark && styles.rootDark, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, dark && styles.headerIconDark]}>
          <Ionicons name="sparkles" size={22} color="#FF5A68" />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, dark && styles.titleDark]}>Ask Nomi</Text>
          <Text style={[styles.subtitle, dark && styles.subtitleDark]}>Ask across your saved memories.</Text>
        </View>
      </View>

      <View style={[styles.askCard, dark && styles.askCardDark]}>
        <TextInput
          style={[styles.input, dark && styles.inputDark]}
          placeholder="What do you want to understand?"
          placeholderTextColor={dark ? '#80768B' : '#A89BA3'}
          value={question}
          onChangeText={setQuestion}
          multiline
        />
        <TouchableOpacity
          style={[styles.askButton, !question.trim() && styles.askButtonDisabled]}
          onPress={() => ask()}
          disabled={!question.trim() || askMutation.isLoading}
        >
          {askMutation.isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.askButtonText}>Ask</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={[styles.scroller, { marginBottom: Math.max(insets.bottom, 8) + 100 }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!askMutation.data && !askMutation.isLoading ? (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((item) => (
              <TouchableOpacity key={item} style={[styles.suggestionChip, dark && styles.suggestionChipDark]} onPress={() => ask(item)}>
                <Text style={[styles.suggestionText, dark && styles.suggestionTextDark]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {askMutation.isError ? (
          <View style={[styles.answerCard, dark && styles.answerCardDark]}>
            <Text style={styles.errorText}>{(askMutation.error as Error)?.message || 'Nomi could not answer right now.'}</Text>
          </View>
        ) : null}

        {askMutation.data ? (
          <View style={[styles.answerCard, dark && styles.answerCardDark]}>
            <Text style={[styles.answerLabel, dark && styles.answerLabelDark]}>Nomi answer</Text>
            <Text style={[styles.answerText, dark && styles.answerTextDark]}>{askMutation.data.answer}</Text>
            <Text style={[styles.answerMeta, dark && styles.answerMetaDark]}>
              {askMutation.data.confidence} confidence • {askMutation.data.retrievalMode}
            </Text>

            {askMutation.data.sources.length ? (
              <View style={styles.sources}>
                <Text style={[styles.sourcesTitle, dark && styles.answerLabelDark]}>Sources</Text>
                {askMutation.data.sources.map((source) => (
                  <TouchableOpacity
                    key={source.memoryId}
                    style={[styles.sourceCard, dark && styles.sourceCardDark]}
                    onPress={() => nav.navigate('MemoryDetail', { memoryId: source.memoryId })}
                  >
                    <Text style={[styles.sourceTitle, dark && styles.answerTextDark]} numberOfLines={1}>{source.title || 'Untitled memory'}</Text>
                    <Text style={[styles.sourceSnippet, dark && styles.answerMetaDark]} numberOfLines={2}>{source.snippet}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF7F2', paddingHorizontal: 18 },
  rootDark: { backgroundColor: '#05020A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFE9ED', alignItems: 'center', justifyContent: 'center' },
  headerIconDark: { backgroundColor: 'rgba(255,90,104,0.16)' },
  headerText: { flex: 1 },
  title: { color: '#151419', fontSize: 31, fontWeight: '900' },
  titleDark: { color: '#FFFFFF' },
  subtitle: { color: '#736962', fontSize: 14, marginTop: 2 },
  subtitleDark: { color: '#A59BAF' },
  askCard: { borderRadius: 20, borderWidth: 1, borderColor: '#EEDDD3', backgroundColor: '#fff', padding: 12, gap: 12 },
  askCardDark: { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.07)' },
  input: { minHeight: 86, color: '#151419', fontSize: 18, lineHeight: 24, textAlignVertical: 'top' },
  inputDark: { color: '#fff' },
  askButton: { height: 48, borderRadius: 15, backgroundColor: '#FF2D8E', alignItems: 'center', justifyContent: 'center' },
  askButtonDisabled: { opacity: 0.48 },
  askButtonText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  scroller: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 18 },
  suggestions: { gap: 10 },
  suggestionChip: { borderRadius: 16, borderWidth: 1, borderColor: '#EEDDD3', backgroundColor: '#fff', padding: 14 },
  suggestionChipDark: { borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.06)' },
  suggestionText: { color: '#201F24', fontWeight: '700' },
  suggestionTextDark: { color: '#F5EFFB' },
  answerCard: { borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EEDDD3', padding: 16 },
  answerCardDark: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' },
  answerLabel: { color: '#FF2D8E', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  answerLabelDark: { color: '#FF8ABD' },
  answerText: { color: '#151419', fontSize: 17, lineHeight: 25, fontWeight: '700' },
  answerTextDark: { color: '#FFFFFF' },
  answerMeta: { color: '#7A6D65', fontSize: 12, fontWeight: '700', marginTop: 12, textTransform: 'capitalize' },
  answerMetaDark: { color: '#BDB3C8' },
  errorText: { color: '#FF5B5B', fontWeight: '800' },
  sources: { marginTop: 18, gap: 10 },
  sourcesTitle: { color: '#6F655F', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  sourceCard: { borderRadius: 14, backgroundColor: '#FFF7F3', borderWidth: 1, borderColor: '#F0E2D6', padding: 12 },
  sourceCardDark: { backgroundColor: 'rgba(0,0,0,0.22)', borderColor: 'rgba(255,255,255,0.10)' },
  sourceTitle: { color: '#201F24', fontWeight: '900' },
  sourceSnippet: { color: '#6F655F', marginTop: 5, lineHeight: 18 },
});
