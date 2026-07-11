const test = require('node:test');
const assert = require('node:assert/strict');

const anthropic = require('../src/providers/anthropic');
const openai = require('../src/providers/openai');
const groq = require('../src/providers/groq');
const catalog = require('../src/providers/model-catalog');

function mockResponse(data) {
  return { ok: true, async json() { return { data }; } };
}

test('Anthropic discovers Claude models with the configured key', async t => {
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.match(url, /anthropic\.com\/v1\/models/);
    assert.equal(options.headers['x-api-key'], 'anthropic-key');
    return mockResponse([{ id: 'claude-new', display_name: 'Claude New' }, { id: 'not-claude' }]);
  });
  assert.deepEqual(await anthropic.listModels('anthropic-key'), [{ id: 'claude-new', label: 'Claude New' }]);
});

test('OpenAI excludes non-text and specialized models', async t => {
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(options.headers.authorization, 'Bearer openai-key');
    return mockResponse([
      { id: 'gpt-5.6' }, { id: 'gpt-4o-realtime-preview' },
      { id: 'text-embedding-3-small' }, { id: 'gpt-image-2' },
    ]);
  });
  assert.deepEqual(await openai.listModels('openai-key'), [{ id: 'gpt-5.6', label: 'gpt-5.6' }]);
});

test('Groq returns only active generative text models', async t => {
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/models');
    assert.equal(options.headers.authorization, 'Bearer groq-key');
    return mockResponse([
      { id: 'qwen/new-text-model', active: true },
      { id: 'whisper-large-v3', active: true },
      { id: 'old-text-model', active: false },
    ]);
  });
  assert.deepEqual(await groq.listModels('groq-key'), [{ id: 'qwen/new-text-model', label: 'qwen/new-text-model' }]);
});

test('API providers retain fallback catalogs without credentials', async () => {
  assert.deepEqual(await anthropic.listModels(''), anthropic.MODELS);
  assert.deepEqual(await openai.listModels(''), openai.MODELS);
  assert.deepEqual(await groq.listModels(''), groq.MODELS);
});

test('model catalog rejects non-successful HTTP responses', async t => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(catalog.fetchModelList({ url: 'https://example.test/models' }), /Model catalog HTTP 503/);
});

test('model catalog propagates malformed JSON errors', async t => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    async json() { throw new SyntaxError('Unexpected token'); },
  }));
  await assert.rejects(catalog.fetchModelList({ url: 'https://example.test/models' }), SyntaxError);
});

test('model catalog aborts a request after its timeout', async t => {
  t.mock.method(global, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }));
  await assert.rejects(catalog.fetchModelList({ url: 'https://example.test/models', timeoutMs: 1 }), { name: 'AbortError' });
});
