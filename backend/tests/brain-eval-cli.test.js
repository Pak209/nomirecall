const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildTracePath,
  evaluateTrace,
  formatEvalResult,
  statusForExpected,
} = require('../scripts/brain-eval');

test('brain eval trace path includes question and project scope', () => {
  const path = buildTracePath({
    question: 'What have I saved about pricing?',
    expectedProjectId: 'project-atlas',
    limit: 5,
  });
  assert.match(path, /^\/api\/debug\/brain\/query-trace\?/);
  assert.match(path, /question=What\+have\+I\+saved\+about\+pricing/);
  assert.match(path, /projectId=project-atlas/);
  assert.match(path, /limit=5/);
});

test('brain eval statuses expected memories in top results', () => {
  assert.equal(statusForExpected([], ['a'], ['a']), 'needs-review');
  assert.equal(statusForExpected(['a'], ['a', 'b'], ['a', 'b']), 'pass');
  assert.equal(statusForExpected(['d'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']), 'needs-review');
  assert.equal(statusForExpected(['z'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']), 'fail');
});

test('brain eval summarizes retrieval trace without raw text', () => {
  const result = evaluateTrace({
    question: 'What pricing notes did I save?',
    expectedMemoryIds: ['mem-pricing'],
    notes: 'Should find pricing notes.',
  }, {
    retrievalMode: 'hybrid-embedding',
    fallbackUsed: false,
    candidateCount: 4,
    matchedChunkCount: 2,
    returnedCount: 2,
    candidates: [
      {
        memoryId: 'mem-pricing',
        title: 'Pricing plan',
        finalScore: 82,
        semanticScore: 0.8,
        keywordScore: 1,
        metadataScore: 0.4,
        relevanceReason: 'Matched embedded memory chunk',
        snippet: 'Team tier pricing notes.',
      },
      { memoryId: 'mem-other', title: 'Other', finalScore: 34 },
    ],
  });

  assert.equal(result.status, 'pass');
  assert.deepEqual(result.expectedInTop3, ['mem-pricing']);
  assert.equal(result.candidates[0].memoryId, 'mem-pricing');
  assert.match(formatEvalResult(result), /Status: pass/);
});
