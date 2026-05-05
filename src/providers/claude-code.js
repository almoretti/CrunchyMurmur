// Generates notes by spawning the user's installed `claude` CLI.
// Uses the user's Claude Code subscription, so no API key needed.
const sub = require('./subprocess');

let cachedExe = null;
let cachedAt = 0;

function executable() {
  // Re-check every ~30 s — cheap enough, and accounts for the user installing
  // the CLI without restarting the app.
  if (cachedExe && Date.now() - cachedAt < 30_000) return cachedExe;
  cachedExe = sub.locate('claude');
  cachedAt = Date.now();
  return cachedExe;
}

function isAvailable() {
  return Boolean(executable());
}

async function generate({ prompt }) {
  const exe = executable();
  if (!exe) {
    const err = new Error('claude CLI not found on PATH. Install Claude Code and re-launch CrunchyMurmur.');
    err.code = 'cli-missing';
    throw err;
  }
  // -p / --print: one-shot mode, prints response and exits.
  // Prompt over stdin to avoid ARG_MAX and to keep transcripts off the
  // process command-line listing.
  const result = await sub.run({ executable: exe, args: ['-p'], stdinText: prompt });
  if (result.exitCode !== 0) {
    const raw = result.stderr || result.stdout || '(no output)';
    const snippet = raw.length > 280 ? raw.slice(0, 280) + '…' : raw;
    throw new Error(`Claude Code exited ${result.exitCode}: ${snippet}`);
  }
  const text = result.stdout.trim();
  if (!text) throw new Error('Claude Code returned an empty response.');
  return text;
}

module.exports = { generate, isAvailable, executable, displayName: 'Claude Code' };
