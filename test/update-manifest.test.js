const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseManifest, verifyManifest } = require('../scripts/verify-update-manifest');

test('parses updater files and primary path', () => {
  const parsed = parseManifest('files:\n  - url: App-x64.exe\n  - url: App-arm64.exe\npath: App-x64.exe\n');
  assert.deepEqual(parsed, { urls: ['App-x64.exe', 'App-arm64.exe'], primaryPath: 'App-x64.exe' });
});

test('rejects a manifest that references a missing artifact', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-manifest-'));
  const manifest = path.join(directory, 'latest.yml');
  fs.writeFileSync(manifest, 'files:\n  - url: missing.exe\npath: missing.exe\n');
  assert.throws(() => verifyManifest(manifest), /missing files: missing\.exe/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts a manifest whose artifacts are present', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-manifest-'));
  const manifest = path.join(directory, 'latest-linux.yml');
  fs.writeFileSync(path.join(directory, 'CrunchyMurmur-linux-x64.AppImage'), 'test');
  fs.writeFileSync(manifest, 'files:\n  - url: CrunchyMurmur-linux-x64.AppImage\npath: CrunchyMurmur-linux-x64.AppImage\n');
  assert.equal(verifyManifest(manifest).files.length, 1);
  fs.rmSync(directory, { recursive: true, force: true });
});
