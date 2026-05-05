const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, clipboard, screen, nativeImage, shell } = require('electron');

// Force CPU rasterization for the *whole* app so the transparent floating
// pill renders reliably on Windows. GPU compositing has chronic Win+DWM
// bugs that make transparent BrowserWindows appear blank or as flat gray
// surfaces on certain hardware (we hit both on this machine). The cost is
// slightly slower animations on the main window — acceptable for our small
// UI surfaces and worth it for a proper-looking pill.
app.disableHardwareAcceleration();

// Bind the app to its own AppUserModelID so Windows groups our windows under
// a single taskbar entry with our icon — without this, in dev mode the
// taskbar inherits electron.exe's icon. Must be called before any window is
// created. The string matches package.json `build.appId`.
if (process.platform === 'win32') {
  app.setAppUserModelId('cc.moretti.crunchymurmur.windows');
}

// Force the runtime app name to match the productName from package.json so
// dev mode and packaged builds both write to %APPDATA%\CrunchyMurmur\
// (otherwise Electron uses the lowercased package "name" in dev, which
// would put data at %APPDATA%\crunchymurmur-windows\).
app.setName('CrunchyMurmur');

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

    // Don't clobber a fresh install: only migrate when the new dir is
    // missing or empty (no settings.json yet).
    if (fsx.existsSync(newDir)) {
      const entries = fsx.readdirSync(newDir);
      if (entries.length > 0) return;
    }

    const legacyDir = candidates[0];
    fsx.mkdirSync(parent, { recursive: true });
    try {
      fsx.rmSync(newDir, { recursive: true, force: true });
      fsx.renameSync(legacyDir, newDir);
    } catch (e) {
      if (e.code === 'EXDEV') {
        fsx.cpSync(legacyDir, newDir, { recursive: true });
        fsx.rmSync(legacyDir, { recursive: true, force: true });
      } else {
        throw e;
      }
    }
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
migrateLegacyDataDir();

const settings = require('./settings');
const history = require('./history');
const models = require('./models');
const notes = require('./notes-store');
const templates = require('./templates');
const aiNotes = require('./notes-generator');
const calendar = require('./calendar-store');
const meetings = require('./meetings-store');
const { transcribeWav, writeTempWav } = require('./transcriber');
const { transcribeWithGroq } = require('./groq');
const { pasteText } = require('./paste');
const { startHoldListener, stopHoldListener } = require('./hotkey');

let tray = null;
let mainWindow = null;
let floatingWindow = null;
let isProcessing = false;
let activeMeetingId = null;  // truthy while a meeting is recording

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
  floatingWindow.loadFile(path.join(__dirname, '..', 'ui', 'floating.html'));
  floatingWindow.webContents.once('did-finish-load', () => {
    console.log('[main] floating window loaded');
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
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
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
  tray.setToolTip('CrunchyMurmur — hold Ctrl+Win to dictate');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CrunchyMurmur', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

// ---------- Recording lifecycle ----------

function onHotkeyDown() {
  // Don't trigger dictation while a meeting is recording — the pill is
  // showing meeting state, and the renderer's audio graph is owned by the
  // meeting capture loop. Dictation is disabled until the meeting stops.
  if (isProcessing || activeMeetingId) return;
  showFloating('recording');
}

function onHotkeyUp() {
  if (isProcessing || activeMeetingId) return;
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

// ---------- IPC: models ----------

ipcMain.handle('models:catalog', () => models.getCatalog());
ipcMain.handle('models:installed', () => models.listInstalled());
ipcMain.handle('models:dir', () => models.modelsDir());
ipcMain.handle('models:open-dir', () => shell.openPath(models.modelsDir()));
ipcMain.handle('models:download', async (_e, id) => {
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
ipcMain.handle('models:cancel', (_e, id) => models.cancelDownload(id));
ipcMain.handle('models:remove', (_e, id) => {
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

ipcMain.handle('notes:snapshot',     () => notes.snapshot());
ipcMain.handle('notes:read',         (_e, payload) => notes.readNote(payload.folder, payload.filename));
ipcMain.handle('notes:create-folder',(_e, name) => { const s = notes.createFolder(name); broadcastNotes(); return s; });
ipcMain.handle('notes:rename-folder',(_e, p) => { const s = notes.renameFolder(p.oldName, p.newName); broadcastNotes(); return s; });
ipcMain.handle('notes:delete-folder',(_e, name) => { const s = notes.deleteFolder(name); broadcastNotes(); return s; });
ipcMain.handle('notes:reveal-folder',(_e, name) => notes.revealFolder(name));
ipcMain.handle('notes:create',       (_e, p) => { const r = notes.createNote(p); broadcastNotes(); return r; });
ipcMain.handle('notes:update',       (_e, p) => notes.updateNote(p));
ipcMain.handle('notes:delete',       (_e, p) => { const s = notes.deleteNote(p); broadcastNotes(); return s; });
ipcMain.handle('notes:rename',       (_e, p) => { const n = notes.renameNote(p); broadcastNotes(); return n; });
ipcMain.handle('notes:move',         (_e, p) => { const n = notes.moveNote(p); broadcastNotes(); return n; });
ipcMain.handle('notes:open-root',    () => shell.openPath(notes.rootDir()));

// ---------- IPC: templates ----------

ipcMain.handle('templates:list',   () => templates.list());
ipcMain.handle('templates:save',   (_e, t) => templates.save(t));
ipcMain.handle('templates:revert', (_e, id) => templates.revert(id));

// ---------- IPC: AI Notes generation ----------

ipcMain.handle('ai-notes:providers', () => aiNotes.listProviders());

// ---------- IPC: calendar ----------

function broadcastCalendar() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('calendar:changed', calendar.snapshot());
  }
}

ipcMain.handle('calendar:snapshot', () => calendar.snapshot());
ipcMain.handle('calendar:refresh',  async () => { await calendar.refreshAll(); broadcastCalendar(); return calendar.snapshot(); });
ipcMain.handle('calendar:add-feed', async (_e, payload) => {
  const id = calendar.addFeed(payload);
  await calendar.refresh(id).catch(() => {});
  broadcastCalendar();
  return id;
});
ipcMain.handle('calendar:update-feed', async (_e, payload) => {
  calendar.updateFeed(payload);
  await calendar.refresh(payload.id).catch(() => {});
  broadcastCalendar();
});
ipcMain.handle('calendar:remove-feed', (_e, id) => { calendar.removeFeed(id); broadcastCalendar(); });

// ---------- IPC: meetings ----------

function broadcastMeetings() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('meetings:changed', meetings.list());
  }
}

ipcMain.handle('meetings:list',   () => meetings.list());
ipcMain.handle('meetings:get',    (_e, id) => meetings.get(id));
ipcMain.handle('meetings:create', (_e, payload) => { const m = meetings.create(payload); broadcastMeetings(); return m; });
ipcMain.handle('meetings:update', (_e, payload) => { const m = meetings.update(payload.id, payload.partial || {}); broadcastMeetings(); return m; });
ipcMain.handle('meetings:delete', (_e, id) => { meetings.remove(id); broadcastMeetings(); return { ok: true }; });
ipcMain.handle('meetings:reveal', (_e, id) => meetings.reveal(id));
ipcMain.handle('meetings:save-audio', (_e, payload) => {
  // Renderer ships Float32 16 kHz mono samples; we encode and write the WAV.
  meetings.writeMicWav(payload.id, Float32Array.from(payload.samples));
  const m = meetings.update(payload.id, { endedAt: new Date().toISOString() });
  broadcastMeetings();
  return m;
});

// ----- Meeting <-> floating pill bridge -----
//
// When the user starts a meeting, the main-window renderer tells us so we can
// show the floating pill in 'meeting' state with the start timestamp. The
// pill ticks its own elapsed timer locally. Clicking the pill sends
// "request-stop" back to main, which forwards to the main-window renderer to
// stop the meeting (which in turn calls meetings:save-audio + meetings:pill-stop).

ipcMain.handle('meetings:pill-start', (_e, payload) => {
  activeMeetingId = payload.id;
  if (!floatingWindow) return;
  if (!floatingWindow.isVisible()) floatingWindow.showInactive();
  floatingWindow.webContents.send('floating:state', 'meeting');
  floatingWindow.webContents.send('floating:meeting-state', { startedAt: payload.startedAt });
});

ipcMain.handle('meetings:pill-stop', () => {
  activeMeetingId = null;
  hideFloating();
});

ipcMain.on('floating:request-stop-meeting', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('main:request-stop-meeting');
  }
});

ipcMain.handle('meetings:transcribe', async (_e, id) => {
  const m = meetings.get(id);
  if (!m) return { ok: false, error: 'Meeting not found.' };
  if (!m.hasMicAudio) return { ok: false, error: 'No audio captured for this meeting.' };
  const cfg = settings.load();
  try {
    const wav = meetings.micWavPath(id);
    const text = cfg.engineKind === 'groq'
      ? await require('./groq').transcribeWithGroq(wav, cfg)
      : await require('./transcriber').transcribeWav(wav, cfg);
    const updated = meetings.update(id, { transcript: (text || '').trim() });
    broadcastMeetings();
    return { ok: true, meeting: updated };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('meetings:send-to-notes', (_e, payload) => {
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

ipcMain.handle('meetings:generate-ai-notes', async (_e, payload) => {
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

ipcMain.handle('ai-notes:generate-from-recording', async (_e, payload) => {
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
