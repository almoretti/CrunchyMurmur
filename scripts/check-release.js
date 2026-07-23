const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { isNightlyVersion, isStableVersion } = require('./release-version');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const required = [
  'LICENSE', 'docs/legal/privacy.md', 'docs/legal/terms.md', '.github/SECURITY.md', 'CHANGELOG.md',
  'install.ps1', 'install.sh', '.github/workflows/release.yml', 'scripts/after-pack.js',
  'docs/platform-support.md', 'scripts/normalize-linux-artifacts.js',
  'assets/brand-mark.svg', 'assets/brand-mark.png', 'assets/icon-palette.ico',
  'assets/tray-palette.png', 'scripts/build-brand-assets.py',
  'scripts/verify-update-manifest.js', 'docs/README.md', 'docs/updating.md',
  'scripts/verify-macos-package-runtimes.js',
  'docs/project/support.md', 'docs/project/roadmap.md', 'docs/project/status.md',
  'docs/legal/README.md', 'docs/project/README.md', 'assets/README.md',
  '.github/CODE_OF_CONDUCT.md', '.github/CONTRIBUTING.md',
  'scripts/check-doc-links.js', 'scripts/check-repository-links.js',
  'scripts/source/run-from-source.ps1', 'scripts/source/run-from-source.sh',
  'docs/building-from-source.md',
  '.github/workflows/nightly.yml', 'scripts/prepare-release-version.js',
];
const failures = [];
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const ciWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

for (const filename of required) {
  if (!fs.existsSync(path.join(root, filename))) failures.push(`Missing ${filename}`);
}
for (const filename of ['PRIVACY.md', 'TERMS.md', 'ROADMAP.md', 'STATUS.md', 'SUPPORT.md']) {
  if (fs.existsSync(path.join(root, filename))) failures.push(`Legacy root document must stay organized under docs/: ${filename}`);
}
if (fs.existsSync(path.join(root, 'assets', 'New assets'))) failures.push('Legacy design exports must not ship in assets/New assets.');
if (!pkg.build?.publish || pkg.build.publish.provider !== 'github') failures.push('GitHub publish provider is not configured.');
if (pkg.build?.publish?.owner !== 'a-streetcoder' || pkg.build?.publish?.repo !== 'CrunchyMurmur') failures.push('GitHub updater repository is not configured for a-streetcoder/CrunchyMurmur.');
if (!pkg.dependencies?.['electron-updater']) failures.push('electron-updater is not installed.');
if (pkg.dependencies?.['node-global-key-listener']) failures.push('Archived node-global-key-listener must not ship.');
if (!pkg.dependencies?.['uiohook-napi']) failures.push('Windows Ctrl + Win support dependency is missing.');
if (!pkg.build?.afterPack) failures.push('Electron fuse hardening hook is not configured.');
const extraResources = pkg.build?.extraResources || [];
if (!extraResources.some((entry) => entry.from === 'docs/legal/privacy.md' && entry.to === 'PRIVACY.md')) failures.push('Packaged privacy document mapping is missing.');
if (!extraResources.some((entry) => entry.from === 'docs/legal/terms.md' && entry.to === 'TERMS.md')) failures.push('Packaged terms document mapping is missing.');
if (pkg.desktopName !== 'CrunchyMurmur') failures.push('Linux desktop window association is not configured.');
if (!pkg.scripts?.['build:linux']?.includes('normalize-linux-artifacts')) failures.push('Linux release artifacts are not normalized to stable x64 names.');
const releaseTag = process.env.RELEASE_TAG || (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '');
const nightlyBuild = isNightlyVersion(pkg.version);
if (!isStableVersion(pkg.version) && !nightlyBuild) failures.push('Release version must be stable semantic versioning or the supported Nightly format.');
if (pkg.version === '0.0.0') failures.push('Release version must be non-zero.');
if (lock.packages?.['']?.version !== pkg.version) failures.push('package-lock.json version does not match package.json.');
if (!pkg.build?.mac?.notarize) failures.push('macOS notarization is not required by the build configuration.');
const macResources = pkg.build?.mac?.extraResources || [];
if (macResources.some((entry) => /(?:whisper|transcriber)-runtime/.test(entry.from || ''))) failures.push('macOS package must use the architecture-specific native runtimes from the shared resource mapping.');
const expectedMacX64Files = 'Contents/Resources/{native/transcriber/*.dylib,app.asar.unpacked/node_modules/uiohook-napi/prebuilds/darwin-*/uiohook-napi.node}';
if (pkg.build?.mac?.x64ArchFiles !== expectedMacX64Files) failures.push('macOS universal packaging does not permit the Intel ONNX support libraries and keyboard hook binaries.');
if (!releaseWorkflow.includes('--config.forceCodeSigning=true')) failures.push('Release workflow does not require Windows code signing with a valid electron-builder option.');
if (!releaseWorkflow.includes('macos-15-intel')) failures.push('Release workflow does not build the Intel macOS transcriber on a native Intel runner.');
if (!releaseWorkflow.includes('macos-transcriber-x64') || !releaseWorkflow.includes('macos-transcriber-arm64')) failures.push('Release workflow does not assemble both macOS transcriber architectures.');
if (!releaseWorkflow.includes('verify-macos-package-runtimes.js')) failures.push('Release workflow does not verify staged macOS runtime architectures.');
if (!ciWorkflow.includes('package-macos-universal') || !ciWorkflow.includes('verify-macos-package-runtimes.js')) failures.push('CI does not build and verify the universal macOS package.');
for (const secret of [
  'APPLE_DEVELOPER_ID_CERTIFICATE',
  'APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_NOTARY_API_KEY',
  'APPLE_NOTARY_KEY_ID',
  'APPLE_NOTARY_ISSUER_ID',
]) {
  if (!releaseWorkflow.includes(`secrets.${secret}`)) failures.push(`Release workflow does not use ${secret}.`);
}
for (const legacySecret of ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD']) {
  if (releaseWorkflow.includes(`secrets.${legacySecret}`)) failures.push(`Release workflow still uses legacy secret ${legacySecret}.`);
}
if (!releaseWorkflow.includes('attest-build-provenance')) failures.push('Release workflow does not generate provenance attestations.');
if ((releaseWorkflow.match(/verify-update-manifest\.js/g) || []).length !== 3) failures.push('Every platform release must verify its updater manifest.');

const updateChannelSource = fs.readFileSync(path.join(root, 'src', 'update-channel.js'), 'utf8');
if (!updateChannelSource.includes("channel: updateChannel === 'nightly' ? 'nightly' : 'latest'")) failures.push('Updater channel policy is missing.');
if (!updateChannelSource.includes("allowDowngrade: updateChannel === 'stable' && allowDowngradeOnce === true")) failures.push('Stable rollback safety policy is missing.');

const tag = releaseTag;
if (tag && tag !== `v${pkg.version}`) failures.push(`Tag ${tag} does not match package version v${pkg.version}.`);

if (process.env.CI) {
  // No trim() on the whole output: it would eat the leading status space
  // of the first porcelain line and misalign the path slice below.
  const dirtyLines = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter((line) => line.trim());
  const allowed = nightlyBuild ? new Set(['package.json', 'package-lock.json']) : new Set();
  const dirty = dirtyLines.filter((line) => !allowed.has(line.slice(3)));
  if (dirty.length) failures.push(`Release checkout is dirty: ${dirty.join(' | ')}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Release configuration is valid for v${pkg.version}.`);
