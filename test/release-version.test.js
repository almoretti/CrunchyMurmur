const test = require('node:test');
const assert = require('node:assert/strict');
const { isNightlyVersion, isStableVersion, metadataForRelease } = require('../scripts/release-version');

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
