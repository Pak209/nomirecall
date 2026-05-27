import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemoryAPI } from '../../../services/api';
import { MemoryItem } from '../../../types';
import { useStore } from '../../../store/useStore';

type GalaxyNodeKind = 'hub' | 'memory' | 'concept' | 'tag';
type GalaxyFilter = 'all' | 'memories' | 'concepts';

interface GalaxyNode {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind: GalaxyNodeKind;
  links: number;
  memory?: MemoryItem;
  x: number;
  y: number;
  z: number;
}

interface GalaxyEdge {
  id: string;
  from: string;
  to: string;
  strength: number;
}

const FILTERS: Array<{ id: GalaxyFilter; title: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'all', title: 'All', icon: 'planet-outline' },
  { id: 'memories', title: 'Memories', icon: 'document-text-outline' },
  { id: 'concepts', title: 'Concepts', icon: 'prism-outline' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_HEIGHT = 560;
const CENTER_X = SCREEN_WIDTH / 2;
const CENTER_Y = 316;
const MIN_GALAXY_SCALE = 0.55;
const MAX_GALAXY_SCALE = 2.25;

export default function KnowledgeGalaxyScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const theme = useStore((s) => s.theme);
  const dark = theme === 'dark';
  const [filter, setFilter] = useState<GalaxyFilter>('all');
  const [camera, setCamera] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const steadyCamera = useRef(camera);
  const pinchStartDistance = useRef<number | null>(null);
  const memoriesQuery = useQuery({
    queryKey: ['memories', 'knowledge-galaxy'],
    queryFn: () => MemoryAPI.list(),
  });
  const graph = useMemo(() => makeGalaxyGraph(memoriesQuery.data?.memories || []), [memoriesQuery.data?.memories]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || graph.nodes[0];
  const visibleNodes = graph.nodes.filter((node) => {
    if (filter === 'memories') return node.kind === 'hub' || node.kind === 'memory';
    if (filter === 'concepts') return node.kind === 'hub' || node.kind === 'concept' || node.kind === 'tag';
    return true;
  });
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length > 1,
      onMoveShouldSetPanResponder: (event, gesture) =>
        event.nativeEvent.touches.length > 1 || Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: (event) => {
        steadyCamera.current = camera;
        pinchStartDistance.current = distanceBetweenTouches(event.nativeEvent.touches);
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length > 1) {
          const distance = distanceBetweenTouches(touches);
          if (!distance) return;
          const startDistance = pinchStartDistance.current || distance || 1;
          const nextScale = clamp(steadyCamera.current.scale * (distance / startDistance), MIN_GALAXY_SCALE, MAX_GALAXY_SCALE);
          setCamera((current) => ({ ...current, scale: nextScale }));
          return;
        }

        setCamera({
          scale: steadyCamera.current.scale,
          offsetX: steadyCamera.current.offsetX + gesture.dx,
          offsetY: steadyCamera.current.offsetY + gesture.dy,
        });
      },
      onPanResponderRelease: (_event, gesture) => {
        const horizontalIntent = Math.abs(gesture.dx) > 86 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35;
        steadyCamera.current = camera;
        pinchStartDistance.current = null;
        if (horizontalIntent && camera.scale <= 1.35) {
          const nextIndex = FILTERS.findIndex((item) => item.id === filter) + (gesture.dx < 0 ? 1 : -1);
          const nextFilter = FILTERS[(nextIndex + FILTERS.length) % FILTERS.length];
          setFilter(nextFilter.id);
        }
      },
      onPanResponderTerminate: () => {
        steadyCamera.current = camera;
        pinchStartDistance.current = null;
      },
    }),
    [camera, filter],
  );

  function recenterGalaxy() {
    const next = { scale: 1, offsetX: 0, offsetY: 0 };
    steadyCamera.current = next;
    setCamera(next);
    setSelectedId(graph.nodes[0]?.id || null);
  }

  return (
    <View style={[styles.root, dark && styles.rootDark, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, dark && styles.headerIconDark]}>
          <Ionicons name="square-outline" size={22} color="#FF2D8E" />
        </View>
        <Text style={[styles.title, dark && styles.titleDark]}>Knowledge Galaxy</Text>
        <TouchableOpacity style={[styles.scopeButton, dark && styles.scopeButtonDark]} onPress={recenterGalaxy}>
          <Ionicons name="scan" size={20} color={dark ? '#fff' : '#201F24'} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <TouchableOpacity key={item.id} style={[styles.filterChip, dark && styles.filterChipDark, active && styles.filterChipActive]} onPress={() => setFilter(item.id)}>
              <Ionicons name={item.icon} size={15} color={active ? '#fff' : dark ? '#D8D0E2' : '#655C57'} />
              <Text style={[styles.filterText, dark && styles.filterTextDark, active && styles.filterTextActive]}>{item.title}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.statsPill, dark && styles.statsPillDark]}>
        <Text style={[styles.statsText, dark && styles.statsTextDark]}>{graph.memoryCount} notes • {graph.edges.length} links</Text>
      </View>

      <View style={styles.canvas} {...panResponder.panHandlers}>
        {memoriesQuery.isLoading ? (
          <ActivityIndicator color="#FF2D8E" style={styles.loader} />
        ) : graph.nodes.length <= 1 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, dark && styles.titleDark]}>No galaxy yet</Text>
            <Text style={[styles.emptyBody, dark && styles.emptyBodyDark]}>Capture more memories and Nomi will map their categories, tags, and connections here.</Text>
          </View>
        ) : (
          <>
            {visibleEdges.map((edge) => {
              const from = graph.nodeMap.get(edge.from);
              const to = graph.nodeMap.get(edge.to);
              if (!from || !to) return null;
              return <GalaxyLine key={edge.id} from={from} to={to} dark={dark} camera={camera} />;
            })}
            {visibleNodes.map((node) => (
              <GalaxyNodeView
                key={node.id}
                node={node}
                dark={dark}
                selected={selectedNode?.id === node.id}
                camera={camera}
                onPress={() => setSelectedId(node.id)}
              />
            ))}
          </>
        )}
      </View>

      {selectedNode ? (
        <View style={[styles.detailCard, dark && styles.detailCardDark, { marginBottom: Math.max(insets.bottom, 8) + 96 }]}>
          <View style={styles.detailTop}>
            <View style={[styles.detailIcon, { backgroundColor: nodeColor(selectedNode.kind) }]}>
              <Ionicons name={nodeIcon(selectedNode.kind)} size={16} color="#fff" />
            </View>
            <View style={styles.detailText}>
              <Text style={[styles.detailTitle, dark && styles.titleDark]} numberOfLines={1}>{selectedNode.title}</Text>
              <Text style={[styles.detailSub, dark && styles.emptyBodyDark]}>{selectedNode.subtitle} • {selectedNode.links} links</Text>
            </View>
          </View>
          <Text style={[styles.detailBody, dark && styles.detailBodyDark]} numberOfLines={3}>{selectedNode.detail}</Text>
          {selectedNode.memory ? (
            <TouchableOpacity style={styles.openMemory} onPress={() => nav.navigate('MemoryDetail', { memoryId: selectedNode.memory?.id })}>
              <Text style={styles.openMemoryText}>Open memory</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function GalaxyLine({ from, to, dark, camera }: { from: GalaxyNode; to: GalaxyNode; dark: boolean; camera: GalaxyCamera }) {
  const start = project(from, camera);
  const end = project(to, camera);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.edge,
        {
          left: start.x,
          top: start.y,
          width: length,
          opacity: dark ? 0.28 : 0.18,
          transform: [{ rotateZ: `${angle}rad` }],
        },
      ]}
    />
  );
}

function GalaxyNodeView({ node, dark, selected, camera, onPress }: { node: GalaxyNode; dark: boolean; selected: boolean; camera: GalaxyCamera; onPress: () => void }) {
  const point = project(node, camera);
  const size = node.kind === 'hub' ? 74 : node.kind === 'concept' ? 58 : 46;
  const depthScale = (1 + node.z * 0.12) * Math.min(Math.max(camera.scale, 0.78), 1.55);
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.node,
        {
          left: point.x - size / 2,
          top: point.y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: selected ? '#FF2D8E' : nodeColor(node.kind),
          opacity: node.z < -0.2 ? 0.75 : 1,
          transform: [{ scale: depthScale }],
          zIndex: Math.round(100 + node.z * 20 + (selected ? 50 : 0)),
        },
        dark && styles.nodeDark,
      ]}
    >
      <Ionicons name={nodeIcon(node.kind)} size={node.kind === 'hub' ? 24 : 18} color="#fff" />
      <Text style={styles.nodeLabel} numberOfLines={1}>{node.title}</Text>
    </TouchableOpacity>
  );
}

function makeGalaxyGraph(memories: MemoryItem[]) {
  const active = memories.filter((item) => !item.isArchived).slice(0, 32);
  const center = active[0];
  const nodes: GalaxyNode[] = [];
  const edges: GalaxyEdge[] = [];
  const hubId = center ? `hub-${center.id}` : 'hub-empty';
  nodes.push({
    id: hubId,
    title: center?.title || 'Nomi',
    subtitle: 'Central Hub',
    detail: center ? preview(center) : 'Your saved memories will orbit here once you capture them.',
    kind: 'hub',
    links: active.length,
    memory: center,
    x: 0,
    y: 0,
    z: 0.08,
  });

  const grouped = groupBy(active, (memory) => memory.category || 'General');
  const categories = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length).slice(0, 8);

  categories.forEach((category, index) => {
    const categoryPoint = orbitPoint(index, categories.length, 1.12, 0.68, 0.22);
    const categoryId = `category-${normalizeId(category)}`;
    nodes.push({
      id: categoryId,
      title: category,
      subtitle: 'Category',
      detail: `${grouped[category].length} memories saved in ${category}.`,
      kind: 'concept',
      links: grouped[category].length,
      x: categoryPoint.x,
      y: categoryPoint.y,
      z: categoryPoint.z + 0.16,
    });
    edges.push({ id: `edge-${hubId}-${categoryId}`, from: hubId, to: categoryId, strength: 0.56 });

    grouped[category].slice(0, 9).forEach((memory, memoryIndex) => {
      const point = moonPoint(memoryIndex, grouped[category].length, categoryPoint, 0.34 + (memoryIndex % 3) * 0.05);
      const memoryId = `memory-${memory.id}`;
      nodes.push({
        id: memoryId,
        title: galaxyTitle(memory),
        subtitle: memory.source_type === 'tweet' ? 'X post' : memory.source_type || 'Memory',
        detail: preview(memory),
        kind: 'memory',
        links: Math.max(1, (memory.tags?.length || 0) + (memory.entities?.length || 0)),
        memory,
        x: point.x,
        y: point.y,
        z: point.z,
      });
      edges.push({ id: `edge-${categoryId}-${memoryId}`, from: categoryId, to: memoryId, strength: 0.42 });
    });
  });

  const topTags = topValues(active.flatMap((memory) => memory.tags || [])).slice(0, 8);
  topTags.forEach((tag, index) => {
    const point = orbitPoint(index, topTags.length, 1.54, 0.72, 0.34);
    const tagId = `tag-${normalizeId(tag.label)}`;
    nodes.push({
      id: tagId,
      title: `#${tag.label.replace(/^#/, '')}`,
      subtitle: 'Tag',
      detail: `${tag.count} memories mention this tag.`,
      kind: 'tag',
      links: tag.count,
      x: point.x,
      y: point.y,
      z: point.z - 0.08,
    });
    edges.push({ id: `edge-${hubId}-${tagId}`, from: hubId, to: tagId, strength: 0.28 });
  });

  return { nodes, edges, memoryCount: active.length, nodeMap: new Map(nodes.map((node) => [node.id, node])) };
}

interface GalaxyCamera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function project(node: GalaxyNode, camera: GalaxyCamera) {
  const scale = 154 * camera.scale * (1 + node.z * 0.1);
  return {
    x: CENTER_X + node.x * scale + camera.offsetX,
    y: CENTER_Y + node.y * scale - node.z * 26 * camera.scale + camera.offsetY,
  };
}

function distanceBetweenTouches(touches: readonly any[]) {
  if (touches.length < 2) return null;
  const [first, second] = touches;
  const dx = second.pageX - first.pageX;
  const dy = second.pageY - first.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function orbitPoint(index: number, count: number, radius: number, yCompression = 0.78, depthAmount = 0.42) {
  const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2;
  const stagger = index % 2 === 0 ? 1 : 1.18;
  return { x: Math.cos(angle) * radius * stagger, y: Math.sin(angle) * radius * yCompression * stagger, z: Math.sin(angle * 1.7) * depthAmount };
}

function moonPoint(index: number, count: number, center: { x: number; y: number; z: number }, radius: number) {
  const ring = Math.floor(index / 9);
  const ringIndex = index % 9;
  const ringCount = Math.min(9, Math.max(1, count - ring * 9));
  const angle = -Math.PI / 2 + (ringIndex / ringCount) * Math.PI * 2 + ring * 0.38;
  const ringRadius = radius + ring * 0.24;
  return { x: center.x + Math.cos(angle) * ringRadius, y: center.y + Math.sin(angle) * ringRadius * 0.72, z: center.z - 0.16 + Math.sin(angle * 1.4) * 0.1 };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item).trim() || 'General';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function topValues(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value.replace(/^#/, ''), (counts.get(value.replace(/^#/, '')) || 0) + 1));
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function galaxyTitle(memory: MemoryItem) {
  return memory.title || memory.summary || memory.rawText?.slice(0, 42) || 'Untitled';
}

function preview(memory: MemoryItem) {
  return memory.cleanText || memory.rawText || memory.body || memory.summary || memory.title || 'No preview available.';
}

function normalizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

function nodeColor(kind: GalaxyNodeKind) {
  if (kind === 'hub') return '#7B3FF2';
  if (kind === 'concept') return '#FF2D8E';
  if (kind === 'tag') return '#FF8A00';
  return '#EF6359';
}

function nodeIcon(kind: GalaxyNodeKind): keyof typeof Ionicons.glyphMap {
  if (kind === 'hub') return 'planet';
  if (kind === 'concept') return 'prism';
  if (kind === 'tag') return 'pricetag';
  return 'document-text';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF6FF' },
  rootDark: { backgroundColor: '#030108' },
  header: { paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE0F5', alignItems: 'center', justifyContent: 'center' },
  headerIconDark: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' },
  title: { flex: 1, color: '#16121E', textAlign: 'center', fontSize: 20, fontWeight: '900' },
  titleDark: { color: '#FFFFFF' },
  scopeButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE0F5', alignItems: 'center', justifyContent: 'center' },
  scopeButtonDark: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' },
  filters: { paddingHorizontal: 18, paddingTop: 14, gap: 8 },
  filterChip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#E6D9EF', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterChipDark: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' },
  filterChipActive: { backgroundColor: '#7B3FF2', borderColor: '#7B3FF2' },
  filterText: { color: '#655C57', fontWeight: '800' },
  filterTextDark: { color: '#D8D0E2' },
  filterTextActive: { color: '#fff' },
  statsPill: { alignSelf: 'flex-start', marginLeft: 18, marginTop: 12, borderRadius: 18, backgroundColor: 'rgba(123,63,242,0.14)', borderWidth: 1, borderColor: 'rgba(123,63,242,0.22)', paddingHorizontal: 14, paddingVertical: 9 },
  statsPillDark: { backgroundColor: 'rgba(123,63,242,0.22)', borderColor: 'rgba(255,255,255,0.14)' },
  statsText: { color: '#39235D', fontWeight: '900' },
  statsTextDark: { color: '#EEE7FF' },
  canvas: { flex: 1, minHeight: CANVAS_HEIGHT, position: 'relative', overflow: 'hidden' },
  loader: { marginTop: 180 },
  edge: { position: 'absolute', height: 2, backgroundColor: '#8F6DE8', transformOrigin: 'left center' },
  node: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, shadowColor: '#7B3FF2', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  nodeDark: { shadowOpacity: 0.38 },
  nodeLabel: { color: '#fff', fontSize: 8, fontWeight: '900', marginTop: 2, maxWidth: 64, textAlign: 'center' },
  empty: { marginTop: 150, paddingHorizontal: 34, alignItems: 'center' },
  emptyTitle: { color: '#16121E', fontSize: 22, fontWeight: '900' },
  emptyBody: { color: '#6B6075', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBodyDark: { color: '#BDB3C8' },
  detailCard: { position: 'absolute', left: 18, right: 18, bottom: 0, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#EEE2F5', padding: 14 },
  detailCardDark: { backgroundColor: 'rgba(14,8,23,0.92)', borderColor: 'rgba(255,255,255,0.14)' },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailText: { flex: 1 },
  detailTitle: { color: '#16121E', fontWeight: '900', fontSize: 16 },
  detailSub: { color: '#6B6075', marginTop: 2, fontWeight: '700', fontSize: 12 },
  detailBody: { color: '#312A38', marginTop: 10, lineHeight: 19 },
  detailBodyDark: { color: '#E8DFEF' },
  openMemory: { marginTop: 12, height: 40, borderRadius: 13, backgroundColor: '#7B3FF2', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  openMemoryText: { color: '#fff', fontWeight: '900' },
});
