const test = require('node:test');
const assert = require('node:assert/strict');

const groq = require('../src/providers/groq');
const anthropic = require('../src/providers/anthropic');
const formatter = require('../src/dictation-formatter');

test('returns raw text when AI formatting is disabled', async () => {
  assert.equal(await formatter.format('  hello world  ', { aiFormatEnabled: 'false' }), 'hello world');
});

test('does not silently use Anthropic when Groq is unavailable', async (t) => {
  let called = false;
  t.mock.method(anthropic, 'generate', async () => { called = true; return 'formatted'; });
  const result = await formatter.format('raw transcript', {
    aiFormatEnabled: 'true',
    anthropicApiKey: 'anthropic-key',
    aiFormatFallback: 'raw',
  });
  assert.equal(result, 'raw transcript');
  assert.equal(called, false);
});

test('uses Anthropic only when the fallback is explicitly selected', async (t) => {
  t.mock.method(anthropic, 'generate', async options => {
    assert.equal(options.apiKey, 'anthropic-key');
    assert.equal(options.model, 'claude-haiku-4-5');
    return 'formatted transcript';
  });
  const result = await formatter.format('raw transcript', {
    aiFormatEnabled: 'true',
    anthropicApiKey: 'anthropic-key',
    aiFormatFallback: 'anthropic',
  });
  assert.equal(result, 'formatted transcript');
});

test('prefers Groq when its key is configured', async (t) => {
  t.mock.method(groq, 'generate', async options => {
    assert.equal(options.model, 'qwen/qwen3-32b');
    return 'groq transcript';
  });
  const result = await formatter.format('raw transcript', {
    aiFormatEnabled: 'true',
    groqApiKey: 'groq-key',
    groqFormatModel: 'qwen/qwen3-32b',
    aiFormatFallback: 'anthropic',
    anthropicApiKey: 'anthropic-key',
  });
  assert.equal(result, 'groq transcript');
});
