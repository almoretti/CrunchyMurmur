const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'native', 'transcriber', 'Cargo.toml');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function executableName(platform) {
  return platform === 'win32' ? 'crunchymurmur-transcriber.exe' : 'crunchymurmur-transcriber';
}

function rustTarget(platform, arch) {
  const cpu = arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (platform === 'win32') return `${cpu}-pc-windows-msvc`;
  if (platform === 'darwin') return `${cpu}-apple-darwin`;
  if (platform === 'linux') return `${cpu}-unknown-linux-gnu`;
  throw new Error(`Unsupported platform: ${platform}`);
}

function platformName(platform) {
  return platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
}

function cargoCommand() {
  if (process.platform === 'win32') {
    const candidate = path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'cargo.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'cargo';
}

function rustupCommand() {
  if (process.platform === 'win32') {
    const candidate = path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'rustup.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'rustup';
}

function windowsBuildEnvironment(arch) {
  if (process.platform !== 'win32') return { ...process.env };
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) return { ...process.env };
  const query = spawnSync(vswhere, [
    '-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath',
  ], { encoding: 'utf8' });
  const installation = String(query.stdout || '').trim();
  if (!installation) return { ...process.env };
  const setup = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
  const target = arch === 'arm64' ? 'amd64_arm64' : 'amd64';
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-vsenv-'));
  const helper = path.join(temporary, 'environment.cmd');
  fs.writeFileSync(helper, `@call "${setup}" ${target} >nul\r\n@set\r\n`);
  const result = spawnSync('cmd.exe', ['/d', '/c', helper], { encoding: 'utf8' });
  fs.rmSync(temporary, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(`Could not initialise Visual Studio Build Tools: ${result.stderr}`);
  const env = { ...process.env };
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      const key = line.slice(0, separator);
      const duplicate = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
      if (duplicate && duplicate !== key) delete env[duplicate];
      env[key] = line.slice(separator + 1);
    }
  }
  return env;
}

function visualStudioInstallation() {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!fs.existsSync(vswhere)) return '';
  const result = spawnSync(vswhere, [
    '-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath',
  ], { encoding: 'utf8' });
  return String(result.stdout || '').trim();
}

function findFile(root, filename, architecture) {
  if (!root || !fs.existsSync(root)) return '';
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()
        && candidate.toLowerCase().includes(`${path.sep}${architecture}${path.sep}`.toLowerCase())) return candidate;
    if (entry.isDirectory()) {
      const nested = findFile(candidate, filename, architecture);
      if (nested) return nested;
    }
  }
  return '';
}

function build(platform, arch) {
  const target = rustTarget(platform, arch);
  run(rustupCommand(), ['target', 'add', target]);
  const env = platform === 'win32' ? windowsBuildEnvironment(arch) : { ...process.env };
  if (platform === 'linux' && arch === 'arm64' && process.arch !== 'arm64') {
    env.CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER = 'aarch64-linux-gnu-gcc';
  }
  run(cargoCommand(), ['build', '--release', '--locked', '--manifest-path', MANIFEST, '--target', target], { env });
  return path.join(ROOT, 'native', 'transcriber', 'target', target, 'release', executableName(platform));
}

function copyRuntime(platform, arch, source, runtimeArch = arch) {
  const target = path.join(ROOT, 'build', 'transcriber-runtime', `${platformName(platform)}-${arch}`);
  fs.mkdirSync(target, { recursive: true });
  const executable = path.join(target, executableName(platform));
  fs.copyFileSync(source, executable);
  if (platform === 'win32') {
    const redist = path.join(visualStudioInstallation(), 'VC', 'Redist', 'MSVC');
    const architecture = runtimeArch === 'arm64' ? 'arm64' : 'x64';
    for (const dll of ['msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
      const sourceDll = findFile(redist, dll, architecture);
      if (!sourceDll) throw new Error(`Visual C++ redistributable file was not found: ${dll} (${architecture})`);
      fs.copyFileSync(sourceDll, path.join(target, dll));
    }
  }
  if (platform !== 'win32') fs.chmodSync(executable, 0o755);
}

(async () => {
  const platform = argument('platform', process.platform);
  const requestedArch = argument('arch', process.arch);
  if (platform === 'darwin' && requestedArch === 'universal') {
    const x64 = build(platform, 'x64');
    const arm64 = build(platform, 'arm64');
    const target = path.join(ROOT, 'build', 'transcriber-runtime', 'mac-universal');
    fs.mkdirSync(target, { recursive: true });
    const output = path.join(target, executableName(platform));
    run('lipo', ['-create', x64, arm64, '-output', output]);
    fs.chmodSync(output, 0o755);
  } else {
    const arches = requestedArch === 'all' ? ['x64', 'arm64'] : [requestedArch];
    for (const arch of arches) {
      const runtimeArch = platform === 'win32' && arch === 'arm64' ? 'x64' : arch;
      copyRuntime(platform, arch, build(platform, runtimeArch), runtimeArch);
    }
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
