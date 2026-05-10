import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, Share,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { BrainAPI } from '../services/api';
import { RootStackParamList } from '../types';

type Route = RouteProp<RootStackParamList, 'WikiPage'>;

// ── Minimal markdown renderer ────────────────────────────────────────────────
function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(<Text key={key++} style={s.h1}>{line.slice(2)}</Text>);
    } else if (line.startsWith('## ')) {
      elements.push(<Text key={key++} style={s.h2}>{line.slice(3)}</Text>);
    } else if (line.startsWith('### ')) {
      elements.push(<Text key={key++} style={s.h3}>{line.slice(4)}</Text>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <View key={key++} style={s.blockquote}>
          <Text style={s.blockquoteText}>{line.slice(2)}</Text>
        </View>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2);
      // Detect claim status icons
      const claimColor = content.startsWith('✅')
        ? Colors.green
        : content.startsWith('⚠️')
          ? Colors.amber
          : content.startsWith('🔵')
            ? Colors.blue
            : null;

      elements.push(
        <View key={key++} style={s.bullet}>
          <Text style={s.bulletDot}>·</Text>
          <Text style={[s.bulletText, claimColor ? { color: claimColor } : null]}>{processInline(content)}</Text>
        </View>,
      );
    } else if (line.startsWith('---')) {
      elements.push(<View key={key++} style={s.divider} />);
    } else if (line.startsWith('|')) {
      // Simple table row
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => c.replace(/-/g, '').trim() === '')) continue; // skip separator
      elements.push(
        <View key={key++} style={s.tableRow}>
          {cells.map((c, ci) => (
            <Text key={ci} style={[s.tableCell, ci === 0 && s.tableCellLabel]}>{c}</Text>
          ))}
        </View>,
      );
    } else if (line.trim() === '') {
      if (elements.length > 0) elements.push(<View key={key++} style={{ height: 8 }} />);
    } else if (line.startsWith('*Auto-compiled')) {
      elements.push(<Text key={key++} style={s.footer}>{line.replace(/\*/g, '')}</Text>);
    } else {
      elements.push(<Text key={key++} style={s.body}>{processInline(line)}</Text>);
    }
  }
  return elements;
}

function processInline(text: string): string {
  // Strip markdown bold/italic and wiki links for plain display
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[\[(.+?)\]\]\(.+?\)/g, '[$1]')
    .replace(/`(.+?)`/g, '$1');
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function WikiPageScreen() {
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { slug, title } = route.params;
  const wikiPageQuery = useQuery({
    queryKey: ['wiki-page', slug],
    queryFn: () => BrainAPI.getWikiPage(slug),
  });
  const content = wikiPageQuery.data ?? '';
  const loading = wikiPageQuery.isLoading;
  const error = wikiPageQuery.error instanceof Error ? wikiPageQuery.error.message : '';

  async function handleShare() {
    await Share.share({ message: `${title}\n\n${content.slice(0, 500)}...`, title });
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Custom header row */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {renderMarkdown(content)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  topBarTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.medium, color: Colors.textPrimary },
  shareBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6 },
  shareBtnText: { fontSize: Typography.sm, color: Colors.teal },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: Typography.sm, color: Colors.red },
  scroll: { padding: Spacing.xl, paddingBottom: 60 },
});

const s = StyleSheet.create({
  h1: {
    fontSize: Typography.xxl, fontWeight: Typography.semibold,
    color: Colors.textPrimary, marginTop: Spacing.sm, marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: Typography.xl, fontWeight: Typography.semibold,
    color: Colors.textPrimary, marginTop: Spacing.xxl, marginBottom: Spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border, paddingBottom: Spacing.sm,
  },
  h3: {
    fontSize: Typography.lg, fontWeight: Typography.medium,
    color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  body: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 22 },
  blockquote: {
    borderLeftWidth: 2, borderLeftColor: Colors.teal,
    paddingLeft: Spacing.md, marginVertical: Spacing.sm,
    backgroundColor: Colors.tealDim, borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  blockquoteText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  bullet: { flexDirection: 'row', gap: Spacing.sm, marginVertical: 3, alignItems: 'flex-start' },
  bulletDot: { fontSize: Typography.md, color: Colors.teal, lineHeight: 22, marginTop: 1 },
  bulletText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 22 },
  divider: { height: 0.5, backgroundColor: Colors.border, marginVertical: Spacing.lg },
  tableRow: {
    flexDirection: 'row', borderBottomWidth: 0.5,
    borderBottomColor: Colors.border, paddingVertical: Spacing.sm,
  },
  tableCell: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  tableCellLabel: { color: Colors.textTertiary },
  footer: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: Spacing.xxl, fontStyle: 'italic' },
});
