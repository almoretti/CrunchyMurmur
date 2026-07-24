const path = require('path');
const fs = require('fs');
const { app, autoUpdater: nativeAutoUpdater, BrowserWindow, Tray, Menu, ipcMain, dialog, clipboard, screen, nativeImage, shell, session, systemPreferences, Notification, desktopCapturer, nativeTheme } = require('electron');
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
const whisperCli = require('./whisper-cli');
const notes = require('./notes-store');
const templates = require('./templates');
const aiNotes = require('./notes-generator');
const calendar = require('./calendar-store');
const meetings = require('./meetings-store');
const updater = require('./updater');
const { writeTempWav } = require('./transcriber');
const { LocalTranscriptionService, findWhisperServer } = require('./local-transcription-service');
const { NativeTranscriptionService } = require('./native-transcription-service');
const nativeTranscriberRuntime = require('./native-transcriber-runtime');
const whisperRuntime = require('./whisper-runtime');
const { analyseSpeechSamples } = require('./audio-quality');
const { transcribeWithGroq } = require('./groq');
const dictationFormatter = require('./dictation-formatter');
const meetingTranscriber = require('./meeting-transcriber');
const macNative = require('./mac-native');
const { pasteText } = require('./paste');
const hotkeys = require('./hotkey-manager');

function resolveWhisperRuntime() {
  return whisperRuntime.resolveBundledRuntime({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
}

const localTranscription = new LocalTranscriptionService({ logger: log, resolveRuntime: resolveWhisperRuntime });
const nativeTranscription = new NativeTranscriptionService({
  logger: log,
  resolveExecutable: () => nativeTranscriberRuntime.resolveNativeTranscriber({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  }),
});

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
  const W = 300, H = 60;
  // workArea is in screen-DIP coordinates. Earlier code ignored x/y, which
  // put the window off-screen on multi-monitor setups where the primary
  // display isn't anchored at (0,0). Compute relative to the work area.
  const saved = settings.load();
  const hasSavedPosition = saved.overlayX !== '' && saved.overlayY !== '';
  const savedX = Number(saved.overlayX);
  const savedY = Number(saved.overlayY);
  const savedPoint = hasSavedPosition && Number.isFinite(savedX) && Number.isFinite(savedY)
    ? screen.getDisplayNearestPoint({ x: savedX, y: savedY })
    : null;
  const savedIsVisible = savedPoint && savedX >= savedPoint.workArea.x - W + 48
    && savedX <= savedPoint.workArea.x + savedPoint.workArea.width - 48
    && savedY >= savedPoint.workArea.y
    && savedY <= savedPoint.workArea.y + savedPoint.workArea.height - 24;
  const x = savedIsVisible ? savedX : Math.round(waX + (waW - W) / 2);
  const y = savedIsVisible ? savedY : Math.round(waY + waH - H - 20);
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
  let persistPositionTimer = null;
  floatingWindow.on('move', () => {
    clearTimeout(persistPositionTimer);
    persistPositionTimer = setTimeout(() => {
      if (!floatingWindow || floatingWindow.isDestroyed()) return;
      const [overlayX, overlayY] = floatingWindow.getPosition();
      settings.save({ overlayX, overlayY });
    }, 250);
  });
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

// macOS focus-stealing prevention keeps a newly shown window behind the
// active application unless the app explicitly asks to come forward — the
// window would open "in the background" on launch/reopen without this.
function bringAppForward() {
  if (process.platform === 'darwin') app.focus({ steal: true });
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    bringAppForward();
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
  // Dev runs get the DEV-badged icon in the window frame / taskbar so they
  // are distinguishable from an installed copy (macOS handles this via the
  // Dock icon instead — window icons don't exist there).
  if (!app.isPackaged && process.platform !== 'darwin') {
    getDevBadgedIcon()
      .then((icon) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(icon); })
      .catch((err) => log.warn('[main] dev window icon failed:', err.message));
  }
  updateWindowThemeChrome();
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'main.html'));
  bringAppForward();
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
        { label: 'Report an Issue…', click: () => shell.openExternal('https://github.com/a-streetcoder/CrunchyMurmur/issues') },
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
  // The source artwork is intentionally high resolution. Constrain it before
  // handing it to the OS so macOS does not render it as an oversized status
  // item (and so it remains a conventional tray size elsewhere).
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-palette.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) image = image.resize({ width: 18, height: 18, quality: 'best' });
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
  const cfg = settings.load();
  if (cfg.engineKind === 'local') {
    localTranscription.prepare(cfg).catch((error) => {
      log.debug(`[local-transcription] preload skipped: ${error.message || error}`);
    });
  }
  if (cfg.engineKind === 'parakeet') {
    nativeTranscription.prepare(cfg).catch((error) => {
      log.debug(`[native-transcription] preload skipped: ${error.message || error}`);
    });
  }
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
  // getSystemLocale reads the user's OS regional/language preference on all
  // three desktop platforms. getLocale is retained for older Electron builds.
  const systemLocale = (typeof app.getSystemLocale === 'function' && app.getSystemLocale())
    || app.getLocale()
    || 'en';
  return {
    ...settings.publicView(cfg),
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    systemLocale,
    // Shown in settings so users can see (and start from) the built-in
    // formatter instructions when customising their own.
    aiFormatSystemPromptDefault: dictationFormatter.SYSTEM_PROMPT,
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
  const audioQuality = analyseSpeechSamples(Array.isArray(samples) ? samples : []);
  if (!audioQuality.usable) {
    isDictating = false;
    isProcessing = false;
    const state = audioQuality.reason === 'too-short' ? 'too-short' : 'no-speech';
    log.info(`[dictation] audio rejected reason=${audioQuality.reason} duration=${audioQuality.durationSeconds.toFixed(2)}s peak=${(audioQuality.peak || 0).toFixed(6)} rms=${(audioQuality.rms || 0).toFixed(6)} active=${(audioQuality.activeFraction || 0).toFixed(4)}`);
    showFloating(state);
    setTimeout(() => {
      if (!isDictating && !isProcessing) hideFloating();
    }, 2_500);
    return { ok: false, error: audioQuality.reason === 'too-short' ? 'Recording too short.' : 'No speech was detected.' };
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
      : cfg.engineKind === 'parakeet'
        ? await nativeTranscription.transcribe(wavPath, cfg)
        : await localTranscription.transcribe(wavPath, cfg);
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

async function validateLocalModel(modelPath) {
  const candidate = String(modelPath || '').trim();
  if (!candidate) return { valid: false, reason: 'Choose or download a GGML .bin model.' };
  try {
    const model = await fs.promises.stat(candidate);
    await fs.promises.access(candidate, fs.constants.R_OK);
    if (!model.isFile() || path.extname(candidate).toLowerCase() !== '.bin') {
      return { valid: false, reason: 'The selected model must be a readable GGML .bin file.' };
    }
    return { valid: true, path: candidate };
  } catch {
    return { valid: false, reason: 'The selected model file was not found or is not readable.' };
  }
}

async function validateParakeetModel(modelPath) {
  const candidate = String(modelPath || '').trim();
  if (!candidate) return { valid: false, reason: 'Download Parakeet V3 before using this engine.' };
  try {
    const required = ['encoder-model.int8.onnx', 'decoder_joint-model.int8.onnx', 'nemo128.onnx', 'vocab.txt', 'config.json'];
    const files = await Promise.all(required.map(async (file) => {
      const filename = path.join(candidate, file);
      await fs.promises.access(filename, fs.constants.R_OK);
      return fs.promises.stat(filename);
    }));
    if (files.some((file) => !file.isFile() || file.size <= 0)) throw new Error('invalid model');
    return { valid: true, path: candidate };
  } catch {
    return { valid: false, reason: 'The Parakeet V3 model is incomplete or unreadable.' };
  }
}

handle('settings:save', async (_e, partial) => {
  const changes = { ...(partial || {}) };
  delete changes.updateChannel;
  delete changes.allowUpdateDowngrade;
  const current = settings.load();
  const prospective = { ...current, ...changes };
  const localConfigChanged = ['engineKind', 'whisperCliPath', 'modelPath', 'parakeetModelPath']
    .some((key) => Object.hasOwn(changes, key));
  if (localConfigChanged && prospective.engineKind === 'local') {
    const runtime = prospective.whisperCliPath ? {} : resolveWhisperRuntime();
    const cli = await whisperCli.validateWhisperCli(prospective.whisperCliPath || runtime.cliPath);
    if (!cli.valid) throw new Error(`Local transcription is not ready: ${cli.reason}`);
    const model = await validateLocalModel(prospective.modelPath);
    if (!model.valid) throw new Error(`Local transcription is not ready: ${model.reason}`);
  }
  if (localConfigChanged && prospective.engineKind === 'parakeet') {
    const model = await validateParakeetModel(prospective.parakeetModelPath);
    if (!model.valid) throw new Error(`Local transcription is not ready: ${model.reason}`);
  }
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
  if (localConfigChanged) {
    localTranscription.dispose();
    nativeTranscription.dispose();
    if (saved.engineKind === 'local') {
      localTranscription.prepare(saved).catch((error) => {
        log.debug(`[local-transcription] preload after settings change skipped: ${error.message || error}`);
      });
    }
    if (saved.engineKind === 'parakeet') {
      nativeTranscription.prepare(saved).catch((error) => {
        log.debug(`[native-transcription] preload after settings change skipped: ${error.message || error}`);
      });
    }
  }
  if (Object.hasOwn(changes, 'theme')) applyThemePreference(saved.theme);
  if (Object.hasOwn(changes, 'uiLocale') && floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('locale:changed', { uiLocale: saved.uiLocale, systemLocale: shortcutMetadata(saved).systemLocale });
  }
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
handle('whisper-cli:status', async (_e, preferredPath) => {
  const preferred = await whisperCli.validateWhisperCli(String(preferredPath || '').trim());
  if (preferred.valid) return { ...preferred, discovered: false };
  const runtime = resolveWhisperRuntime();
  const bundled = await whisperCli.validateWhisperCli(runtime.cliPath);
  if (bundled.valid) return { ...bundled, bundled: true, discovered: false };
  return whisperCli.discoverWhisperCli();
});
handle('local-model:status', (_e, modelPath) => validateLocalModel(modelPath));
handle('native-engine:status', async (_e, preferred = {}) => {
  const cfg = settings.load();
  const parakeetModelPath = String(Object.hasOwn(preferred, 'parakeetModelPath')
    ? preferred.parakeetModelPath
    : cfg.parakeetModelPath || '').trim();
  const model = await validateParakeetModel(parakeetModelPath);
  const diagnostics = nativeTranscription.diagnostics();
  return {
    ...diagnostics,
    model,
    available: Boolean(diagnostics.executablePath),
    ready: diagnostics.ready && diagnostics.modelPath === parakeetModelPath,
  };
});
handle('local-engine:status', async (_e, preferred = {}) => {
  const cfg = settings.load();
  const preferredCliPath = String(Object.hasOwn(preferred, 'whisperCliPath')
    ? preferred.whisperCliPath
    : cfg.whisperCliPath || '').trim();
  const runtime = preferredCliPath ? {} : resolveWhisperRuntime();
  const serverPath = runtime.serverPath || findWhisperServer(preferredCliPath);
  const cli = await whisperCli.validateWhisperCli(preferredCliPath || runtime.cliPath || '');
  const modelPath = String(Object.hasOwn(preferred, 'modelPath') ? preferred.modelPath : cfg.modelPath || '').trim();
  const diagnostics = localTranscription.diagnostics();
  return {
    ...diagnostics,
    available: Boolean(serverPath || cli.valid),
    serverPath,
    cliPath: cli.valid ? cli.path : '',
    ready: diagnostics.ready && diagnostics.serverPath === serverPath && diagnostics.modelPath === modelPath,
  };
});

handle('history:get', () => history.load());
handle('history:stats', () => dictationStats.compute(history.load()));
handle('history:remove', (_e, id) => { history.remove(id); broadcastHistory(); return history.load(); });
handle('history:clear', () => { history.clear(); broadcastHistory(); return []; });
handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text || '').slice(0, 5_000_000)); return true; });
handle('update:check', () => updater.check());
handle('update:set-channel', (_e, payload = {}) => {
  const current = settings.load();
  const channel = payload.channel === 'nightly' ? 'nightly' : 'stable';
  const requiresConfirmation = current.updateChannel === 'nightly' && channel === 'stable';
  if (requiresConfirmation && payload.confirmDowngrade !== true) {
    throw new Error('Switching from Nightly to Stable requires confirmation.');
  }
  const saved = settings.save({
    updateChannel: channel,
    allowUpdateDowngrade: requiresConfirmation ? 'true' : 'false',
  });
  updater.configure(saved);
  return shortcutMetadata(saved);
});
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
  localTranscription: localTranscription.diagnostics(),
  nativeTranscription: nativeTranscription.diagnostics(),
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
      localTranscriber: (filename, localSettings, options = {}) => localSettings.engineKind === 'parakeet'
        ? nativeTranscription.transcribe(filename, localSettings, options)
        : localTranscription.transcribe(filename, localSettings, options),
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
        kind: 'meeting',
        text: m.transcript,
        userNotes: m.userNotes || '',
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

// Dev-only icon: the brand mark padded to standard icon margins (artwork ≈
// 824/1024 on a transparent 1024 canvas — full-bleed looks oversized in the
// Dock) with a "DEV" ribbon so a dev run is distinguishable from an installed
// copy. Rendered on a hidden window's canvas; the source PNG is inlined as a
// data URL so the canvas is not tainted and toDataURL stays allowed.
let devBadgedIconPromise = null;
function getDevBadgedIcon() {
  if (!devBadgedIconPromise) {
    devBadgedIconPromise = (async () => {
      const markBase64 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand-mark.png')).toString('base64');
      const win = new BrowserWindow({ show: false, width: 64, height: 64 });
      try {
        await win.loadURL('about:blank');
        const dataUrl = await win.webContents.executeJavaScript(`(async () => {
          const img = new Image();
          img.src = 'data:image/png;base64,${markBase64}';
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 1024; c.height = 1024;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 100, 100, 824, 824);
          const w = 540, h = 220, x = (1024 - w) / 2, y = 1024 - h - 70;
          ctx.fillStyle = '#ff9500';
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, h / 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 150px -apple-system, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('DEV', 512, y + h / 2 + 10);
          return c.toDataURL('image/png');
        })()`);
        return nativeImage.createFromDataURL(dataUrl);
      } finally {
        win.destroy();
      }
    })();
  }
  return devBadgedIconPromise;
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  // In dev mode the macOS Dock shows the stock Electron icon (the packaged
  // build gets its icon from the .icns in the bundle). Use the DEV-badged
  // brand mark so dev runs are recognisable and distinguishable from an
  // installed copy of the app.
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    getDevBadgedIcon()
      .then((icon) => app.dock.setIcon(icon))
      .catch((err) => log.warn('[main] dev dock icon failed:', err.message));
  }
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
  updater.init({
    onStatus: sendUpdateStatus,
    getUpdatePreferences: () => settings.load(),
    onUpdateDowngradeConsumed: () => settings.save({ allowUpdateDowngrade: 'false' }),
  });
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
    if (process.env.CRUNCHYMURMUR_E2E === '1') {
      app.on('crunchymurmur:e2e-hotkey-release', () => {
        isDictating = false;
        isProcessing = false;
        showFloating('flushing');
      });
    }
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
  if (cfg.engineKind === 'local' && cfg.modelPath) {
    localTranscription.prepare(cfg).catch((error) => {
      log.debug(`[local-transcription] startup preload skipped: ${error.message || error}`);
    });
  }
  if (cfg.engineKind === 'parakeet' && cfg.parakeetModelPath) {
    nativeTranscription.prepare(cfg).catch((error) => {
      log.debug(`[native-transcription] startup preload skipped: ${error.message || error}`);
    });
  }
  const pruned = meetings.cleanupAudio(cfg.audioRetentionPolicy);
  if (pruned) log.info(`[main] removed audio from ${pruned} meeting(s)`);
  if (cfg.autoUpdate === 'true') {
    setTimeout(() => updater.check().catch((err) => log.warn('[updater] automatic check failed:', err.message)), 10_000);
  }
  const runtime = resolveWhisperRuntime();
  const needsSetup = cfg.engineKind === 'groq'
    ? !cfg.groqApiKey
    : cfg.engineKind === 'parakeet'
      ? !cfg.parakeetModelPath
      : (!(cfg.whisperCliPath || runtime.cliPath) || !cfg.modelPath);
  if (needsSetup || process.argv.includes('--show')) {
    showMainWindow();
  }
});

app.on('second-instance', () => showMainWindow());

// macOS: reopen the main window when the Dock icon is clicked (the app
// otherwise lives in the tray with no visible window).
app.on('activate', () => showMainWindow());

app.on('window-all-closed', (e) => {
  // Tray app — don't quit when the main window closes.
  e.preventDefault?.();
});

// Squirrel.Mac's quitAndInstall emits before-quit-for-update and then
// closes every window; the regular before-quit only fires after the windows
// are gone. Without marking the quit here first, the tray-app close
// interceptor hides the main window instead of letting it close, and the
// update restart silently never happens on macOS. electron-updater emits
// the event on Electron's native autoUpdater module, not on app.
nativeAutoUpdater.on('before-quit-for-update', () => {
  isQuitting = true;
});

app.on('before-quit', () => {
  isQuitting = true;
  localTranscription.dispose();
  nativeTranscription.dispose();
  if (activeMeetingId) {
    try { meetings.finishMicWav(activeMeetingId); }
    catch (err) { console.error('[main] failed to finalize meeting during quit:', err); }
    activeMeetingId = null;
  }
  hotkeys.stop();
});
