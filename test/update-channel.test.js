const test = require('node:test');
const assert = require('node:assert/strict');

const { applyUpdateChannelPolicy, normalizeUpdateChannel, policyForUpdateChannel } = require('../src/update-channel');

test('Nightly follows prereleases without enabling downgrades', () => {
  assert.deepEqual(policyForUpdateChannel('nightly'), {
    channel: 'nightly',
    allowPrerelease: true,
    allowDowngrade: false,
  });
});

test('Stable permits a downgrade only when rollback was explicitly confirmed', () => {
  assert.deepEqual(policyForUpdateChannel('stable', { allowDowngradeOnce: true }), {
    channel: 'latest',
    allowPrerelease: false,
    allowDowngrade: true,
  });
  assert.equal(policyForUpdateChannel('stable').allowDowngrade, false);
});

test('Unknown update channels fall back to Stable', () => {
  assert.equal(normalizeUpdateChannel('preview'), 'stable');
  assert.equal(normalizeUpdateChannel(undefined), 'stable');
});

test('Applying Nightly resets Electron updater downgrade side effects', () => {
  const boundary = { allowDowngrade: false };
  Object.defineProperty(boundary, 'channel', {
    set(value) { this.selectedChannel = value; this.allowDowngrade = true; },
  });
  applyUpdateChannelPolicy(boundary, { updateChannel: 'nightly' });
  assert.equal(boundary.selectedChannel, 'nightly');
  assert.equal(boundary.allowPrerelease, true);
  assert.equal(boundary.allowDowngrade, false);
});
