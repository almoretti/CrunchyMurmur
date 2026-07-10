const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function standardPaths(platform = process.platform, env = process.env) {
  const home = env.HOME || env.USERPROFILE || '';
  const candidates = platform === 'win32'
    ? [
        path.join(env.ProgramFiles || 'C:\\Program Files', 'whisper.cpp', 'whisper-cli.exe'),
        path.join(env.LOCALAPPDATA || home, 'whisper.cpp', 'whisper-cli.exe'),
      ]
    : [
        '/opt/homebrew/bin/whisper-cli', // Homebrew on Apple Silicon
        '/usr/local/bin/whisper-cli',    // Homebrew on Intel Macs and common Unix installs
        '/usr/bin/whisper-cli',
        home && path.join(home, '.local', 'bin', 'whisper-cli'),
      ];

  const names = platform === 'win32' ? ['whisper-cli.exe', 'whisper-cli'] : ['whisper-cli'];
  for (const directory of String(env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) candidates.push(path.join(directory, name));
  }
  return [...new Set(candidates.filter(Boolean))];
}

function validateWhisperCli(cliPath, { statSync = fs.statSync, run = spawnSync, platform = process.platform } = {}) {
  if (!cliPath) return { valid: false, reason: 'No whisper-cli path selected.' };
  try {
    const stat = statSync(cliPath);
    if (!stat.isFile()) return { valid: false, reason: 'The selected whisper-cli path is not a file.' };
    if (platform !== 'win32' && !(stat.mode & 0o111)) return { valid: false, reason: 'The selected whisper-cli is not executable.' };
  } catch {
    return { valid: false, reason: 'The selected whisper-cli file was not found.' };
  }

  const result = run(cliPath, ['--version'], { encoding: 'utf8', timeout: 5_000, windowsHide: true });
  if (result.error || result.status !== 0) {
    return { valid: false, reason: 'The selected executable did not respond to whisper-cli --version.' };
  }
  const version = String(result.stdout || result.stderr || '').trim().split('\n')[0];
  return { valid: true, path: cliPath, version: version || 'whisper-cli detected' };
}

function discoverWhisperCli(options = {}) {
  const candidates = standardPaths(options.platform, options.env);
  const validate = options.validate || ((candidate) => validateWhisperCli(candidate, options));
  for (const candidate of candidates) {
    const result = validate(candidate);
    if (result.valid) return { ...result, discovered: true };
  }
  return { valid: false, discovered: false, reason: 'whisper-cli was not found in standard install locations.' };
}

module.exports = { standardPaths, validateWhisperCli, discoverWhisperCli };
