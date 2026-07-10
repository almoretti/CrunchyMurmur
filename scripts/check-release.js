const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const required = [
  'LICENSE', 'PRIVACY.md', 'TERMS.md', 'SECURITY.md', 'CHANGELOG.md',
  'install.ps1', 'install.sh', '.github/workflows/release.yml', 'scripts/after-pack.js',
  'docs/platform-support.md', 'scripts/normalize-linux-artifacts.js',
];
const failures = [];
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');

for (const filename of required) {
  if (!fs.existsSync(path.join(root, filename))) failures.push(`Missing ${filename}`);
}
if (!pkg.build?.publish || pkg.build.publish.provider !== 'github') failures.push('GitHub publish provider is not configured.');
if (!pkg.dependencies?.['electron-updater']) failures.push('electron-updater is not installed.');
if (pkg.dependencies?.['node-global-key-listener']) failures.push('Archived node-global-key-listener must not ship.');
if (!pkg.dependencies?.['uiohook-napi']) failures.push('Windows Ctrl + Win support dependency is missing.');
if (!pkg.build?.afterPack) failures.push('Electron fuse hardening hook is not configured.');
if (pkg.desktopName !== 'CrunchyMurmur') failures.push('Linux desktop window association is not configured.');
if (!pkg.scripts?.['build:linux']?.includes('normalize-linux-artifacts')) failures.push('Linux release artifacts are not normalized to stable x64 names.');
if (pkg.version.startsWith('0.')) failures.push('Stable releases must use version 1.0.0 or newer.');
if (lock.packages?.['']?.version !== pkg.version) failures.push('package-lock.json version does not match package.json.');
if (!pkg.build?.mac?.notarize) failures.push('macOS notarization is not required by the build configuration.');
if (!releaseWorkflow.includes('forceCodeSigning=true')) failures.push('Release workflow does not require Windows code signing.');
if (!releaseWorkflow.includes('attest-build-provenance')) failures.push('Release workflow does not generate provenance attestations.');

const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
if (tag && tag !== `v${pkg.version}`) failures.push(`Tag ${tag} does not match package version v${pkg.version}.`);

if (process.env.CI) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  if (dirty) failures.push('Release checkout is dirty.');
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Release configuration is valid for v${pkg.version}.`);
