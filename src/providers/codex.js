// Generates notes by spawning the user's installed `codex` CLI.
// Uses the user's Codex subscription, so no API key needed.
const sub = require('./subprocess');
const fs = require('fs');
const path = require('path');
const os = require('os');

let cachedExe = null;
let cachedAt = 0;

function executable() {
  if (cachedExe && Date.now() - cachedAt < 30_000) return cachedExe;
  cachedExe = sub.locate('codex');
  cachedAt = Date.now();
  return cachedExe;
}

function isAvailable() {
  return Boolean(executable());
}

const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function modelsCachePath(home = os.homedir()) {
  return path.join(home, '.codex', 'models_cache.json');
}

function models(home = os.homedir()) {
  const fallback = [{ id: '', label: 'CLI default (recommended)', efforts: REASONING_EFFORTS }];
  try {
    const cache = JSON.parse(fs.readFileSync(modelsCachePath(home), 'utf8'));
    const visible = (cache.models || [])
      .filter(model => model?.slug && model.visibility !== 'hide')
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
      .map(model => ({
        id: model.slug,
        label: model.display_name || model.slug,
        description: model.description || '',
        efforts: (model.supported_reasoning_levels || []).map(level => level.effort).filter(Boolean),
        defaultEffort: model.default_reasoning_level || 'medium',
      }));
    return visible.length ? [fallback[0], ...visible] : fallback;
  } catch {
    return fallback;
  }
}

function resolveReasoningEffort(modelId, requested, home = os.homedir()) {
  const model = models(home).find(value => value.id === modelId);
  const supported = model?.efforts?.length ? model.efforts : REASONING_EFFORTS;
  if (supported.includes(requested)) return requested;
  if (model?.defaultEffort && supported.includes(model.defaultEffort)) return model.defaultEffort;
  return supported.includes('medium') ? 'medium' : supported[0];
}

async function generate({ prompt, model, effort = 'medium' }) {
  const exe = executable();
  if (!exe) {
    const err = new Error('codex CLI not found on PATH. Install OpenAI Codex and re-launch CrunchyMurmur.');
    err.code = 'cli-missing';
    throw err;
  }
  // `codex exec` is the non-interactive mode; reads instructions from stdin
  // when no positional prompt is given.
  const args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check'];
  if (model) args.push('--model', model);
  if (REASONING_EFFORTS.includes(effort)) args.push('--config', `model_reasoning_effort="${effort}"`);
  const result = await sub.run({
    executable: exe,
    args,
    stdinText: prompt,
    isolated: true,
  });
  if (result.exitCode !== 0) {
    const raw = result.stderr || result.stdout || '(no output)';
    const snippet = raw.length > 280 ? raw.slice(0, 280) + '…' : raw;
    throw new Error(`Codex exited ${result.exitCode}: ${snippet}`);
  }
  const text = result.stdout.trim();
  if (!text) throw new Error('Codex returned an empty response.');
  return text;
}

module.exports = { generate, isAvailable, executable, displayName: 'Codex', REASONING_EFFORTS, models, modelsCachePath, resolveReasoningEffort };
