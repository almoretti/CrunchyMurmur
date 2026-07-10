const path = require('path');
const fs = require('fs');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const { Arch } = require('builder-util');

exports.default = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename;
  let executable;
  if (context.electronPlatformName === 'win32') {
    executable = path.join(context.appOutDir, `${product}.exe`);
  } else if (context.electronPlatformName === 'darwin') {
    executable = path.join(context.appOutDir, `${product}.app`, 'Contents', 'MacOS', product);
  } else {
    executable = path.join(context.appOutDir, context.packager.executableName);
  }

  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Required by BrowserWindow.loadFile() for packaged app.asar pages. The
    // renderer remains constrained by CSP, context isolation, IPC sender
    // validation, and navigation blocking.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  });

  // uiohook-napi ships prebuilds for every OS/architecture. Keep only the
  // binaries usable by this artifact so foreign native files are not bundled
  // or passed through the platform signing tool.
  const prebuilds = path.join(
    context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'uiohook-napi', 'prebuilds',
  );
  if (!fs.existsSync(prebuilds)) return;
  const arch = Arch[context.arch];
  const allowed = arch === 'universal'
    ? new Set([`${context.electronPlatformName}-x64`, `${context.electronPlatformName}-arm64`])
    : new Set([`${context.electronPlatformName}-${arch}`]);
  for (const entry of fs.readdirSync(prebuilds, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowed.has(entry.name)) {
      fs.rmSync(path.join(prebuilds, entry.name), { recursive: true, force: true });
    }
  }
};
