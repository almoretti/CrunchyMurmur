const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const repository = 'a-streetcoder/CrunchyMurmur';
const legacyRepository = ['almoretti', 'CrunchyMurmur'].join('/');
const legacyEncodedRepository = ['almoretti', 'CrunchyMurmur'].join('%2F');
const failures = [];

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.repository?.url !== `git+https://github.com/${repository}.git`) failures.push('package.json repository URL is stale.');
if (pkg.homepage !== `https://github.com/${repository}#readme`) failures.push('package.json homepage is stale.');
if (pkg.bugs?.url !== `https://github.com/${repository}/issues`) failures.push('package.json issue URL is stale.');
if (pkg.build?.publish?.owner !== 'a-streetcoder' || pkg.build?.publish?.repo !== 'CrunchyMurmur') failures.push('Electron updater repository is stale.');

const requiredReferences = new Map([
  ['install.ps1', repository],
  ['install.sh', repository],
  ['scripts/source/run-from-source.ps1', repository],
  ['scripts/source/run-from-source.sh', repository],
  ['site/app.js', repository],
  ['site/docs.js', repository],
  ['src/main.js', `https://github.com/${repository}/issues`],
]);
for (const [filename, expected] of requiredReferences) {
  const contents = fs.readFileSync(path.join(root, filename), 'utf8');
  if (!contents.includes(expected)) failures.push(`${filename} does not reference ${repository}.`);
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const filename of trackedFiles) {
  let contents;
  try {
    contents = fs.readFileSync(path.join(root, filename), 'utf8');
  } catch {
    continue;
  }
  if (contents.includes(legacyRepository) || contents.includes(legacyEncodedRepository)) {
    failures.push(`${filename} still references the previous repository owner.`);
  }
}

if (failures.length) {
  console.error(`Repository ownership checks failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log(`Repository links target ${repository}.`);
