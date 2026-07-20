const { app, dialog } = require('electron');
const log = require('electron-log/main');
const { autoUpdater } = require('electron-updater');
const { applyUpdateChannelPolicy } = require('./update-channel');

let status = { state: 'idle', message: 'Updates have not been checked yet.' };
let notify = () => {};
let getPreferences = () => ({});
let onDowngradeConsumed = () => {};

function setStatus(state, message, extra = {}) {
  status = { state, message, ...extra };
  notify(status);
  log.info('[updater]', state, message);
}

function friendlyError(error) {
  const message = String(error?.message || error || 'Unknown update error.');
  if (/404|releases\.atom/i.test(message)) {
    return 'No public GitHub release is available yet. Update checks will start after the first release is published.';
  }
  if (/ENOTFOUND|ECONN|network|timed?\s*out/i.test(message)) {
    return 'Could not reach GitHub Releases. Check your connection and try again.';
  }
  const firstLine = message.split(/\r?\n/).find(Boolean) || 'Update check failed.';
  return firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
}

function configure(preferences = getPreferences()) {
  return applyUpdateChannelPolicy(autoUpdater, preferences);
}

function init({ onStatus, getUpdatePreferences, onUpdateDowngradeConsumed } = {}) {
  notify = typeof onStatus === 'function' ? onStatus : () => {};
  getPreferences = typeof getUpdatePreferences === 'function' ? getUpdatePreferences : () => ({});
  onDowngradeConsumed = typeof onUpdateDowngradeConsumed === 'function' ? onUpdateDowngradeConsumed : () => {};
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  configure();
  autoUpdater.fullChangelog = false;

  autoUpdater.on('checking-for-update', () => setStatus('checking', 'Checking for updates…'));
  autoUpdater.on('update-available', (info) => setStatus('downloading', `Downloading ${info.version}…`, { version: info.version }));
  autoUpdater.on('update-not-available', (info) => setStatus('current', `CrunchyMurmur ${info.version || app.getVersion()} is current.`));
  autoUpdater.on('download-progress', (p) => setStatus('downloading', `Downloading update: ${Math.round(p.percent || 0)}%`, { percent: p.percent || 0 }));
  autoUpdater.on('error', (err) => {
    log.error('[updater] check failed:', err);
    setStatus('error', friendlyError(err));
  });
  autoUpdater.on('update-downloaded', async (info) => {
    if (autoUpdater.allowDowngrade) onDowngradeConsumed();
    setStatus('ready', `CrunchyMurmur ${info.version} is ready to install.`, { version: info.version });
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `CrunchyMurmur ${info.version} has been downloaded.`,
      detail: 'Restart now to install it?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });
}

async function check() {
  if (!app.isPackaged) {
    setStatus('development', 'Update checks are disabled in development builds.');
    return status;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    setStatus('manual', 'Debian packages update through a new GitHub download or the terminal installer.');
    return status;
  }
  try {
    configure();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (status.state !== 'error') setStatus('error', friendlyError(error));
  }
  return status;
}

function getStatus() { return status; }

module.exports = { init, configure, check, getStatus };
