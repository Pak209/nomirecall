const assert = require('node:assert/strict');
const test = require('node:test');

const { answerQuestionFromMemories } = require('../src/ai/queryMemories');

const previousOpenAIKey = process.env.OPENAI_API_KEY;
const previousNomiOpenAIKey = process.env.NOMI_OPENAI_API_KEY;

test.before(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.NOMI_OPENAI_API_KEY;
});

test.after(() => {
  if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKey;
  if (previousNomiOpenAIKey === undefined) delete process.env.NOMI_OPENAI_API_KEY;
  else process.env.NOMI_OPENAI_API_KEY = previousNomiOpenAIKey;
});

function memoryStore(memories) {
  return {
    async listSources() {
      return memories;
    },
  };
}

const memories = [
  {
    id: 'mem-atlas-pricing',
    title: 'Atlas pricing research',
    rawText: 'Atlas pricing should include a team tier and beta discount notes.',
    tags: ['atlas', 'pricing'],
    concepts: ['SaaS pricing'],
    projectIds: ['project-atlas'],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'mem-atlas-onboarding',
    title: 'Atlas onboarding plan',
    rawText: 'Design partner onboarding needs welcome email drafts and setup calls.',
    tags: ['atlas', 'onboarding'],
    projectIds: ['project-atlas'],
    createdAt: '2026-05-02T00:00:00.000Z',
  },
  {
    id: 'mem-personal-travel',
    title: 'Tokyo travel ideas',
    rawText: 'A ramen route and neighborhood walking list for Tokyo.',
    tags: ['travel'],
    projectIds: ['project-travel'],
    createdAt: '2026-05-03T00:00:00.000Z',
  },
];

test('brain query still answers globally without project scope', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
  });

  assert.equal(result.retrievalMode, 'keyword-semantic-lite');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].memoryId, 'mem-personal-travel');
  assert.equal(result.scope, undefined);
});

test('project-scoped brain query returns project-linked memories', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.equal(result.scope.type, 'project');
  assert.equal(result.scope.projectId, 'project-atlas');
  assert.equal(result.scope.projectTitle, 'Atlas Launch');
  assert.equal(result.sources[0].memoryId, 'mem-atlas-pricing');
  assert.match(result.sources[0].relevanceReason, /Linked to project/);
});

test('project-scoped brain query does not return unrelated project memories by default', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.confidence, 'low');
  assert.match(result.answer, /in this project/i);
});

test('cross-user project scope cannot leak another user project memories', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What is the Atlas pricing plan?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    project: {
      id: 'project-atlas',
      userId: 'user-2',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing'],
    },
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.confidence, 'low');
  assert.match(result.answer, /in this project/i);
});

test('project-scoped brain query can use explicit global fallback', async () => {
  const result = await answerQuestionFromMemories('user-1', 'What do I know about Tokyo?', {
    store: memoryStore(memories),
    projectId: 'project-atlas',
    allowGlobalFallback: true,
    project: {
      id: 'project-atlas',
      userId: 'user-1',
      name: 'Atlas Launch',
      memoryIds: ['mem-atlas-pricing', 'mem-atlas-onboarding'],
    },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].memoryId, 'mem-personal-travel');
});
