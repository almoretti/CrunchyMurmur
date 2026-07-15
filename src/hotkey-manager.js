const { globalShortcut } = require('electron');
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let windowsHook = null;
let ctrlDown = false;
let metaDown = false;
let chordActive = false;
let macHelper = null;
const E2E_RELEASE_EVENT = 'crunchymurmur:e2e-hotkey-release';

function releaseWindowsChord() {
  ctrlDown = false;
  metaDown = false;
  if (!chordActive) return false;
  chordActive = false;
  windowsHook?.onUp();
  return true;
}

function isWindowsModifierChord(accelerator) {
  if (process.platform !== 'win32') return false;
  const tokens = String(accelerator || '').split('+').map((part) => part.trim().toLowerCase()).filter(Boolean);
  const normalized = new Set(tokens.map((token) => (
    token === 'ctrl' ? 'control' : token === 'meta' || token === 'win' ? 'super' : token
  )));
  return normalized.size === 2 && normalized.has('control') && normalized.has('super');
}

function stop() {
  app.removeListener(E2E_RELEASE_EVENT, releaseWindowsChord);
  globalShortcut.unregisterAll();
  if (macHelper) {
    try { macHelper.kill(); } catch {}
    macHelper = null;
  }
  if (!windowsHook) return;
  if (chordActive) windowsHook.onUp();
  try {
    windowsHook.uIOhook.removeAllListeners('keydown');
    windowsHook.uIOhook.removeAllListeners('keyup');
    windowsHook.uIOhook.stop();
  } catch {}
  windowsHook = null;
  ctrlDown = false;
  metaDown = false;
  chordActive = false;
}

function registerMacFn(onDown, onUp) {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'native', 'CrunchyMurmurNative')
    : path.join(app.getAppPath(), 'build', 'native', 'CrunchyMurmurNative');
  macHelper = spawn(executable, ['fn'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '';
  macHelper.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line === 'DOWN') onDown();
      if (line === 'UP') onUp();
    }
  });
  macHelper.stderr.on('data', (chunk) => console.warn('[hotkey] macOS helper:', chunk.toString().trim()));
  macHelper.on('error', (error) => console.error('[hotkey] macOS Fn helper failed:', error));
}

function registerWindowsModifierChord(onDown, onUp) {
  const { uIOhook, UiohookKey } = require('uiohook-napi');
  const ctrlKeys = new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
  const metaKeys = new Set([UiohookKey.Meta, UiohookKey.MetaRight]);
  windowsHook = { uIOhook, onUp };

  uIOhook.on('keydown', (event) => {
    if (ctrlKeys.has(event.keycode)) ctrlDown = true;
    if (metaKeys.has(event.keycode)) metaDown = true;
    if (ctrlDown && metaDown && !chordActive) {
      chordActive = true;
      onDown();
    }
  });
  uIOhook.on('keyup', (event) => {
    if (ctrlKeys.has(event.keycode)) ctrlDown = false;
    if (metaKeys.has(event.keycode)) metaDown = false;
    if (chordActive && (!ctrlDown || !metaDown)) {
      releaseWindowsChord();
    }
  });
  if (process.env.CRUNCHYMURMUR_E2E === '1') app.on(E2E_RELEASE_EVENT, releaseWindowsChord);
  uIOhook.start();
}

function register(accelerator, { onDown, onUp, onToggle }) {
  stop();
  const value = String(accelerator || '').trim();
  try {
    if (isWindowsModifierChord(value)) {
      registerWindowsModifierChord(onDown, onUp);
      return value;
    }
    if (process.platform === 'darwin' && value.toLowerCase() === 'fn') {
      registerMacFn(onDown, onUp);
      return 'Fn';
    }
    if (!globalShortcut.register(value, onToggle)) {
      throw new Error(`The shortcut “${value}” is unavailable. It may already be used by another application.`);
    }
    return value;
  } catch (error) {
    stop();
    throw error;
  }
}

module.exports = { register, stop, isWindowsModifierChord };
