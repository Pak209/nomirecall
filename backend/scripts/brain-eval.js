#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const {
  requestJson,
  truncate,
  parseArgs,
} = require('./nomi-debug');

dotenv.config();

const DEFAULT_EVAL_FILE = path.join(__dirname, '..', 'evals', 'brain-eval-questions.json');

function asArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function readEvalFile(filePath = DEFAULT_EVAL_FILE) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`Eval file must contain a JSON array: ${resolved}`);
  return parsed.map((item, index) => {
    if (!item || typeof item.question !== 'string' || !item.question.trim()) {
      throw new Error(`Eval item ${index + 1} is missing a question.`);
    }
    return {
      question: item.question.trim(),
      expectedMemoryIds: asArray(item.expectedMemoryIds),
      expectedProjectId: item.expectedProjectId || item.projectId || null,
      notes: item.notes || '',
      limit: item.limit,
    };
  });
}

function buildTracePath(item) {
  const search = new URLSearchParams();
  search.set('question', item.question);
  if (item.expectedProjectId) search.set('projectId', item.expectedProjectId);
  if (item.limit) search.set('limit', item.limit);
  return `/api/debug/brain/query-trace?${search.toString()}`;
}

function statusForExpected(expectedMemoryIds, top3, top5) {
  const expected = asArray(expectedMemoryIds);
  if (!expected.length) return 'needs-review';
  const allInTop3 = expected.every((memoryId) => top3.includes(memoryId));
  const allInTop5 = expected.every((memoryId) => top5.includes(memoryId));
  if (allInTop3) return 'pass';
  if (allInTop5) return 'needs-review';
  return 'fail';
}

function evaluateTrace(item, trace = {}) {
  const candidates = Array.isArray(trace.candidates) ? trace.candidates : [];
  const topMemoryIds = candidates.map((candidate) => candidate.memoryId).filter(Boolean);
  const top3 = topMemoryIds.slice(0, 3);
  const top5 = topMemoryIds.slice(0, 5);
  const expectedMemoryIds = asArray(item.expectedMemoryIds);
  const expectedInTop3 = expectedMemoryIds.filter((memoryId) => top3.includes(memoryId));
  const expectedInTop5 = expectedMemoryIds.filter((memoryId) => top5.includes(memoryId));

  return {
    question: item.question,
    notes: item.notes || '',
    expectedMemoryIds,
    expectedProjectId: item.expectedProjectId || null,
    retrievalMode: trace.retrievalMode,
    fallbackUsed: trace.fallbackUsed === true,
    scope: trace.scope,
    candidateCount: trace.candidateCount,
    matchedChunkCount: trace.matchedChunkCount,
    returnedCount: trace.returnedCount,
    topMemoryIds,
    expectedInTop3,
    expectedInTop5,
    status: statusForExpected(expectedMemoryIds, top3, top5),
    candidates: candidates.slice(0, 5).map((candidate, index) => ({
      rank: index + 1,
      memoryId: candidate.memoryId,
      title: candidate.title,
      finalScore: candidate.finalScore,
      semanticScore: candidate.semanticScore,
      keywordScore: candidate.keywordScore,
      metadataScore: candidate.metadataScore,
      relevanceReason: candidate.relevanceReason,
      snippet: truncate(candidate.snippet, 180),
    })),
  };
}

function printCandidateRows(candidates = []) {
  if (!candidates.length) {
    console.log('  (no returned candidates)');
    return;
  }
  for (const candidate of candidates) {
    const scores = [
      `final=${candidate.finalScore ?? '-'}`,
      `semantic=${candidate.semanticScore ?? '-'}`,
      `keyword=${candidate.keywordScore ?? '-'}`,
      `metadata=${candidate.metadataScore ?? '-'}`,
    ].join(' ');
    console.log(`  ${candidate.rank}. ${candidate.memoryId} | ${candidate.title || 'Untitled'} | ${scores}`);
    if (candidate.relevanceReason) console.log(`     reason: ${truncate(candidate.relevanceReason, 160)}`);
    if (candidate.snippet) console.log(`     snippet: ${candidate.snippet}`);
  }
}

function formatEvalResult(result) {
  const scope = result.scope
    ? `${result.scope.type}:${result.scope.projectTitle || result.scope.projectId}`
    : (result.expectedProjectId ? `project:${result.expectedProjectId}` : 'global');
  const lines = [
    `Question: ${result.question}`,
    `Status: ${result.status}`,
    `Retrieval: ${result.retrievalMode || '-'} | fallback=${result.fallbackUsed} | scope=${scope}`,
    `Counts: candidates=${result.candidateCount ?? '-'} chunks=${result.matchedChunkCount ?? '-'} returned=${result.returnedCount ?? '-'}`,
    `Expected: ${result.expectedMemoryIds.length ? result.expectedMemoryIds.join(', ') : '(none configured)'}`,
    `Top IDs: ${result.topMemoryIds.length ? result.topMemoryIds.slice(0, 5).join(', ') : '-'}`,
    `Expected in top 3: ${result.expectedInTop3.length ? result.expectedInTop3.join(', ') : '-'}`,
    `Expected in top 5: ${result.expectedInTop5.length ? result.expectedInTop5.join(', ') : '-'}`,
  ];
  if (result.notes) lines.push(`Notes: ${result.notes}`);
  return lines.join('\n');
}

async function runEval(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const questions = readEvalFile(args.file || DEFAULT_EVAL_FILE);
  const results = [];

  for (const item of questions) {
    const trace = await requestJson(buildTracePath(item), env);
    results.push(evaluateTrace(item, trace));
  }

  if (args.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return results;
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Brain retrieval eval: ${results.length} question(s)`);
  console.log(`pass=${counts.pass || 0} needs-review=${counts['needs-review'] || 0} fail=${counts.fail || 0}`);
  for (const result of results) {
    console.log('\n---');
    console.log(formatEvalResult(result));
    console.log('Top candidates:');
    printCandidateRows(result.candidates);
  }
  return results;
}

if (require.main === module) {
  runEval().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_EVAL_FILE,
  buildTracePath,
  evaluateTrace,
  formatEvalResult,
  readEvalFile,
  runEval,
  statusForExpected,
};
