#!/usr/bin/env node
const dotenv = require('dotenv');

dotenv.config();

const DEFAULT_BASE_URL = 'http://localhost:3000';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      args._.push(entry);
      continue;
    }

    const raw = entry.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex >= 0) {
      args[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[raw] = next;
      index += 1;
    } else {
      args[raw] = true;
    }
  }
  return args;
}

function truncate(value = '', maxLength = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function joinValues(values) {
  return Array.isArray(values) && values.length ? values.join(', ') : '-';
}

function printLine(label, value) {
  console.log(`${label}: ${value === undefined || value === null || value === '' ? '-' : value}`);
}

function printRows(rows, columns) {
  if (!rows.length) {
    console.log('  (none)');
    return;
  }

  const normalizedRows = rows.map((row) => columns.map((column) => String(column.value(row) ?? '')));
  const widths = columns.map((column, columnIndex) => Math.min(
    column.maxWidth || 40,
    Math.max(column.title.length, ...normalizedRows.map((row) => row[columnIndex].length)),
  ));

  const line = columns.map((column, index) => column.title.padEnd(widths[index])).join('  ');
  console.log(line);
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of normalizedRows) {
    console.log(row.map((value, index) => truncate(value, widths[index]).padEnd(widths[index])).join('  '));
  }
}

function formatQueryTrace(data) {
  printLine('Question', data.question);
  printLine('Retrieval mode', data.retrievalMode);
  printLine('Fallback used', data.fallbackUsed);
  printLine('Scope', data.scope ? `${data.scope.type}:${data.scope.projectTitle || data.scope.projectId}` : 'global');
  printLine('Candidate count', data.candidateCount);
  printLine('Matched chunk count', data.matchedChunkCount);
  printLine('Returned count', data.returnedCount);
  printLine('Cited memory IDs', joinValues(data.citedMemoryIds));
  console.log('\nTop candidates');
  printRows((data.candidates || []).map((candidate, index) => ({ ...candidate, rank: index + 1 })), [
    { title: '#', maxWidth: 3, value: (row) => row.rank },
    { title: 'memoryId', maxWidth: 24, value: (row) => row.memoryId },
    { title: 'title', maxWidth: 28, value: (row) => row.title },
    { title: 'final', maxWidth: 8, value: (row) => row.finalScore },
    { title: 'semantic', maxWidth: 9, value: (row) => row.semanticScore ?? '-' },
    { title: 'keyword', maxWidth: 8, value: (row) => row.keywordScore ?? '-' },
    { title: 'metadata', maxWidth: 9, value: (row) => row.metadataScore ?? '-' },
    { title: 'reason', maxWidth: 42, value: (row) => row.relevanceReason },
    { title: 'snippet', maxWidth: 60, value: (row) => row.snippet },
  ]);

  if (Array.isArray(data.matchedChunks) && data.matchedChunks.length) {
    console.log('\nMatched chunks');
    printRows(data.matchedChunks.slice(0, 10).map((chunk, index) => ({ ...chunk, rank: index + 1 })), [
      { title: '#', maxWidth: 3, value: (row) => row.rank },
      { title: 'memoryId', maxWidth: 24, value: (row) => row.memoryId },
      { title: 'chunkId', maxWidth: 30, value: (row) => row.chunkId },
      { title: 'final', maxWidth: 8, value: (row) => row.finalScore },
      { title: 'semantic', maxWidth: 9, value: (row) => row.semanticScore },
      { title: 'preview', maxWidth: 70, value: (row) => row.chunkTextPreview },
    ]);
  }
}

function formatChunks(data) {
  printLine('Memory ID', data.memoryId);
  printLine('Chunk count', (data.chunks || []).length);
  console.log('\nChunks');
  printRows(data.chunks || [], [
    { title: 'index', maxWidth: 6, value: (row) => row.chunkIndex },
    { title: 'chunkId', maxWidth: 34, value: (row) => row.chunkId },
    { title: 'status', maxWidth: 14, value: (row) => row.embeddingStatus },
    { title: 'model', maxWidth: 24, value: (row) => row.embeddingModel || '-' },
    { title: 'embeddedAt', maxWidth: 24, value: (row) => row.embeddedAt || '-' },
    { title: 'preview', maxWidth: 72, value: (row) => row.chunkTextPreview },
  ]);
}

function formatEdges(data) {
  printLine('Memory ID', data.memoryId);
  printLine('Edge count', (data.edges || []).length);
  console.log('\nEdges');
  printRows(data.edges || [], [
    { title: 'connected', maxWidth: 32, value: (row) => `${row.connectedMemoryTitle || 'Untitled'} (${row.connectedMemoryId})` },
    { title: 'score', maxWidth: 8, value: (row) => row.score ?? '-' },
    { title: 'confidence', maxWidth: 10, value: (row) => row.confidence || '-' },
    { title: 'reasonTypes', maxWidth: 34, value: (row) => joinValues(row.reasonTypes) },
    { title: 'tags', maxWidth: 22, value: (row) => joinValues(row.sharedTags) },
    { title: 'concepts', maxWidth: 26, value: (row) => joinValues(row.sharedConcepts) },
    { title: 'entities', maxWidth: 24, value: (row) => joinValues(row.sharedEntities) },
    { title: 'projects', maxWidth: 24, value: (row) => joinValues(row.sharedProjects) },
    { title: 'semantic', maxWidth: 9, value: (row) => row.semanticSimilarity ?? '-' },
    { title: 'evidence', maxWidth: 60, value: (row) => joinValues(row.evidencePreview) },
  ]);
}

function formatTopics(data) {
  const topics = data.topicPages || [];
  printLine('Topic page count', topics.length);
  console.log('\nTopic pages');
  printRows(topics, [
    { title: 'topicPageId', maxWidth: 26, value: (row) => row.topicPageId },
    { title: 'title', maxWidth: 28, value: (row) => row.title },
    { title: 'sources', maxWidth: 7, value: (row) => row.sourceCount },
    { title: 'status', maxWidth: 12, value: (row) => row.synthesisStatus },
    { title: 'lastSynthesizedAt', maxWidth: 24, value: (row) => row.lastSynthesizedAt || '-' },
    { title: 'concepts/entities/projects', maxWidth: 42, value: (row) => joinValues([...(row.concepts || []), ...(row.entities || []), ...(row.projects || [])]) },
    { title: 'summary', maxWidth: 70, value: (row) => row.summary },
  ]);
}

function formatTopic(data) {
  const topic = data.topicPage;
  if (!topic) {
    console.log('Topic page not found.');
    return;
  }
  printLine('Topic page ID', topic.topicPageId);
  printLine('Title', topic.title);
  printLine('Source count', topic.sourceCount);
  printLine('Status', topic.synthesisStatus);
  printLine('Last synthesized', topic.lastSynthesizedAt);
  printLine('Concepts', joinValues(topic.concepts));
  printLine('Entities', joinValues(topic.entities));
  printLine('Projects', joinValues(topic.projects));
  printLine('Related memories', joinValues(topic.relatedMemoryIds));
  printLine('Related edges', joinValues(topic.relatedEdgeIds));
  console.log('\nSummary');
  console.log(truncate(topic.summary, 900) || '-');
  console.log('\nKey ideas');
  (topic.keyIdeas || []).forEach((idea, index) => console.log(`${index + 1}. ${truncate(idea, 220)}`));
}

function formatterFor(command) {
  switch (command) {
    case 'brain': return formatQueryTrace;
    case 'chunks': return formatChunks;
    case 'edges': return formatEdges;
    case 'topics': return formatTopics;
    case 'topic': return formatTopic;
    default: return null;
  }
}

function usage() {
  return [
    'Nomi debug CLI',
    '',
    'Required env:',
    '  NOMI_DEBUG_AUTH_TOKEN=<Firebase ID token or dev bearer token>',
    'Optional env:',
    `  NOMI_API_BASE_URL=${DEFAULT_BASE_URL}`,
    '',
    'Commands:',
    '  npm run debug:brain -- --question="What have I saved about pricing?"',
    '  npm run debug:chunks -- --memoryId=MEMORY_ID',
    '  npm run debug:edges -- --memoryId=MEMORY_ID',
    '  npm run debug:topics',
    '  npm run debug:topic -- --topicPageId=TOPIC_PAGE_ID',
    '',
    'Options:',
    '  --projectId=PROJECT_ID',
    '  --json',
  ].join('\n');
}

function buildRequestPath(command, args) {
  const search = new URLSearchParams();
  switch (command) {
    case 'brain':
      if (!args.question) throw new Error('Missing --question for debug:brain.');
      search.set('question', args.question);
      if (args.projectId) search.set('projectId', args.projectId);
      if (args.limit) search.set('limit', args.limit);
      return `/api/debug/brain/query-trace?${search.toString()}`;
    case 'chunks':
      if (!args.memoryId) throw new Error('Missing --memoryId for debug:chunks.');
      return `/api/debug/memories/${encodeURIComponent(args.memoryId)}/chunks`;
    case 'edges':
      if (!args.memoryId) throw new Error('Missing --memoryId for debug:edges.');
      return `/api/debug/memories/${encodeURIComponent(args.memoryId)}/edges`;
    case 'topics':
      return '/api/debug/topic-pages';
    case 'topic':
      if (!args.topicPageId) throw new Error('Missing --topicPageId for debug:topic.');
      return `/api/debug/topic-pages/${encodeURIComponent(args.topicPageId)}`;
    default:
      throw new Error(`Unknown debug command "${command || ''}".`);
  }
}

async function requestJson(path, env = process.env) {
  const token = env.NOMI_DEBUG_AUTH_TOKEN;
  if (!token) {
    throw new Error([
      'Missing NOMI_DEBUG_AUTH_TOKEN.',
      'Set it to a Firebase ID token or dev bearer token for the signed-in debug user.',
      'Example: NOMI_DEBUG_AUTH_TOKEN=<token> npm run debug:topics',
    ].join('\n'));
  }

  const baseUrl = (env.NOMI_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (error) {
    throw new Error(`Could not reach Nomi backend at ${baseUrl}. Is the backend running? (${error.message})`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || response.statusText || 'Request failed.';
    if (response.status === 401) throw new Error(`Authentication failed. Check NOMI_DEBUG_AUTH_TOKEN. (${message})`);
    if (response.status === 403 || response.status === 404) throw new Error(`Debug endpoint unavailable. Is ENABLE_NOMI_DEBUG=true on the backend? (${message})`);
    throw new Error(`Debug request failed with ${response.status}: ${message}`);
  }
  return payload;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || args.help) {
    console.log(usage());
    return;
  }

  const formatter = formatterFor(command);
  if (!formatter) throw new Error(`Unknown debug command "${command}".\n\n${usage()}`);
  const path = buildRequestPath(command, args);
  const payload = await requestJson(path, env);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  formatter(payload);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildRequestPath,
  formatChunks,
  formatEdges,
  formatQueryTrace,
  formatTopic,
  formatTopics,
  main,
  parseArgs,
  requestJson,
  truncate,
  usage,
};
