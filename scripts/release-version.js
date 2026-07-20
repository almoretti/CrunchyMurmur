const SEMVER_NUMBER = '(?:0|[1-9]\\d*)';
const STABLE_VERSION = new RegExp(`^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}$`);
const NIGHTLY_VERSION = new RegExp(`^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}-nightly\\.\\d{8}\\.\\d+$`);
const RELEASE_TAG = new RegExp(`^v(${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER})(-nightly\\.\\d{8}\\.\\d+)?$`);

function isNightlyVersion(version) {
  return NIGHTLY_VERSION.test(String(version || ''));
}

function isStableVersion(version) {
  return STABLE_VERSION.test(String(version || ''));
}

function metadataForRelease(tag, repositoryVersion) {
  const value = String(tag || '');
  const match = value.match(RELEASE_TAG);
  if (!match) throw new Error(`Invalid release tag: ${value}`);
  const prerelease = Boolean(match[2]);
  if (!prerelease && match[1] !== repositoryVersion) {
    throw new Error(`Stable tag ${value} does not match repository version v${repositoryVersion}.`);
  }
  return { version: value.slice(1), channel: prerelease ? 'nightly' : 'latest', prerelease };
}

module.exports = { isNightlyVersion, isStableVersion, metadataForRelease };
