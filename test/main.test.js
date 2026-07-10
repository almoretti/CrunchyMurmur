const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

// src/main.js has heavy top-level side effects (single-instance lock, tray
// creation, window creation, IPC registration, etc.) and pulls in every
// other module in the app. To unit test createTray()'s icon-resize logic in
// isolation we replace 'electron' and every sibling module main.js requires
// with lightweight stand-ins, then trigger the captured
// app.whenReady().then(...) callback ourselves.

const MAIN_MODULE_PATH = require.resolve('../src/main.js');
const EXPECTED_ICON_PATH = path.join(path.dirname(MAIN_MODULE_PATH), '..', 'assets', 'tray-palette.png');

function makeFakeImage(state, label, empty) {
  return {
    label,
    isEmpty() { return empty; },
    resize(options) {
      state.resizeCalls.push({ label, options });
      return makeFakeImage(state, `${label}:resized`, false);
    },
  };
}

function createSiblingStubs() {
  return {
    'electron-log/main': {
      initialize: () => {},
      transports: { file: { maxSize: 0, getFile: () => ({ path: '/tmp/crunchymurmur-test.log' }) } },
      errorHandler: { startCatching: () => {} },
      error: () => {},
      warn: () => {},
      info: () => {},
    },
    './settings': {
      DEFAULTS: { hotkey: 'CommandOrControl+Shift+Space' },
      SECRET_MASK: '****',
      load: () => ({
        theme: 'system',
        hotkey: 'CommandOrControl+Shift+Space',
        engineKind: 'local',
        whisperCliPath: '/fake/whisper-cli',
        modelPath: '/fake/model.bin',
        groqApiKey: '',
        audioRetentionPolicy: 'never',
        autoUpdate: 'false',
        language: 'en',
      }),
      save: (partial) => partial,
      publicView: (cfg) => cfg || {},
      configPath: () => '/tmp/crunchymurmur-test-settings.json',
      defaultHotkey: () => 'CommandOrControl+Shift+Space',
    },
    './history': { load: () => [], add: () => {}, remove: () => {}, clear: () => {} },
    './dictation-stats': { compute: () => ({}) },
    './models': {
      getCatalog: () => [], listInstalled: () => [], modelsDir: () => '/tmp/models',
      downloadModel: async () => ({}), cancelDownload: () => {}, removeModel: () => {},
    },
    './notes-store': {
      snapshot: () => ({}), readNote: () => ({}), createFolder: () => ({}), renameFolder: () => ({}),
      deleteFolder: () => ({}), revealFolder: () => {}, createNote: () => ({ note: {} }), updateNote: () => ({}),
      deleteNote: () => ({}), renameNote: () => ({}), moveNote: () => ({}), rootDir: () => '/tmp/notes',
    },
    './templates': { list: () => [], save: () => ({}), revert: () => ({}) },
    './notes-generator': { listProviders: () => [], generateFromRecording: async () => ({}), saveToNotes: () => ({}) },
    './calendar-store': {
      snapshot: () => ({}), refreshAll: async () => {}, refresh: async () => {},
      addFeed: () => 'feed-id', updateFeed: () => {}, removeFeed: () => {},
    },
    './meetings-store': {
      list: () => [], get: () => null, create: () => ({ id: 'meeting-1' }), beginMicWav: () => {},
      appendMicSamples: () => {}, finishMicWav: () => ({}), abortMicWav: () => {}, beginSystemWav: () => {},
      appendSystemSamples: () => {}, finishSystemWav: () => {}, abortSystemWav: () => {}, remove: () => {},
      reveal: () => {}, totalAudioSize: () => 0, cleanupAudio: () => 0, deleteAudio: () => false,
      micWavPath: () => '', systemWavPath: () => '', update: () => ({}),
    },
    './updater': { check: async () => ({}), getStatus: () => ({}), init: () => {} },
    './transcriber': { transcribeWav: async () => '', writeTempWav: () => '' },
    './groq': { transcribeWithGroq: async () => '' },
    './dictation-formatter': { format: async (text) => text },
    './meeting-transcriber': { transcribeMeeting: async () => '' },
    './mac-native': { permissionStatus: async () => ({}) },
    './paste': { pasteText: async () => true },
    './hotkey-manager': { register: () => {}, stop: () => {} },
  };
}

function createElectronMock(nativeImageMode) {
  const state = {
    nativeImageCreateFromPathCalls: [],
    resizeCalls: [],
    trayInstances: [],
    readyCallback: null,
  };

  const nativeImage = {
    createFromPath(iconPath) {
      state.nativeImageCreateFromPathCalls.push(iconPath);
      if (nativeImageMode === 'throw') throw new Error('simulated decode failure');
      if (nativeImageMode === 'empty') return makeFakeImage(state, 'empty-source', true);
      return makeFakeImage(state, 'source', false);
    },
    createEmpty() { return makeFakeImage(state, 'created-empty', true); },
  };

  class Tray {
    constructor(image) {
      this.image = image;
      this.tooltip = null;
      this.contextMenu = null;
      this.listeners = {};
      state.trayInstances.push(this);
    }
    setToolTip(text) { this.tooltip = text; }
    setContextMenu(menu) { this.contextMenu = menu; }
    on(event, handler) { this.listeners[event] = handler; }
  }

  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = {
        once: () => {},
        send: () => {},
        setWindowOpenHandler: () => {},
        on: () => {},
        getURL: () => '',
        isLoading: () => false,
      };
    }
    on() {}
    loadFile() {}
    setAlwaysOnTop() {}
    isDestroyed() { return false; }
    show() {}
    focus() {}
    hide() {}
    isVisible() { return false; }
    setTitleBarOverlay() {}
  }

  const Menu = {
    buildFromTemplate: (template) => ({ template }),
    setApplicationMenu: () => {},
    getApplicationMenu: () => null,
  };

  const app = {
    name: 'CrunchyMurmur',
    commandLine: { appendSwitch: () => {} },
    disableHardwareAcceleration: () => {},
    setAppUserModelId: () => {},
    setName: () => {},
    requestSingleInstanceLock: () => true,
    getPath: () => '/tmp/crunchymurmur-test',
    getAppPath: () => '/tmp/crunchymurmur-test',
    getVersion: () => '1.0.0-test',
    isPackaged: false,
    quit: () => {},
    relaunch: () => {},
    on: () => {},
    whenReady: () => ({
      then(callback) { state.readyCallback = callback; },
    }),
  };

  const electron = {
    app,
    BrowserWindow,
    Tray,
    Menu,
    ipcMain: { handle: () => {}, on: () => {} },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showMessageBox: async () => ({ response: 0 }),
    },
    clipboard: { writeText: () => {} },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }) },
    nativeImage,
    shell: { openPath: async () => '', openExternal: async () => {}, showItemInFolder: () => {} },
    session: {
      defaultSession: {
        setDisplayMediaRequestHandler: () => {},
        setPermissionRequestHandler: () => {},
        setPermissionCheckHandler: () => {},
      },
    },
    systemPreferences: { isTrustedAccessibilityClient: () => true, getMediaAccessStatus: () => 'granted' },
    Notification: class { static isSupported() { return false; } show() {} },
    desktopCapturer: { getSources: async () => [] },
    nativeTheme: { shouldUseDarkColors: false, themeSource: 'system', on: () => {} },
  };

  return { electron, state };
}

function loadMainWithMocks(nativeImageMode) {
  delete require.cache[MAIN_MODULE_PATH];
  const { electron, state } = createElectronMock(nativeImageMode);
  const siblingStubs = createSiblingStubs();
  const originalLoad = Module._load;
  const originalArgv = process.argv;
  process.argv = ['node', 'main.js']; // guard against showMainWindow() firing via --show
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') return electron;
    if (Object.hasOwn(siblingStubs, request)) return siblingStubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    require(MAIN_MODULE_PATH);
  } finally {
    Module._load = originalLoad;
    process.argv = originalArgv;
  }
  assert.ok(state.readyCallback, 'app.whenReady().then() callback was not registered');
  state.readyCallback();
  return state;
}

test('createTray downsizes the source artwork to an 18x18 icon before handing it to the OS', () => {
  const state = loadMainWithMocks('success');
  assert.equal(state.nativeImageCreateFromPathCalls.length, 1);
  assert.equal(state.nativeImageCreateFromPathCalls[0], EXPECTED_ICON_PATH);
  assert.equal(state.resizeCalls.length, 1, 'the source icon should be resized exactly once');
  assert.deepEqual(state.resizeCalls[0].options, { width: 18, height: 18, quality: 'best' });
  assert.equal(state.trayInstances.length, 1);
  const [tray] = state.trayInstances;
  assert.equal(tray.image.label, 'source:resized');
  assert.equal(tray.image.isEmpty(), false);
  assert.equal(tray.tooltip, 'CrunchyMurmur — press the shortcut to dictate');
  assert.ok(tray.contextMenu, 'tray context menu was not set');
  assert.equal(typeof tray.listeners.click, 'function');
});

test('createTray skips resizing and falls back to an empty image when the source icon is empty', () => {
  const state = loadMainWithMocks('empty');
  assert.equal(state.resizeCalls.length, 0, 'resize should not be attempted on an already-empty image');
  assert.equal(state.trayInstances.length, 1);
  const [tray] = state.trayInstances;
  assert.equal(tray.image.label, 'created-empty');
  assert.equal(tray.image.isEmpty(), true);
});

test('createTray falls back to an empty image when reading the icon throws', () => {
  const state = loadMainWithMocks('throw');
  assert.equal(state.nativeImageCreateFromPathCalls.length, 1);
  assert.equal(state.resizeCalls.length, 0, 'resize should never run when decoding failed');
  assert.equal(state.trayInstances.length, 1);
  const [tray] = state.trayInstances;
  assert.equal(tray.image.label, 'created-empty');
  assert.equal(tray.image.isEmpty(), true);
});