const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bundledRuntimeDir, resolveBundledRuntime } = require('../src/whisper-runtime');

test('packaged whisper runtime resolves from resources without external settings', (t) => {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-resources-'));
  t.after(() => fs.rmSync(resourcesPath, { recursive: true, force: true }));
  const directory = bundledRuntimeDir({ packaged: true, resourcesPath, platform: 'win32', arch: 'x64' });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'whisper-cli.exe'), 'cli');
  fs.writeFileSync(path.join(directory, 'whisper-server.exe'), 'server');

  const runtime = resolveBundledRuntime({ packaged: true, resourcesPath, platform: 'win32', arch: 'x64' });
  assert.equal(runtime.bundled, true);
  assert.equal(runtime.cliPath, path.join(directory, 'whisper-cli.exe'));
  assert.equal(runtime.serverPath, path.join(directory, 'whisper-server.exe'));
});
