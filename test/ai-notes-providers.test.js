const test = require('node:test');
const assert = require('node:assert/strict');

const subprocess = require('../src/providers/subprocess');
const claudeCode = require('../src/providers/claude-code');
const codex = require('../src/providers/codex');

test('Claude Code receives explicit model and effort settings', async (t) => {
  t.mock.method(subprocess, 'locate', () => 'claude');
  t.mock.method(subprocess, 'run', async options => {
    assert.deepEqual(options.args.slice(-4), ['--model', 'sonnet', '--effort', 'low']);
    return { exitCode: 0, stdout: 'summary', stderr: '' };
  });
  assert.equal(await claudeCode.generate({ prompt: 'notes', model: 'sonnet', effort: 'low' }), 'summary');
});

test('Codex receives explicit model and reasoning effort settings', async (t) => {
  t.mock.method(subprocess, 'locate', () => 'codex');
  t.mock.method(subprocess, 'run', async options => {
    assert.deepEqual(options.args.slice(-4), ['--model', 'gpt-test', '--config', 'model_reasoning_effort="high"']);
    return { exitCode: 0, stdout: 'summary', stderr: '' };
  });
  assert.equal(await codex.generate({ prompt: 'notes', model: 'gpt-test', reasoningEffort: 'high' }), 'summary');
});

test('unsupported effort values are not forwarded to CLIs', async (t) => {
  t.mock.method(subprocess, 'locate', name => name);
  t.mock.method(subprocess, 'run', async options => {
    assert.equal(options.args.includes('maximum'), false);
    return { exitCode: 0, stdout: 'summary', stderr: '' };
  });
  await claudeCode.generate({ prompt: 'notes', effort: 'maximum' });
  await codex.generate({ prompt: 'notes', reasoningEffort: 'maximum' });
});
