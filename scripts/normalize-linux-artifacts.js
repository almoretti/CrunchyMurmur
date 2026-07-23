const fs = require('fs');
const path = require('path');

const renames = new Map([
  ['CrunchyMurmur-linux-x86_64.AppImage', 'CrunchyMurmur-linux-x64.AppImage'],
  ['CrunchyMurmur-linux-amd64.deb', 'CrunchyMurmur-linux-x64.deb'],
]);

function normalize(dist) {
  for (const [from, to] of renames) {
    const source = path.join(dist, from);
    if (!fs.existsSync(source)) continue;
    fs.renameSync(source, path.join(dist, to));
  }

  // The updater manifest is named after publish.channel (latest-linux.yml
  // for stable, nightly-linux.yml for nightly builds) — rewrite whichever
  // channel manifests are present so they reference the renamed artifacts.
  const manifests = fs.readdirSync(dist).filter((name) => /^[a-z]+-linux\.yml$/.test(name));
  for (const name of manifests) {
    const manifest = path.join(dist, name);
    let contents = fs.readFileSync(manifest, 'utf8');
    for (const [from, to] of renames) contents = contents.replaceAll(from, to);
    fs.writeFileSync(manifest, contents, 'utf8');
  }
}

if (require.main === module) {
  normalize(path.resolve(__dirname, '..', 'dist'));
  console.log('Normalized Linux x64 artifact names and updater manifest.');
}

module.exports = { normalize, renames };
