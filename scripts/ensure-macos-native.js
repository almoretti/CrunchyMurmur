const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform === 'darwin') {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'build', 'native', 'CrunchyMurmurNative');
  if (!fs.existsSync(output)) {
    const result = spawnSync('bash', [path.join(root, 'scripts', 'build-macos-native.sh')], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
