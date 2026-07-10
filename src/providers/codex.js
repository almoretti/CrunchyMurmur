// Generates notes by spawning the user's installed `codex` CLI.
// Uses the user's Codex subscription, so no API key needed.
const sub = require('./subprocess');

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

async function generate({ prompt }) {
  const exe = executable();
  if (!exe) {
    const err = new Error('codex CLI not found on PATH. Install OpenAI Codex and re-launch CrunchyMurmur.');
    err.code = 'cli-missing';
    throw err;
  }
  // `codex exec` is the non-interactive mode; reads instructions from stdin
  // when no positional prompt is given.
  const result = await sub.run({
    executable: exe,
    args: ['exec', '--sandbox', 'read-only', '--skip-git-repo-check'],
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

module.exports = { generate, isAvailable, executable, displayName: 'Codex' };
