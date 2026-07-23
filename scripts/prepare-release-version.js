const fs = require('fs');
const path = require('path');
const { metadataForRelease } = require('./release-version');

// Rewrites package.json/package-lock.json for the release identified by
// `tag`. Prerelease (nightly) tags stamp the tag's version and the update
// channel; stable tags leave the checkout untouched (the version must
// already match). electron-builder names update manifests after
// publish.channel (default "latest"), so nightly builds must set it to
// "nightly" or the release workflow's manifest verification and the
// in-app Nightly update channel cannot find nightly*.yml.
function prepareReleaseVersion(root, tag) {
  const packagePath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const metadata = metadataForRelease(tag, pkg.version);

  if (metadata.prerelease) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    pkg.version = metadata.version;
    pkg.build.publish.channel = metadata.channel;
    lock.version = metadata.version;
    lock.packages[''].version = metadata.version;
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return metadata;
}

if (require.main === module) {
  const metadata = prepareReleaseVersion(path.resolve(__dirname, '..'), process.argv[2]);
  console.log(`Prepared ${metadata.version} (${metadata.channel})`);
}

module.exports = { prepareReleaseVersion };
