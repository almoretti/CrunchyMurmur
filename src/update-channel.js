const UPDATE_CHANNELS = new Set(['stable', 'nightly']);

function normalizeUpdateChannel(value) {
  return UPDATE_CHANNELS.has(value) ? value : 'stable';
}

function policyForUpdateChannel(value, { allowDowngradeOnce = false } = {}) {
  const updateChannel = normalizeUpdateChannel(value);
  return {
    channel: updateChannel === 'nightly' ? 'nightly' : 'latest',
    allowPrerelease: updateChannel === 'nightly',
    allowDowngrade: updateChannel === 'stable' && allowDowngradeOnce === true,
  };
}

function applyUpdateChannelPolicy(updater, preferences = {}) {
  const policy = policyForUpdateChannel(preferences.updateChannel, {
    allowDowngradeOnce: preferences.allowUpdateDowngrade === 'true',
  });
  // electron-updater enables downgrades as a side effect of assigning channel,
  // so assign the safety flags afterwards.
  updater.channel = policy.channel;
  updater.allowPrerelease = policy.allowPrerelease;
  updater.allowDowngrade = policy.allowDowngrade;
  return policy;
}

module.exports = { applyUpdateChannelPolicy, normalizeUpdateChannel, policyForUpdateChannel };
