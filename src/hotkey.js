/**
 * Hold-Ctrl+Win to talk.
 *
 * Electron's globalShortcut can't detect "hold" — it fires once on press, no
 * release event. We use node-global-key-listener which exposes raw down/up
 * events from a low-level Win32 keyboard hook (prebuilt native helper, no
 * compile step needed).
 *
 * Recording starts the moment BOTH Ctrl and Win are held, and stops the
 * moment EITHER is released.
 */

let listener = null;

const CTRL_KEYS = new Set(['LEFT CTRL', 'RIGHT CTRL']);
const WIN_KEYS  = new Set(['LEFT META', 'RIGHT META']);

function startHoldListener({ onDown, onUp }) {
  if (listener) return listener;

  const { GlobalKeyboardListener } = require('node-global-key-listener');
  listener = new GlobalKeyboardListener();

  let ctrlHeld = false;
  let winHeld = false;
  let recording = false;

  listener.addListener((e) => {
    if (!e || !e.name) return;
    const isCtrl = CTRL_KEYS.has(e.name);
    const isWin  = WIN_KEYS.has(e.name);
    if (!isCtrl && !isWin) return;

    if (e.state === 'DOWN') {
      if (isCtrl) ctrlHeld = true;
      if (isWin)  winHeld  = true;
      if (ctrlHeld && winHeld && !recording) {
        recording = true;
        try { onDown(); } catch (err) { console.error('[hotkey] onDown error:', err); }
      }
    } else if (e.state === 'UP') {
      if (isCtrl) ctrlHeld = false;
      if (isWin)  winHeld  = false;
      if (recording && (!ctrlHeld || !winHeld)) {
        recording = false;
        try { onUp(); } catch (err) { console.error('[hotkey] onUp error:', err); }
      }
    }
  });

  return listener;
}

function stopHoldListener() {
  if (listener) {
    try { listener.kill(); } catch {}
    listener = null;
  }
}

module.exports = { startHoldListener, stopHoldListener };
