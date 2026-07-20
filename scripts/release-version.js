const SEMVER_NUMBER = '(?:0|[1-9]\\d*)';
const STABLE_VERSION = new RegExp(`^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}$`);
const NIGHTLY_SUFFIX = `nightly\\.[1-9]\\d{7}\\.${SEMVER_NUMBER}`;
const NIGHTLY_VERSION = new RegExp(`^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}-${NIGHTLY_SUFFIX}$`);
const RELEASE_TAG = new RegExp(`^v(${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER})(-${NIGHTLY_SUFFIX})?$`);

function isValidNightlyDate(value) {
  const match = String(value || '').match(/-nightly\.(\d{8})\./);
  if (!match) return false;
  const year = Number(match[1].slice(0, 4));
  const month = Number(match[1].slice(4, 6));
  const day = Number(match[1].slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isNightlyVersion(version) {
  const value = String(version || '');
  return NIGHTLY_VERSION.test(value) && isValidNightlyDate(value);
}

function isStableVersion(version) {
  return STABLE_VERSION.test(String(version || ''));
}

function metadataForRelease(tag, repositoryVersion) {
  const value = String(tag || '');
  const match = value.match(RELEASE_TAG);
  if (!match) throw new Error(`Invalid release tag: ${value}`);
  const prerelease = Boolean(match[2]);
  if (prerelease && !isNightlyVersion(value.slice(1))) throw new Error(`Invalid release tag: ${value}`);
  if (!prerelease && match[1] !== repositoryVersion) {
    throw new Error(`Stable tag ${value} does not match repository version v${repositoryVersion}.`);
  }
  return { version: value.slice(1), channel: prerelease ? 'nightly' : 'latest', prerelease };
}

module.exports = { isNightlyVersion, isStableVersion, metadataForRelease };
