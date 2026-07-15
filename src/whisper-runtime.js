const fs = require('fs');
const path = require('path');

function executableNames(platform = process.platform) {
  return platform === 'win32'
    ? { cli: 'whisper-cli.exe', server: 'whisper-server.exe' }
    : { cli: 'whisper-cli', server: 'whisper-server' };
}

function developmentRuntimeName(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return `win-${arch}`;
  if (platform === 'darwin') return 'mac-universal';
  return `linux-${arch}`;
}

function bundledRuntimeDir({
  packaged,
  resourcesPath = process.resourcesPath,
  appPath,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  return packaged
    ? path.join(resourcesPath, 'native', 'whisper')
    : path.join(appPath, 'build', 'whisper-runtime', developmentRuntimeName(platform, arch));
}

function resolveBundledRuntime(options = {}) {
  const directory = bundledRuntimeDir(options);
  const names = executableNames(options.platform);
  const cliPath = path.join(directory, names.cli);
  const serverPath = path.join(directory, names.server);
  if (!fs.existsSync(cliPath) || !fs.existsSync(serverPath)) return {};
  return { directory, cliPath, serverPath, bundled: true };
}

module.exports = { executableNames, developmentRuntimeName, bundledRuntimeDir, resolveBundledRuntime };
