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

  const manifest = path.join(dist, 'latest-linux.yml');
  if (fs.existsSync(manifest)) {
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
