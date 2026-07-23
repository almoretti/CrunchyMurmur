const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isNightlyVersion, isStableVersion, metadataForRelease } = require('../scripts/release-version');
const { prepareReleaseVersion } = require('../scripts/prepare-release-version');

test('stable tags keep the checked-in stable version and latest channel', () => {
  assert.deepEqual(metadataForRelease('v0.1.0', '0.1.0'), { version: '0.1.0', channel: 'latest', prerelease: false });
});

test('nightly tags select the nightly update feed', () => {
  assert.deepEqual(metadataForRelease('v0.2.0-nightly.20260720.42', '0.1.0'), {
    version: '0.2.0-nightly.20260720.42', channel: 'nightly', prerelease: true,
  });
});

test('stable tags cannot silently disagree with the repository version', () => {
  assert.throws(() => metadataForRelease('v0.2.0', '0.1.0'), /does not match/);
});

test('Nightly versions require a complete semantic-version prefix', () => {
  assert.equal(isNightlyVersion('0.2.0-nightly.20260721.42'), true);
  assert.equal(isNightlyVersion('invalid-nightly.20260721.42'), false);
  assert.equal(isNightlyVersion('0.2-nightly.20260721.42'), false);
  assert.equal(isNightlyVersion('01.002.3-nightly.20260721.42'), false);
  assert.equal(isNightlyVersion('1.2.3-nightly.20260721.01'), false);
  assert.equal(isNightlyVersion('1.2.3-nightly.02060721.1'), false);
  assert.equal(isNightlyVersion('1.2.3-nightly.20261340.1'), false);
  assert.equal(isNightlyVersion('1.2.3-nightly.20260231.1'), false);
  assert.equal(isNightlyVersion('1.2.3-nightly.20260228.1'), true);
  assert.equal(isStableVersion('01.2.3'), false);
  assert.equal(isStableVersion('0.2.3'), true);
  assert.throws(() => metadataForRelease('v01.002.3-nightly.20260721.42', '0.1.0'), /Invalid release tag/);
  assert.throws(() => metadataForRelease('v1.2.3-nightly.20260231.1', '0.1.0'), /Invalid release tag/);
});

test('preparing a nightly release persists the nightly update channel', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-release-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const publish = { provider: 'github', owner: 'a-streetcoder', repo: 'CrunchyMurmur', releaseType: 'release' };
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ version: '0.1.0', build: { publish } }));
  fs.writeFileSync(path.join(base, 'package-lock.json'), JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } }));

  const metadata = prepareReleaseVersion(base, 'v0.2.0-nightly.20260723.7');
  assert.deepEqual(metadata, { version: '0.2.0-nightly.20260723.7', channel: 'nightly', prerelease: true });
  const written = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  assert.equal(written.version, '0.2.0-nightly.20260723.7');
  assert.deepEqual(written.build.publish, { ...publish, channel: 'nightly' });
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, '0.2.0-nightly.20260723.7');
  assert.equal(lock.packages[''].version, '0.2.0-nightly.20260723.7');
});

test('preparing a stable release leaves the default latest channel untouched', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-release-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const original = { version: '0.2.0', build: { publish: { provider: 'github', owner: 'a-streetcoder', repo: 'CrunchyMurmur', releaseType: 'release' } } };
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(original));
  fs.writeFileSync(path.join(base, 'package-lock.json'), JSON.stringify({ version: '0.2.0', packages: { '': { version: '0.2.0' } } }));

  const metadata = prepareReleaseVersion(base, 'v0.2.0');
  assert.deepEqual(metadata, { version: '0.2.0', channel: 'latest', prerelease: false });
  // Stable releases must not rewrite the checkout — electron-builder's
  // default "latest" channel applies.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')), original);
});
