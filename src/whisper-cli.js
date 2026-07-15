const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function standardPaths(platform = process.platform, env = process.env) {
  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  const home = env.HOME || env.USERPROFILE || '';
  const candidates = platform === 'win32'
    ? [
        platformPath.join(env.ProgramFiles || 'C:\\Program Files', 'whisper.cpp', 'whisper-cli.exe'),
        platformPath.join(env.LOCALAPPDATA || home, 'whisper.cpp', 'whisper-cli.exe'),
      ]
    : [
        '/opt/homebrew/bin/whisper-cli', // Homebrew on Apple Silicon
        '/usr/local/bin/whisper-cli',    // Homebrew on Intel Macs and common Unix installs
        '/usr/bin/whisper-cli',
        home && platformPath.join(home, '.local', 'bin', 'whisper-cli'),
      ];

  const names = platform === 'win32' ? ['whisper-cli.exe', 'whisper-cli'] : ['whisper-cli'];
  for (const directory of String(env.PATH || '').split(platformPath.delimiter)) {
    if (!directory) continue;
    for (const name of names) candidates.push(platformPath.join(directory, name));
  }
  return [...new Set(candidates.filter(Boolean))];
}

function runVersion(cliPath, { spawnProcess = spawn } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawnProcess(cliPath, ['--version'], { windowsHide: true, timeout: 5_000 });
    } catch (error) {
      finish({ error, status: null, stdout, stderr });
      return;
    }
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => finish({ error, status: null, stdout, stderr }));
    child.once('close', (status) => finish({ status, stdout, stderr }));
  });
}

async function validateWhisperCli(cliPath, { stat = fs.promises.stat, run = runVersion, platform = process.platform } = {}) {
  if (!cliPath) return { valid: false, reason: 'No whisper-cli path selected.' };
  try {
    const file = await stat(cliPath);
    if (!file.isFile()) return { valid: false, reason: 'The selected whisper-cli path is not a file.' };
    if (platform !== 'win32' && !(file.mode & 0o111)) return { valid: false, reason: 'The selected whisper-cli is not executable.' };
  } catch {
    return { valid: false, reason: 'The selected whisper-cli file was not found.' };
  }

  const result = await run(cliPath);
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const currentCliWithoutVersionFlag = /unknown argument:\s*--version/i.test(combinedOutput)
    && /usage:.*whisper-cli/i.test(combinedOutput);
  if (result.error || (result.status !== 0 && !currentCliWithoutVersionFlag)) {
    return { valid: false, reason: 'The selected executable did not respond to whisper-cli --version.' };
  }
  const version = currentCliWithoutVersionFlag ? 'whisper-cli detected' : combinedOutput.split('\n')[0];
  return { valid: true, path: cliPath, version: version || 'whisper-cli detected' };
}

async function discoverWhisperCli(options = {}) {
  const candidates = standardPaths(options.platform, options.env);
  const validate = options.validate || ((candidate) => validateWhisperCli(candidate, options));
  for (const candidate of candidates) {
    const result = await validate(candidate);
    if (result.valid) return { ...result, discovered: true };
  }
  return { valid: false, discovered: false, reason: 'whisper-cli was not found in standard install locations.' };
}

module.exports = { standardPaths, runVersion, validateWhisperCli, discoverWhisperCli };
