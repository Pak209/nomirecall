const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

// jwtSecret() runs at module load, so requiring the server with a bad
// JWT_SECRET must throw before anything else initializes. We spawn a child
// Node process that requires the server and assert on its exit status/output.
function requireServerWith(env) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SERVER_PATH)})`], {
    env: {
      ...process.env,
      // Keep Firebase off so the only failure mode under test is JWT_SECRET.
      FIREBASE_PROJECT_ID: '',
      FIREBASE_SERVICE_ACCOUNT_PATH: '',
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
      NODE_ENV: 'test',
      ...env,
    },
    encoding: 'utf8',
  });
}

test('server refuses to load when JWT_SECRET is unset', () => {
  const result = requireServerWith({ JWT_SECRET: '' });
  assert.notEqual(result.status, 0, 'process should exit non-zero when JWT_SECRET is unset');
  assert.match(result.stderr, /JWT_SECRET must be set/);
});

test('server refuses to load when JWT_SECRET is the placeholder value', () => {
  const result = requireServerWith({ JWT_SECRET: 'dev-secret-change-me' });
  assert.notEqual(result.status, 0, 'process should exit non-zero for the placeholder secret');
  assert.match(result.stderr, /JWT_SECRET must be set/);
});

test('server loads when JWT_SECRET is a real value', () => {
  const result = requireServerWith({ JWT_SECRET: 'a-strong-test-secret' });
  assert.equal(result.status, 0, `expected clean load, got status ${result.status}: ${result.stderr}`);
});
