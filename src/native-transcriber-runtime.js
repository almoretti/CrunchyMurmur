const fs = require('fs');
const path = require('path');

function executableName(platform = process.platform) {
  return platform === 'win32' ? 'crunchymurmur-transcriber.exe' : 'crunchymurmur-transcriber';
}

function resolveNativeTranscriber({
  packaged = false,
  resourcesPath = process.resourcesPath,
  appPath = process.cwd(),
  platform = process.platform,
} = {}) {
  const name = executableName(platform);
  if (packaged) {
    const executable = path.join(resourcesPath, 'native', 'transcriber', name);
    return fs.existsSync(executable) ? executable : '';
  }
  const platformDirectory = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  const candidates = [
    path.join(appPath, 'build', 'transcriber-runtime', `${platformDirectory}-${process.arch}`, name),
    path.join(appPath, 'native', 'transcriber', 'target', 'release', name),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

module.exports = { executableName, resolveNativeTranscriber };
