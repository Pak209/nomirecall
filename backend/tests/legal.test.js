const test = require('node:test');
const assert = require('node:assert/strict');

const { privacyPolicyPage } = require('../src/legal');

test('privacy policy discloses that saved memory content is sent to OpenAI', () => {
  const html = privacyPolicyPage();

  assert.match(html, /OpenAI/);
  assert.match(
    html,
    /Nomi Recall uses OpenAI to help process the memories you save/,
  );
  assert.match(
    html,
    /its title, cleaned text content, source URL, author, and capture date are sent to OpenAI/,
  );
  assert.match(
    html,
    /generate a summary, category, tags, concepts, entities, and related insights/,
  );
  assert.match(html, /create embeddings that power search and recall/);
  assert.match(html, /answer questions you ask about your saved memories/);
  assert.match(
    html,
    /OpenAI processes this content under its own data retention and usage policies/,
  );
});
