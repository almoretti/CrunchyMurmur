const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, clipboard, screen, nativeImage } = require('electron');

const settings = require('./settings');
const history = require('./history');
const { transcribeWav, writeTempWav } = require('./transcriber');
const { transcribeWithGroq } = require('./groq');
const { pasteText } = require('./paste');
const { startHoldListener, stopHoldListener } = require('./hotkey');

let tray = null;
let mainWindow = null;
let floatingWindow = null;
let isProcessing = false;

// ---------- Windows ----------

function createFloatingWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workArea;

  floatingWindow = new BrowserWindow({
    width: 220,
    height: 44,
    x: Math.round(width / 2 - 110),
    y: height - 64,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-floating.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  floatingWindow.loadFile(path.join(__dirname, '..', 'ui', 'floating.html'));
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
    title: 'WisperHelp',
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'main.html'));
}

function broadcastHistory() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history:changed', history.load());
  }
}

// ---------- Tray ----------

function createTray() {
  // 16×16 transparent placeholder; user can drop a real .ico into assets/.
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
  } catch {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip('WisperHelp — hold Ctrl+Win to dictate');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open WisperHelp', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

// ---------- Recording lifecycle ----------

function onHotkeyDown() {
  if (isProcessing) return;
  showFloating('recording');
}

function onHotkeyUp() {
  if (isProcessing) return;
  showFloating('flushing');
  // The actual stop happens in the renderer when it sees the 'flushing' state;
  // it then submits samples back to main via IPC.
}

ipcMain.handle('floating:submit-samples', async (_e, samples) => {
  if (!Array.isArray(samples) || samples.length < 16000 / 4) {
    // < 250 ms — too short; bail.
    hideFloating();
    return { ok: false, error: 'Recording too short.' };
  }

  isProcessing = true;
  showFloating('transcribing');

  try {
    const wavPath = writeTempWav(Float32Array.from(samples));
    const cfg = settings.load();
    const text = cfg.engineKind === 'groq'
      ? await transcribeWithGroq(wavPath, cfg)
      : await transcribeWav(wavPath, cfg);
    const cleaned = (text || '').trim();

    if (cleaned) {
      history.add({ text: cleaned, language: cfg.language, durationSec: samples.length / 16000 });
      broadcastHistory();
      await pasteText(cleaned);
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
    isProcessing = false;
    hideFloating();
  }
});

// ---------- IPC: settings, history, clipboard ----------

ipcMain.handle('settings:get', () => settings.load());

ipcMain.handle('settings:save', (_e, partial) => settings.save(partial || {}));

ipcMain.handle('settings:pick-file', async (_e, filters) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [{ name: 'All files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('history:get', () => history.load());
ipcMain.handle('history:remove', (_e, id) => { history.remove(id); broadcastHistory(); return history.load(); });
ipcMain.handle('history:clear', () => { history.clear(); broadcastHistory(); return []; });
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(text || ''); return true; });

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  createTray();
  createFloatingWindow();
  startHoldListener({ onDown: onHotkeyDown, onUp: onHotkeyUp });

  // Open the main window on first launch when nothing is configured yet.
  const cfg = settings.load();
  const needsSetup = cfg.engineKind === 'groq'
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup) {
    showMainWindow();
  }
});

app.on('window-all-closed', (e) => {
  // Tray app — don't quit when the main window closes.
  e.preventDefault?.();
});

app.on('before-quit', () => {
  stopHoldListener();
});
