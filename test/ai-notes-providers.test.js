const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const subprocess = require('../src/providers/subprocess');
const claudeCode = require('../src/providers/claude-code');
const codex = require('../src/providers/codex');

test('Codex models come from its visible client cache', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-codex-models-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.codex', 'models_cache.json'), JSON.stringify({ models: [
    { slug: 'new-model', display_name: 'New Model', visibility: 'list', priority: 1, default_reasoning_level: 'high', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
    { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hide', priority: 0 },
  ] }));
  const models = codex.models(home);
  assert.deepEqual(models.map(model => model.id), ['', 'new-model']);
  assert.deepEqual(models[1].efforts, ['low', 'high']);
  assert.equal(models[1].defaultEffort, 'high');
});

test('Claude models honor its configured model and allowlist', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-claude-models-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
    model: 'claude-current', availableModels: ['claude-allowed'],
  }));
  assert.deepEqual(claudeCode.models(home).map(model => model.id), ['', 'claude-current', 'claude-allowed']);
});

test('Claude model discovery does not depend on the app launch directory', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-claude-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-claude-project-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.claude'));
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ model: 'global-model' }));
  fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), JSON.stringify({ model: 'local-model' }));
  assert.equal(claudeCode.models(home)[1].id, 'global-model');
});

test('Codex fallback exposes only supported reasoning efforts', () => {
  assert.deepEqual(codex.REASONING_EFFORTS, ['minimal', 'low', 'medium', 'high', 'xhigh']);
});

test('Codex falls back to the selected model default when effort is unsupported', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-codex-effort-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.codex', 'models_cache.json'), JSON.stringify({ models: [{
    slug: 'new-model', visibility: 'list', default_reasoning_level: 'high',
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
  }] }));
  assert.equal(codex.resolveReasoningEffort('new-model', 'medium', home), 'high');
  assert.equal(codex.resolveReasoningEffort('new-model', 'low', home), 'low');
});

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
  assert.equal(await codex.generate({ prompt: 'notes', model: 'gpt-test', effort: 'high' }), 'summary');
});

test('unsupported effort values are not forwarded to CLIs', async (t) => {
  t.mock.method(subprocess, 'locate', name => name);
  t.mock.method(subprocess, 'run', async options => {
    assert.equal(options.args.includes('maximum'), false);
    return { exitCode: 0, stdout: 'summary', stderr: '' };
  });
  await claudeCode.generate({ prompt: 'notes', effort: 'maximum' });
  await codex.generate({ prompt: 'notes', effort: 'maximum' });
});
