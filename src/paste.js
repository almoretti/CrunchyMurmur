const { clipboard } = require('electron');

let nut = null;
function loadNut() {
  if (nut) return nut;
  // Lazy-require so the dev console on macOS doesn't error on startup
  // (nut-js prebuilds are platform-specific).
  nut = require('@nut-tree-fork/nut-js');
  // Tighten the timing so Ctrl+V isn't perceived as a delayed insert.
  nut.keyboard.config.autoDelayMs = 0;
  return nut;
}

/**
 * Paste `text` into the focused application:
 *   1. Save current clipboard contents.
 *   2. Write `text` to clipboard.
 *   3. Synthesize Ctrl+V.
 *   4. Restore the prior clipboard a moment later.
 */
async function pasteText(text) {
  const prior = clipboard.readText();
  clipboard.writeText(text);

  try {
    const { keyboard, Key } = loadNut();
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);
  } catch (e) {
    // Fall back: leave it on the clipboard. The user can hit Ctrl+V themselves.
    console.error('[paste] nut-js failed:', e);
  }

  // Restore the prior clipboard contents after the target app has had time to read.
  setTimeout(() => {
    if (prior !== text) clipboard.writeText(prior);
  }, 350);
}

module.exports = { pasteText };
