const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, clipboard, screen, nativeImage, shell, session, systemPreferences, Notification, desktopCapturer, nativeTheme } = require('electron');
const log = require('electron-log/main');

log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;
log.errorHandler.startCatching({ showDialog: false });

// Electron's portal-backed global shortcuts work on modern Wayland desktops.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}

// Force CPU rasterization for the *whole* app so the transparent floating
// pill renders reliably on Windows. GPU compositing has chronic Win+DWM
// bugs that make transparent BrowserWindows appear blank or as flat gray
// surfaces on certain hardware (we hit both on this machine). The cost is
// slightly slower animations on the main window — acceptable for our small
// UI surfaces and worth it for a proper-looking pill.
if (process.platform === 'win32') app.disableHardwareAcceleration();

// Bind the app to its own AppUserModelID so Windows groups our windows under
// a single taskbar entry with our icon — without this, in dev mode the
// taskbar inherits electron.exe's icon. Must be called before any window is
// created. The string matches package.json `build.appId`.
if (process.platform === 'win32') {
  app.setAppUserModelId('cc.moretti.crunchymurmur.desktop');
}

// Force the runtime app name to match the productName from package.json so
// dev mode and packaged builds both write to %APPDATA%\CrunchyMurmur\
// (otherwise Electron uses the lowercased package "name" in dev, which
// would put data at %APPDATA%\crunchymurmur-windows\).
app.setName('CrunchyMurmur');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// One-time migration: the app was renamed WisperHelp → CrunchyMurmur. The
// older codebase used the package name `wisperhelp-windows` as the userData
// folder in dev (because no productName was set top-level), and the
// packaged build used `WisperHelp`. Either could be the legacy directory
// — try both. Idempotent: only runs when the new dir is empty.
function migrateLegacyDataDir() {
  if (process.platform !== 'win32') return;
  const fsx = require('fs');
  const pathx = require('path');

  try {
    const newDir = app.getPath('userData');
    const parent = pathx.dirname(newDir);
    const candidates = ['WisperHelp', 'wisperhelp-windows']
      .map((name) => pathx.join(parent, name))
      .filter((p) => p !== newDir && fsx.existsSync(p));
    if (candidates.length === 0) return;

    // Electron can create browser-support files before migration runs. Only
    // treat the destination as initialized when app-owned data already exists.
    const appDataMarkers = ['settings.json', 'history.json', 'calendar-feeds.json', 'Meetings', 'Templates'];
    if (appDataMarkers.some((name) => fsx.existsSync(pathx.join(newDir, name)))) return;

    const legacyDir = candidates[0];
    fsx.mkdirSync(newDir, { recursive: true });
    fsx.cpSync(legacyDir, newDir, { recursive: true, force: false, errorOnExist: false });
    fsx.rmSync(legacyDir, { recursive: true, force: true });
    console.log('[main] migrated user data from', legacyDir, 'to', newDir);
  } catch (err) {
    console.warn('[main] data migration failed (non-fatal):', err.message);
  }

  // Also migrate the user's Notes folder under ~/Documents.
  try {
    const docs = app.getPath('documents');
    const oldNotes = pathx.join(docs, 'WisperHelp Notes');
    const newNotes = pathx.join(docs, 'CrunchyMurmur Notes');
    if (fsx.existsSync(oldNotes) && !fsx.existsSync(newNotes)) {
      fsx.renameSync(oldNotes, newNotes);
      console.log('[main] migrated notes folder from', oldNotes, 'to', newNotes);
    }
  } catch (err) {
    console.warn('[main] notes-folder migration failed (non-fatal):', err.message);
  }
}
if (hasSingleInstanceLock) migrateLegacyDataDir();

const settings = require('./settings');
const history = require('./history');
const dictationStats = require('./dictation-stats');
const models = require('./models');
const notes = require('./notes-store');
const templates = require('./templates');
const aiNotes = require('./notes-generator');
const calendar = require('./calendar-store');
const meetings = require('./meetings-store');
const updater = require('./updater');
const { transcribeWav, writeTempWav } = require('./transcriber');
const { transcribeWithGroq } = require('./groq');
const dictationFormatter = require('./dictation-formatter');
const meetingTranscriber = require('./meeting-transcriber');
const macNative = require('./mac-native');
const { pasteText } = require('./paste');
const hotkeys = require('./hotkey-manager');

let tray = null;
let mainWindow = null;
let floatingWindow = null;
let isProcessing = false;
let isDictating = false;
let activeMeetingId = null;  // truthy while a meeting is recording
let isQuitting = false;
const meetingTranscriptions = new Map();

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', status);
}

function notifyUser(title, body) {
  if (process.platform === 'win32' && tray && typeof tray.displayBalloon === 'function') {
    tray.displayBalloon({ title, content: body, iconType: 'info' });
  } else if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function appOwnedDataPaths() {
  const userData = app.getPath('userData');
  return [
    'settings.json', 'history.json', 'calendar-feeds.json', 'Meetings', 'Templates', 'Models',
  ].map((name) => path.join(userData, name));
}

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, errorOnExist: false });
}

async function exportLocalData() {
  const options = {
    title: 'Choose a folder for the CrunchyMurmur export',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(result.filePaths[0], `CrunchyMurmur-export-${stamp}`);
  fs.mkdirSync(target, { recursive: false });
  for (const source of appOwnedDataPaths()) copyIfPresent(source, path.join(target, path.basename(source)));
  copyIfPresent(notes.rootDir(), path.join(target, 'Notes'));
  fs.writeFileSync(path.join(target, 'export-info.json'), JSON.stringify({
    exportedAt: new Date().toISOString(), version: app.getVersion(), platform: process.platform, arch: process.arch,
  }, null, 2));
  return { ok: true, path: target };
}

async function deleteLocalData() {
  if (activeMeetingId) return { ok: false, error: 'Stop the active meeting before deleting local data.' };
  const options = {
    type: 'warning',
    title: 'Delete all local data?',
    message: 'This permanently deletes settings, transcripts, recordings, notes, templates, and downloaded models.',
    detail: 'Export your data first if you may need it later. This action cannot be undone.',
    buttons: ['Cancel', 'Delete everything'],
    defaultId: 0,
    cancelId: 0,
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 1) return { ok: false, canceled: true };
  for (const target of appOwnedDataPaths()) fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(notes.rootDir(), { recursive: true, force: true });
  app.relaunch();
  app.quit();
  return { ok: true };
}

function isTrustedSender(event) {
  return isTrustedWebContents(event && event.sender);
}

function isTrustedWebContents(sender) {
  return Boolean(sender) && [mainWindow, floatingWindow].some((win) => (
    win && !win.isDestroyed() && win.webContents === sender
  ));
}

function assertTrustedSender(event) {
  if (!isTrustedSender(event)) throw new Error('IPC request rejected from an untrusted renderer.');
}

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
}

function onTrusted(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    listener(event, ...args);
  });
}

const EXTERNAL_ORIGINS = new Set([
  'https://huggingface.co',
  'https://console.groq.com',
  'https://console.anthropic.com',
  'https://platform.openai.com',
]);

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && EXTERNAL_ORIGINS.has(parsed.origin)) {
        setImmediate(() => shell.openExternal(parsed.toString()));
      }
    } catch {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
}

// ---------- Windows ----------

function createFloatingWindow() {
  const display = screen.getPrimaryDisplay();
  const { x: waX, y: waY, width: waW, height: waH } = display.workArea;
  const W = 220, H = 44;
  // workArea is in screen-DIP coordinates. Earlier code ignored x/y, which
  // put the window off-screen on multi-monitor setups where the primary
  // display isn't anchored at (0,0). Compute relative to the work area.
  const x = Math.round(waX + (waW - W) / 2);
  const y = Math.round(waY + waH - H - 20);
  console.log('[main] floating window position:', { x, y, workArea: display.workArea, scale: display.scaleFactor });

  // Real transparent BrowserWindow now that the app forced software
  // rasterization (see app.disableHardwareAcceleration() at the top of
  // this file). The pill shape is drawn in CSS — the desktop shows through
  // the margins around it.
  floatingWindow = new BrowserWindow({
    width: W,
    height: H,
    x, y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-floating.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  hardenWindow(floatingWindow);
  floatingWindow.loadFile(path.join(__dirname, '..', 'ui', 'floating.html'));
  floatingWindow.webContents.once('did-finish-load', () => {
    console.log('[main] floating window loaded');
    floatingWindow.webContents.send('theme:changed', settings.load().theme);
  });
}

function showFloating(state) {
  if (!floatingWindow) return;
  if (!floatingWindow.isVisible()) floatingWindow.showInactive();
  floatingWindow.webContents.send('floating:state', state);
}

function hideFloating() {
  if (floatingWindow && floatingWindow.isVisible()) floatingWindow.hide();
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    title: 'CrunchyMurmur',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : {
      color: nativeTheme.shouldUseDarkColors ? '#15201c' : '#f2ebdd',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#f6f1e8' : '#24332d',
      height: 40,
    },
    autoHideMenuBar: false,
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon-palette.ico' : 'brand-mark.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  hardenWindow(mainWindow);
  updateWindowThemeChrome();
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'main.html'));
}

function normalizedTheme(value) {
  return ['system', 'light', 'dark'].includes(value) ? value : 'system';
}

function updateWindowThemeChrome() {
  if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return;
  const dark = nativeTheme.shouldUseDarkColors;
  mainWindow.setTitleBarOverlay({
    color: dark ? '#15201c' : '#f2ebdd',
    symbolColor: dark ? '#f6f1e8' : '#24332d',
    height: 40,
  });
}

function applyThemePreference(value) {
  nativeTheme.themeSource = normalizedTheme(value);
  updateWindowThemeChrome();
  const preference = nativeTheme.themeSource;
  for (const window of [mainWindow, floatingWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
      window.webContents.send('theme:changed', preference);
    }
  }
  return preference;
}

nativeTheme.on('updated', updateWindowThemeChrome);

function legalDocumentPath(documentName) {
  const documents = {
    privacy: { packaged: 'PRIVACY.md', source: 'privacy.md' },
    terms: { packaged: 'TERMS.md', source: 'terms.md' },
  };
  const document = documents[documentName];
  if (!document) throw new Error('Unknown legal document.');
  return app.isPackaged
    ? path.join(process.resourcesPath, document.packaged)
    : path.join(app.getAppPath(), 'docs', 'legal', document.source);
}

function createApplicationMenu() {
  const template = [
    {
      id: 'menu-file',
      label: 'File',
      submenu: [
        { label: 'Open CrunchyMurmur', click: showMainWindow },
        { label: 'Export Local Data…', click: () => exportLocalData().catch((error) => log.error(error)) },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      id: 'menu-edit',
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      id: 'menu-view',
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      id: 'menu-window',
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      id: 'menu-help',
      label: 'Help',
      submenu: [
        {
          label: 'About CrunchyMurmur',
          click: () => dialog.showMessageBox({
            type: 'info', title: 'About CrunchyMurmur',
            message: `CrunchyMurmur ${app.getVersion()}`,
            detail: 'Cross-platform voice dictation, meeting recording, and AI-assisted notes.',
          }),
        },
        { label: 'Privacy', click: () => shell.openPath(legalDocumentPath('privacy')) },
        { label: 'Report an Issue…', click: () => shell.openExternal('https://github.com/almoretti/CrunchyMurmur/issues') },
      ],
    },
  ];
  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }
  return Menu.buildFromTemplate(template);
}

function broadcastHistory() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history:changed', history.load());
  }
}

// ---------- Tray ----------

function createTray() {
  // 16×16 transparent placeholder; user can drop a real .ico into assets/.
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-palette.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
  } catch {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip('CrunchyMurmur — press the shortcut to dictate');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CrunchyMurmur', click: showMainWindow },
    { label: 'Toggle dictation', click: toggleDictation },
    { label: 'Check for updates…', click: () => updater.check().catch((err) => log.error(err)) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

// ---------- Recording lifecycle ----------

function beginDictation() {
  // Don't trigger dictation while a meeting is recording — the pill is
  // showing meeting state, and the renderer's audio graph is owned by the
  // meeting capture loop. Dictation is disabled until the meeting stops.
  if (isDictating || isProcessing || activeMeetingId) return;
  isDictating = true;
  showFloating('recording');
}

function endDictation() {
  if (!isDictating || isProcessing || activeMeetingId) return;
  isDictating = false;
  showFloating('flushing');
}

function toggleDictation() {
  if (isDictating) endDictation();
  else beginDictation();
}

function shortcutMetadata(cfg = settings.load()) {
  return {
    ...settings.publicView(cfg),
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    accessibilityTrusted: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
  };
}

function registerDictationShortcut(accelerator) {
  const value = String(accelerator || settings.DEFAULTS.hotkey).trim();
  return hotkeys.register(value, {
    onDown: beginDictation,
    onUp: endDictation,
    onToggle: toggleDictation,
  });
}

handle('floating:submit-samples', async (_e, samples) => {
  if (!Array.isArray(samples) || samples.length < 16000 / 4) {
    // < 250 ms — too short; bail.
    hideFloating();
    return { ok: false, error: 'Recording too short.' };
  }
  if (samples.length > 16_000 * 10 * 60) {
    hideFloating();
    return { ok: false, error: 'Dictation exceeds the 10 minute limit. Use Meetings for long recordings.' };
  }

  isProcessing = true;
  showFloating('transcribing');

  let wavPath = null;
  try {
    wavPath = writeTempWav(Float32Array.from(samples));
    const cfg = settings.load();
    const text = cfg.engineKind === 'groq'
      ? await transcribeWithGroq(wavPath, cfg)
      : await transcribeWav(wavPath, cfg);
    const cleaned = await dictationFormatter.format(text, cfg);

    if (cleaned) {
      history.add({ text: cleaned, language: cfg.language, durationSec: samples.length / 16000 });
      broadcastHistory();
      const pasted = await pasteText(cleaned);
      if (!pasted) notifyUser('Transcription copied', 'Automatic paste failed. Use your system paste shortcut to paste the transcription.');
    }

    return { ok: true, text: cleaned };
  } catch (err) {
    console.error('[main] transcription failed:', err);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    dialog.showMessageBox({
      type: 'error',
      title: 'Transcription failed',
      message: err.message || String(err),
    });
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { if (wavPath) fs.unlinkSync(wavPath); } catch {}
    isProcessing = false;
    isDictating = false;
    hideFloating();
  }
});

onTrusted('floating:capture-failed', (_e, message) => {
  isDictating = false;
  hideFloating();
  dialog.showMessageBox({
    type: 'warning',
    title: 'Microphone unavailable',
    message: 'CrunchyMurmur could not access the selected microphone.',
    detail: String(message || 'Check the operating system microphone permission and the selected input device.'),
  });
});

// ---------- IPC: settings, history, clipboard ----------

handle('settings:get', () => shortcutMetadata());
handle('permissions:status', async () => {
  let native = {};
  if (process.platform === 'darwin') {
    try { native = await macNative.permissionStatus(); } catch (error) { log.warn('[permissions] native status failed:', error.message); }
  }
  return {
    microphone: ['darwin', 'win32'].includes(process.platform) ? systemPreferences.getMediaAccessStatus('microphone') : 'unknown',
    screen: ['darwin', 'win32'].includes(process.platform) ? systemPreferences.getMediaAccessStatus('screen') : 'unknown',
    accessibility: process.platform === 'darwin'
      ? (systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied') : 'not-required',
    inputMonitoring: process.platform === 'darwin' ? (native.inputMonitoring || 'unknown') : 'not-required',
    calendar: process.platform === 'darwin' ? (native.calendar || 'unknown') : 'not-required',
  };
});
handle('permissions:open', (_e, kind) => {
  const macPanes = {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
    calendar: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars',
  };
  if (process.platform === 'darwin' && macPanes[kind]) return shell.openExternal(macPanes[kind]);
  if (process.platform === 'win32') return shell.openExternal('ms-settings:privacy-microphone');
  return false;
});

handle('settings:save', (_e, partial) => {
  const changes = { ...(partial || {}) };
  const current = settings.load();
  if (Object.hasOwn(changes, 'hotkey')) {
    changes.hotkey = String(changes.hotkey || '').trim() || settings.DEFAULTS.hotkey;
    changes.hotkeyCustomized = 'true';
    try {
      registerDictationShortcut(changes.hotkey);
    } catch (error) {
      try { registerDictationShortcut(current.hotkey); } catch {}
      throw error;
    }
  }
  if (Object.hasOwn(changes, 'theme')) changes.theme = normalizedTheme(changes.theme);
  const saved = settings.save(changes);
  if (Object.hasOwn(changes, 'theme')) applyThemePreference(saved.theme);
  return shortcutMetadata(saved);
});

handle('settings:pick-file', async (_e, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [{ name: 'All files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

handle('history:get', () => history.load());
handle('history:stats', () => dictationStats.compute(history.load()));
handle('history:remove', (_e, id) => { history.remove(id); broadcastHistory(); return history.load(); });
handle('history:clear', () => { history.clear(); broadcastHistory(); return []; });
handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text || '').slice(0, 5_000_000)); return true; });
handle('update:check', () => updater.check());
handle('update:status', () => updater.getStatus());
handle('support:open-logs', () => shell.showItemInFolder(log.transports.file.getFile().path));
handle('support:diagnostics', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
  userData: app.getPath('userData'),
  notes: notes.rootDir(),
  logFile: log.transports.file.getFile().path,
  settings: settings.publicView(),
}));
handle('data:export', () => exportLocalData());
handle('data:delete', () => deleteLocalData());
handle('legal:open', (_e, documentName) => {
  return shell.openPath(legalDocumentPath(documentName));
});
handle('app-menu:open', (_e, menuName) => {
  const allowed = new Set(['file', 'edit', 'view', 'help']);
  const name = String(menuName || '').toLowerCase();
  if (!allowed.has(name)) throw new Error('Unknown application menu.');
  const item = Menu.getApplicationMenu()?.getMenuItemById(`menu-${name}`);
  if (!item?.submenu) throw new Error('Application menu is unavailable.');
  item.submenu.popup({ window: mainWindow || undefined });
  return true;
});

// ---------- IPC: models ----------

handle('models:catalog', () => models.getCatalog());
handle('models:installed', () => models.listInstalled());
handle('models:dir', () => models.modelsDir());
handle('models:open-dir', () => shell.openPath(models.modelsDir()));
handle('models:download', async (_e, id) => {
  try {
    const result = await models.downloadModel(id, ({ id: pid, bytesDone, bytesTotal }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('models:progress', { id: pid, bytesDone, bytesTotal });
      }
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('models:installed-changed', models.listInstalled());
    }
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
handle('models:cancel', (_e, id) => models.cancelDownload(id));
handle('models:remove', (_e, id) => {
  models.removeModel(id);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('models:installed-changed', models.listInstalled());
  }
  return { ok: true };
});

// ---------- IPC: notes ----------

function broadcastNotes() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notes:changed', notes.snapshot());
  }
}

handle('notes:snapshot',     () => notes.snapshot());
handle('notes:read',         (_e, payload) => notes.readNote(payload.folder, payload.filename));
handle('notes:create-folder',(_e, name) => { const s = notes.createFolder(name); broadcastNotes(); return s; });
handle('notes:rename-folder',(_e, p) => { const s = notes.renameFolder(p.oldName, p.newName); broadcastNotes(); return s; });
handle('notes:delete-folder',(_e, name) => { const s = notes.deleteFolder(name); broadcastNotes(); return s; });
handle('notes:reveal-folder',(_e, name) => notes.revealFolder(name));
handle('notes:create',       (_e, p) => { const r = notes.createNote(p); broadcastNotes(); return r; });
handle('notes:update',       (_e, p) => notes.updateNote(p));
handle('notes:delete',       (_e, p) => { const s = notes.deleteNote(p); broadcastNotes(); return s; });
handle('notes:rename',       (_e, p) => { const n = notes.renameNote(p); broadcastNotes(); return n; });
handle('notes:move',         (_e, p) => { const n = notes.moveNote(p); broadcastNotes(); return n; });
handle('notes:open-root',    () => shell.openPath(notes.rootDir()));

// ---------- IPC: templates ----------

handle('templates:list',   () => templates.list());
handle('templates:save',   (_e, t) => templates.save(t));
handle('templates:revert', (_e, id) => templates.revert(id));

// ---------- IPC: AI Notes generation ----------

handle('ai-notes:providers', () => aiNotes.listProviders());

// ---------- IPC: calendar ----------

function broadcastCalendar() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('calendar:changed', calendar.snapshot());
  }
}

handle('calendar:snapshot', () => calendar.snapshot());
handle('calendar:refresh',  async () => { await calendar.refreshAll(); broadcastCalendar(); return calendar.snapshot(); });
handle('calendar:add-feed', async (_e, payload) => {
  const id = calendar.addFeed(payload);
  await calendar.refresh(id).catch(() => {});
  broadcastCalendar();
  return id;
});
handle('calendar:update-feed', async (_e, payload) => {
  calendar.updateFeed(payload);
  await calendar.refresh(payload.id).catch(() => {});
  broadcastCalendar();
});
handle('calendar:remove-feed', (_e, id) => { calendar.removeFeed(id); broadcastCalendar(); });

// ---------- IPC: meetings ----------

function broadcastMeetings() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('meetings:changed', meetings.list());
  }
}

handle('meetings:list',   () => meetings.list());
handle('meetings:get',    (_e, id) => meetings.get(id));
handle('meetings:begin-recording', () => {
  if (activeMeetingId) throw new Error('A meeting is already recording.');
  const m = meetings.create({});
  try {
    meetings.beginMicWav(m.id);
    activeMeetingId = m.id;
  } catch (err) {
    meetings.remove(m.id);
    throw err;
  }
  broadcastMeetings();
  return m;
});
handle('meetings:update', (_e, payload) => {
  const partial = payload.partial || {};
  const permitted = {};
  if ('title' in partial) permitted.title = String(partial.title || '').slice(0, 500);
  if ('userNotes' in partial) permitted.userNotes = String(partial.userNotes || '').slice(0, 2_000_000);
  const m = meetings.update(payload.id, permitted);
  broadcastMeetings();
  return m;
});
handle('meetings:delete', (_e, id) => {
  if (id === activeMeetingId) throw new Error('Stop the active meeting before deleting it.');
  meetings.remove(id);
  broadcastMeetings();
  return { ok: true };
});
handle('meetings:reveal', (_e, id) => meetings.reveal(id));
handle('meetings:audio-usage', () => meetings.totalAudioSize());
handle('meetings:cleanup-audio', (_e, policy) => {
  const cleaned = meetings.cleanupAudio(policy);
  broadcastMeetings();
  return { cleaned, bytes: meetings.totalAudioSize() };
});
handle('meetings:delete-all-audio', () => {
  let cleaned = 0;
  for (const meeting of meetings.list()) if (meetings.deleteAudio(meeting.id)) cleaned += 1;
  broadcastMeetings();
  return { cleaned, bytes: meetings.totalAudioSize() };
});
onTrusted('meetings:audio-chunk', (_e, payload) => {
  if (!payload || payload.id !== activeMeetingId) return;
  const samples = payload.samples;
  if (!(samples instanceof Float32Array) || samples.length > 65_536) return;
  try { meetings.appendMicSamples(payload.id, samples); }
  catch (err) { console.error('[main] failed to append meeting audio:', err); }
});
handle('meetings:begin-system-audio', (_e, id) => {
  if (!activeMeetingId || id !== activeMeetingId) throw new Error('Meeting is not currently recording.');
  meetings.beginSystemWav(id);
  return true;
});
onTrusted('meetings:system-audio-chunk', (_e, payload) => {
  if (!payload || payload.id !== activeMeetingId) return;
  const samples = payload.samples;
  if (!(samples instanceof Float32Array) || samples.length > 65_536) return;
  try { meetings.appendSystemSamples(payload.id, samples); }
  catch (err) { console.error('[main] failed to append system audio:', err); }
});
handle('meetings:finish-recording', (_e, id) => {
  if (!activeMeetingId || id !== activeMeetingId) throw new Error('Meeting is not currently recording.');
  const m = meetings.finishMicWav(id);
  try { meetings.finishSystemWav(id); } catch {}
  activeMeetingId = null;
  hideFloating();
  broadcastMeetings();
  return m;
});
handle('meetings:abort-recording', (_e, id) => {
  if (id !== activeMeetingId) return false;
  meetings.abortMicWav(id);
  meetings.abortSystemWav(id);
  meetings.remove(id);
  activeMeetingId = null;
  hideFloating();
  broadcastMeetings();
  return true;
});

// ----- Meeting <-> floating pill bridge -----
//
// When the user starts a meeting, the main-window renderer tells us so we can
// show the floating pill in 'meeting' state with the start timestamp. The
// pill ticks its own elapsed timer locally. Clicking the pill sends
// "request-stop" back to main, which forwards to the main-window renderer to
// stop the meeting and finalize the streamed WAV.

handle('meetings:pill-start', (_e, payload) => {
  if (!activeMeetingId || payload.id !== activeMeetingId) throw new Error('Meeting is not currently recording.');
  if (!floatingWindow) return;
  if (!floatingWindow.isVisible()) floatingWindow.showInactive();
  floatingWindow.webContents.send('floating:state', 'meeting');
  floatingWindow.webContents.send('floating:meeting-state', { startedAt: payload.startedAt });
});

onTrusted('floating:request-stop-meeting', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('main:request-stop-meeting');
  }
});

handle('meetings:transcribe', async (_e, id) => {
  const m = meetings.get(id);
  if (!m) return { ok: false, error: 'Meeting not found.' };
  if (!m.hasMicAudio && !m.hasSystemAudio) return { ok: false, error: 'No audio captured for this meeting.' };
  if (meetingTranscriptions.has(id)) return { ok: false, error: 'This meeting is already being transcribed.' };
  const cfg = settings.load();
  const controller = new AbortController();
  meetingTranscriptions.set(id, controller);
  try {
    const tracks = [];
    if (m.hasMicAudio) tracks.push({ filename: meetings.micWavPath(id), speaker: 'YOU' });
    if (m.hasSystemAudio) tracks.push({ filename: meetings.systemWavPath(id), speaker: 'OTHERS' });
    const text = await meetingTranscriber.transcribeMeeting({
      tracks,
      settings: cfg,
      signal: controller.signal,
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('meetings:transcription-progress', { id, ...progress });
        }
      },
    });
    const updated = meetings.update(id, { transcript: (text || '').trim() });
    if (cfg.audioRetentionPolicy === 'after_transcription') meetings.deleteAudio(id);
    broadcastMeetings();
    return { ok: true, meeting: meetings.get(id) || updated };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    meetingTranscriptions.delete(id);
  }
});
handle('meetings:cancel-transcription', (_e, id) => {
  const controller = meetingTranscriptions.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
});

handle('meetings:send-to-notes', (_e, payload) => {
  // Compose a Notes-folder Markdown file from the meeting's AI body + user's
  // live notes + a provenance header. Default folder = "Meetings".
  try {
    const m = meetings.get(payload.id);
    if (!m) return { ok: false, error: 'Meeting not found.' };
    if (!m.aiNotes) return { ok: false, error: 'No AI notes on this meeting yet.' };
    const folder = payload.folder || 'Meetings';
    const ts = new Date(m.createdAt);
    const minutes = Math.max(1, Math.round((m.durationSec || 0) / 60));
    const lines = [
      `# ${m.title}`,
      '',
      `> Recorded ${ts.toLocaleString()} · ~${minutes} minute${minutes === 1 ? '' : 's'}.`,
      '',
    ];
    const liveNotes = (m.userNotes || '').trim();
    if (liveNotes) {
      lines.push('## My live notes', '', liveNotes, '');
    }
    lines.push(m.aiNotes.trim(), '');
    const r = notes.createNote({ title: m.title, content: lines.join('\n'), folder });
    broadcastNotes();
    return { ok: true, note: r.note };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle('meetings:generate-ai-notes', async (_e, payload) => {
  const m = meetings.get(payload.id);
  if (!m) return { ok: false, error: 'Meeting not found.' };
  if (!m.transcript) return { ok: false, error: 'Transcribe the meeting first.' };
  try {
    // We re-use the recording-flavored prompt by mapping a meeting onto the
    // same shape (text + createdAt + durationSec). It's the same prompt
    // backbone so this works without a separate codepath.
    const result = await aiNotes.generateFromRecording({
      recording: {
        text: m.transcript,
        createdAt: m.createdAt,
        durationSec: m.durationSec || 0,
        language: settings.load().language,
      },
      templateId: payload.templateId,
    });
    const updated = meetings.update(payload.id, { aiNotes: result.text, aiTemplateId: payload.templateId });
    broadcastMeetings();
    return { ok: true, meeting: updated, providerId: result.providerId, modelId: result.modelId };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

handle('ai-notes:generate-from-recording', async (_e, payload) => {
  // payload: { recordingId, templateId, provider?, model?, folder? }
  try {
    const all = history.load();
    const rec = all.find((e) => e.id === payload.recordingId);
    if (!rec) return { ok: false, error: 'Recording not found.' };

    const result = await aiNotes.generateFromRecording({
      recording: rec,
      templateId: payload.templateId,
      provider: payload.provider,
      model: payload.model,
    });
    const note = aiNotes.saveToNotes({
      markdown: result.text,
      recording: rec,
      templateId: payload.templateId,
      providerId: result.providerId,
      modelId: result.modelId,
      folder: payload.folder || 'Inbox',
    });
    broadcastNotes();
    return { ok: true, note, providerId: result.providerId, modelId: result.modelId };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  applyThemePreference(settings.load().theme);
  Menu.setApplicationMenu(createApplicationMenu());
  createTray();
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!request.frame || !mainWindow || request.frame !== mainWindow.webContents.mainFrame) return callback({});
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const video = sources[0];
      if (!video) return callback({});
      callback({ video, audio: process.platform === 'linux' ? undefined : 'loopback' });
    } catch (error) {
      log.warn('[capture] display media request failed:', error.message);
      callback({});
    }
  }, { useSystemPicker: process.platform === 'darwin' });
  createFloatingWindow();
  updater.init({ onStatus: sendUpdateStatus });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const audioOnly = !details?.mediaTypes || details.mediaTypes.every((type) => type === 'audio');
    const trusted = isTrustedWebContents(webContents);
    callback(trusted && ((permission === 'media' && audioOnly) || permission === 'display-capture'));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    ['media', 'display-capture'].includes(permission) && isTrustedWebContents(webContents)
  ));
  try {
    const nativeHotkeyDisabled = process.env.CRUNCHYMURMUR_DISABLE_NATIVE_HOTKEY === '1';
    if (process.platform === 'darwin' && settings.load().hotkey === 'Fn' && !nativeHotkeyDisabled) {
      systemPreferences.isTrustedAccessibilityClient(true);
    }
    if (!nativeHotkeyDisabled) registerDictationShortcut(settings.load().hotkey);
  } catch (err) {
    console.error('[main] global hotkey listener failed:', err);
    tray.setToolTip('CrunchyMurmur — hotkey unavailable');
    dialog.showMessageBox({
      type: 'warning',
      title: 'Global hotkey unavailable',
      message: 'CrunchyMurmur could not register its dictation shortcut.',
      detail: `${err.message || err}\n\nOpen General settings and choose another shortcut.`,
    });
  }

  // Open the main window on first launch when nothing is configured yet.
  const cfg = settings.load();
  const pruned = meetings.cleanupAudio(cfg.audioRetentionPolicy);
  if (pruned) log.info(`[main] removed audio from ${pruned} meeting(s)`);
  if (cfg.autoUpdate === 'true') {
    setTimeout(() => updater.check().catch((err) => log.warn('[updater] automatic check failed:', err.message)), 10_000);
  }
  const needsSetup = cfg.engineKind === 'groq'
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup || process.argv.includes('--show')) {
    showMainWindow();
  }
});

app.on('second-instance', () => showMainWindow());

app.on('window-all-closed', (e) => {
  // Tray app — don't quit when the main window closes.
  e.preventDefault?.();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (activeMeetingId) {
    try { meetings.finishMicWav(activeMeetingId); }
    catch (err) { console.error('[main] failed to finalize meeting during quit:', err); }
    activeMeetingId = null;
  }
  hotkeys.stop();
});
