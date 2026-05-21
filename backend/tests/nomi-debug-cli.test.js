const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildRequestPath,
  parseArgs,
  requestJson,
  truncate,
} = require('../scripts/nomi-debug');

test('nomi debug CLI parses npm-style args', () => {
  const args = parseArgs(['brain', '--question=What about pricing?', '--projectId', 'project-1', '--json']);
  assert.deepEqual(args, {
    _: ['brain'],
    question: 'What about pricing?',
    projectId: 'project-1',
    json: true,
  });
});

test('nomi debug CLI builds debug endpoint paths safely', () => {
  assert.equal(
    buildRequestPath('brain', { question: 'What about pricing?', projectId: 'project 1' }),
    '/api/debug/brain/query-trace?question=What+about+pricing%3F&projectId=project+1',
  );
  assert.equal(
    buildRequestPath('chunks', { memoryId: 'memory/1' }),
    '/api/debug/memories/memory%2F1/chunks',
  );
  assert.equal(
    buildRequestPath('topic', { topicPageId: 'topic/1' }),
    '/api/debug/topic-pages/topic%2F1',
  );
});

test('nomi debug CLI requires auth token without printing token material', async () => {
  await assert.rejects(
    () => requestJson('/api/debug/topic-pages', { NOMI_API_BASE_URL: 'http://localhost:3000' }),
    /Missing NOMI_DEBUG_AUTH_TOKEN/,
  );
});

test('nomi debug CLI truncates previews', () => {
  const value = truncate('a '.repeat(100), 20);
  assert.equal(value.length <= 20, true);
  assert.match(value, /\.\.\.$/);
});
