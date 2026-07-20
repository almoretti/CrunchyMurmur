const fs = require('fs');
const path = require('path');
const { metadataForRelease } = require('./release-version');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const metadata = metadataForRelease(process.argv[2], pkg.version);

if (metadata.prerelease) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  pkg.version = metadata.version;
  lock.version = metadata.version;
  lock.packages[''].version = metadata.version;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
console.log(`Prepared ${metadata.version} (${metadata.channel})`);
