const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalize } = require('../scripts/normalize-linux-artifacts');

test('Linux artifact normalization matches installer and updater names', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-linux-artifacts-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, 'CrunchyMurmur-linux-x86_64.AppImage'), 'appimage');
  fs.writeFileSync(path.join(dist, 'CrunchyMurmur-linux-amd64.deb'), 'deb');
  fs.writeFileSync(path.join(dist, 'latest-linux.yml'), [
    'url: CrunchyMurmur-linux-x86_64.AppImage',
    'url: CrunchyMurmur-linux-amd64.deb',
    'path: CrunchyMurmur-linux-x86_64.AppImage',
  ].join('\n'));
  normalize(dist);
  assert.equal(fs.existsSync(path.join(dist, 'CrunchyMurmur-linux-x64.AppImage')), true);
  assert.equal(fs.existsSync(path.join(dist, 'CrunchyMurmur-linux-x64.deb')), true);
  assert.doesNotMatch(fs.readFileSync(path.join(dist, 'latest-linux.yml'), 'utf8'), /x86_64|amd64/);
});

test('Linux artifact normalization also rewrites the nightly channel manifest', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-linux-artifacts-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, 'CrunchyMurmur-linux-x86_64.AppImage'), 'appimage');
  fs.writeFileSync(path.join(dist, 'CrunchyMurmur-linux-amd64.deb'), 'deb');
  fs.writeFileSync(path.join(dist, 'nightly-linux.yml'), [
    'url: CrunchyMurmur-linux-x86_64.AppImage',
    'url: CrunchyMurmur-linux-amd64.deb',
    'path: CrunchyMurmur-linux-x86_64.AppImage',
  ].join('\n'));
  normalize(dist);
  assert.equal(fs.existsSync(path.join(dist, 'CrunchyMurmur-linux-x64.AppImage')), true);
  assert.doesNotMatch(fs.readFileSync(path.join(dist, 'nightly-linux.yml'), 'utf8'), /x86_64|amd64/);
});
