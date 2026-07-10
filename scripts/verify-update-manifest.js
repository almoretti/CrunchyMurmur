const fs = require('fs');
const path = require('path');

function parseManifest(contents) {
  const urls = [...contents.matchAll(/^\s*-?\s*url:\s*['"]?([^'"\r\n]+?)['"]?\s*$/gm)]
    .map((match) => match[1].trim());
  const pathMatch = contents.match(/^path:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m);
  return { urls, primaryPath: pathMatch?.[1].trim() || '' };
}

function verifyManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error(`Update manifest not found: ${manifestPath}`);
  const { urls, primaryPath } = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
  if (!urls.length) throw new Error(`${path.basename(manifestPath)} does not list any release files.`);
  if (!primaryPath) throw new Error(`${path.basename(manifestPath)} does not declare a primary path.`);
  if (!urls.includes(primaryPath)) throw new Error(`Primary path ${primaryPath} is not present in the files list.`);

  const directory = path.dirname(manifestPath);
  const missing = urls.filter((url) => !fs.existsSync(path.join(directory, url)));
  if (missing.length) throw new Error(`Manifest references missing files: ${missing.join(', ')}`);
  return { manifest: path.basename(manifestPath), files: urls };
}

if (require.main === module) {
  const supplied = process.argv.slice(2);
  const manifests = supplied.length
    ? supplied
    : ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']
      .map((name) => path.resolve(__dirname, '..', 'dist', name))
      .filter(fs.existsSync);
  if (!manifests.length) throw new Error('No update manifests were found. Pass a manifest path explicitly.');
  for (const filename of manifests) {
    const result = verifyManifest(path.resolve(filename));
    console.log(`Verified ${result.manifest}: ${result.files.join(', ')}`);
  }
}

module.exports = { parseManifest, verifyManifest };
