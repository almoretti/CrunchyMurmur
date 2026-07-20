function metadataForRelease(tag, repositoryVersion) {
  const value = String(tag || '');
  const match = value.match(/^v(\d+\.\d+\.\d+)(-nightly\.\d{8}\.\d+)?$/);
  if (!match) throw new Error(`Invalid release tag: ${value}`);
  const prerelease = Boolean(match[2]);
  if (!prerelease && match[1] !== repositoryVersion) {
    throw new Error(`Stable tag ${value} does not match repository version v${repositoryVersion}.`);
  }
  return { version: value.slice(1), channel: prerelease ? 'nightly' : 'latest', prerelease };
}

module.exports = { metadataForRelease };
