const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function architectures(filename) {
  const result = spawnSync('lipo', ['-archs', filename], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not inspect ${filename}: ${result.stderr || result.stdout}`);
  return new Set(result.stdout.trim().split(/\s+/).filter(Boolean));
}

function expectArchitectures(filename, expected) {
  if (!fs.existsSync(filename)) throw new Error(`Missing macOS runtime: ${filename}`);
  const actual = architectures(filename);
  if (actual.size !== expected.length || expected.some((arch) => !actual.has(arch))) {
    throw new Error(`${filename} has architectures ${[...actual].join(', ')}, expected ${expected.join(', ')}`);
  }
}

function digest(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

const transcriberRoot = path.join(ROOT, 'build', 'transcriber-runtime');
expectArchitectures(path.join(transcriberRoot, 'mac-x64', 'crunchymurmur-transcriber'), ['x86_64']);
expectArchitectures(path.join(transcriberRoot, 'mac-arm64', 'crunchymurmur-transcriber'), ['arm64']);

const whisperRoot = path.join(ROOT, 'build', 'whisper-runtime');
for (const arch of ['x64', 'arm64']) {
  for (const executable of ['whisper-cli', 'whisper-server']) {
    expectArchitectures(path.join(whisperRoot, `mac-${arch}`, executable), ['x86_64', 'arm64']);
  }
}

const x64Runtime = path.join(transcriberRoot, 'mac-x64');
const arm64Runtime = path.join(transcriberRoot, 'mac-arm64');
for (const entry of fs.readdirSync(x64Runtime)) {
  if (!entry.endsWith('.dylib')) continue;
  const x64Library = path.join(x64Runtime, entry);
  const counterpart = path.join(arm64Runtime, entry);
  if (!fs.existsSync(counterpart) || digest(x64Library) !== digest(counterpart)) {
    throw new Error(`Intel-only support library is not mirrored for universal packaging: ${entry}`);
  }
}

console.log('macOS package runtimes have the expected architectures.');
