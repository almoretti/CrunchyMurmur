const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VERSION = 'v1.8.6';
const COMMIT = '23ee03506a91ac3d3f0071b40e66a430eebdfa1d';
const SOURCE_SHA256 = 'c8b0de473e9ec47a74bdf6104425c709261beeada8d6d7c1fec7432be701d032';
const WINDOWS_X64 = {
  url: `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/whisper-bin-x64.zip`,
  sha256: 'b07ea0b1b4115a38e1a7b07debf581f0b77d999925f8acb8f39d322b0ba0a822',
};

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function digest(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

async function download(url, filename, expectedSha256 = '') {
  if (fs.existsSync(filename) && (!expectedSha256 || digest(filename) === expectedSha256)) return;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const response = await fetch(url, { headers: { 'user-agent': 'CrunchyMurmur build' } });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  const actual = crypto.createHash('sha256').update(body).digest('hex');
  if (expectedSha256 && actual !== expectedSha256) {
    throw new Error(`Checksum mismatch for ${url}: expected ${expectedSha256}, received ${actual}`);
  }
  const temporary = `${filename}.partial`;
  fs.writeFileSync(temporary, body);
  fs.renameSync(temporary, filename);
}

function findFile(root, filename) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === filename) return candidate;
    if (entry.isDirectory()) {
      const nested = findFile(candidate, filename);
      if (nested) return nested;
    }
  }
  return '';
}

function writeManifest(target, details) {
  fs.writeFileSync(path.join(target, 'runtime.json'), `${JSON.stringify({
    project: 'ggml-org/whisper.cpp',
    version: VERSION,
    commit: COMMIT,
    ...details,
  }, null, 2)}\n`);
}

function validRuntime(target, expected, executables) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'runtime.json'), 'utf8'));
    if (manifest.project !== 'ggml-org/whisper.cpp' || manifest.version !== VERSION || manifest.commit !== COMMIT) return false;
    if (Object.entries(expected).some(([key, value]) => manifest[key] !== value)) return false;
    return executables.every((name) => {
      const filename = path.join(target, name);
      fs.accessSync(filename, fs.constants.R_OK | fs.constants.X_OK);
      const stat = fs.statSync(filename);
      return stat.isFile() && stat.size > 0;
    });
  } catch {
    return false;
  }
}

async function prepareWindows(arch) {
  const target = path.join(ROOT, 'build', 'whisper-runtime', `win-${arch}`);
  const expected = {
    platform: 'win', arch, source: WINDOWS_X64.url, sourceSha256: WINDOWS_X64.sha256,
    emulatedX64OnArm64: arch === 'arm64',
  };
  if (validRuntime(target, expected, ['whisper-cli.exe', 'whisper-server.exe'])) return;
  fs.rmSync(target, { recursive: true, force: true });
  const cache = path.join(ROOT, 'build', 'whisper-cache');
  const archive = path.join(cache, `whisper-bin-x64-${VERSION}.zip`);
  await download(WINDOWS_X64.url, archive, WINDOWS_X64.sha256);
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-whisper-'));
  try {
    run('tar', ['-xf', archive, '-C', extracted]);
    const server = findFile(extracted, 'whisper-server.exe');
    const cli = findFile(extracted, 'whisper-cli.exe');
    if (!server || !cli || path.dirname(server) !== path.dirname(cli)) {
      throw new Error('The verified whisper.cpp archive did not contain the expected server and CLI executables.');
    }
    fs.mkdirSync(target, { recursive: true });
    const requiredExecutables = new Set(['whisper-cli.exe', 'whisper-server.exe']);
    for (const entry of fs.readdirSync(path.dirname(server), { withFileTypes: true })) {
      if (entry.isFile() && (/\.dll$/i.test(entry.name) || requiredExecutables.has(entry.name))) {
        fs.copyFileSync(path.join(path.dirname(server), entry.name), path.join(target, entry.name));
      }
    }
    writeManifest(target, expected);
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}

async function sourceTree() {
  const cache = path.join(ROOT, 'build', 'whisper-cache');
  const archive = path.join(cache, `whisper.cpp-${COMMIT}.tar.gz`);
  const source = path.join(cache, `whisper.cpp-${COMMIT}`);
  if (!fs.existsSync(source)) {
    await download(`https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/${COMMIT}`, archive, SOURCE_SHA256);
    const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-whisper-source-'));
    try {
      run('tar', ['-xf', archive, '-C', extracted]);
      const directory = fs.readdirSync(extracted, { withFileTypes: true }).find((entry) => entry.isDirectory());
      if (!directory) throw new Error('The whisper.cpp source archive was empty.');
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.renameSync(path.join(extracted, directory.name), source);
    } finally {
      fs.rmSync(extracted, { recursive: true, force: true });
    }
  }
  return source;
}

async function prepareUnix(platform, arch) {
  const osName = platform === 'darwin' ? 'mac' : 'linux';
  const target = path.join(ROOT, 'build', 'whisper-runtime', `${osName}-${arch}`);
  const sourceUrl = `https://github.com/ggml-org/whisper.cpp/commit/${COMMIT}`;
  const expected = { platform: osName, arch, source: sourceUrl, sourceSha256: SOURCE_SHA256 };
  if (validRuntime(target, expected, ['whisper-cli', 'whisper-server'])) return;
  fs.rmSync(target, { recursive: true, force: true });
  const source = await sourceTree();
  const buildDir = path.join(ROOT, 'build', 'whisper-build', `${osName}-${arch}`);
  const args = [
    '-S', source,
    '-B', buildDir,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DWHISPER_BUILD_EXAMPLES=ON',
    '-DWHISPER_BUILD_SERVER=ON',
  ];
  if (platform === 'darwin') {
    args.push('-DCMAKE_OSX_ARCHITECTURES=x86_64;arm64', '-DGGML_METAL=ON', '-DGGML_METAL_EMBED_LIBRARY=ON');
  } else {
    args.push('-DGGML_NATIVE=OFF');
    if (arch === 'arm64' && process.arch !== 'arm64') {
      args.push(
        '-DCMAKE_SYSTEM_NAME=Linux',
        '-DCMAKE_SYSTEM_PROCESSOR=aarch64',
        '-DCMAKE_C_COMPILER=aarch64-linux-gnu-gcc',
        '-DCMAKE_CXX_COMPILER=aarch64-linux-gnu-g++',
      );
    }
  }
  run('cmake', args);
  run('cmake', ['--build', buildDir, '--config', 'Release', '--parallel']);
  const server = findFile(path.join(buildDir, 'bin'), 'whisper-server');
  const cli = findFile(path.join(buildDir, 'bin'), 'whisper-cli');
  if (!server || !cli) throw new Error('The whisper.cpp build did not produce whisper-server and whisper-cli.');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(server, path.join(target, 'whisper-server'));
  fs.copyFileSync(cli, path.join(target, 'whisper-cli'));
  fs.chmodSync(path.join(target, 'whisper-server'), 0o755);
  fs.chmodSync(path.join(target, 'whisper-cli'), 0o755);
  writeManifest(target, expected);
}

(async () => {
  const platform = argument('platform', process.platform);
  const requestedArch = argument('arch', process.arch);
  const arches = requestedArch === 'all'
    ? (platform === 'darwin' ? ['universal'] : ['x64', 'arm64'])
    : [requestedArch];
  for (const arch of arches) {
    if (platform === 'win32') await prepareWindows(arch);
    else if (platform === 'darwin' || platform === 'linux') await prepareUnix(platform, arch);
    else throw new Error(`Unsupported platform: ${platform}`);
  }
  if (platform === 'darwin' && requestedArch === 'universal') {
    const universal = path.join(ROOT, 'build', 'whisper-runtime', 'mac-universal');
    for (const arch of ['x64', 'arm64']) {
      const target = path.join(ROOT, 'build', 'whisper-runtime', `mac-${arch}`);
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(universal, target, { recursive: true });
    }
  }
  console.log(`Prepared whisper.cpp ${VERSION} runtime for ${platform}: ${arches.join(', ')}.`);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
