// Dev-only helper (macOS): get the dev Electron binary into the Accessibility
// and Input Monitoring permission lists without hunting for it manually.
//
// In dev mode the app runs inside node_modules/electron/dist/Electron.app,
// and when launched from a terminal, macOS attributes TCC permissions to the
// *terminal app* (the "responsible process" — e.g. Ghostty, Terminal, iTerm),
// not to Electron or CrunchyMurmur.app. So the entry that appears in System
// Settings is your terminal, and granting it covers every dev run started
// from that terminal. macOS never lets a process grant itself these
// permissions, but requesting them here makes the system add the right entry
// to the lists automatically, so all that's left is flipping the toggle.
//
// Run with: npm run dev:permissions
const { app, systemPreferences, shell } = require('electron');

if (process.platform !== 'darwin') {
  console.log('dev:permissions is only needed on macOS.');
  process.exit(0);
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  // Prompts and adds "Electron" to Privacy & Security → Accessibility.
  const accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(true);

  // Starting the global key listener triggers the Input Monitoring prompt,
  // which has an Allow button and adds "Electron" to that list too.
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.start();
    setTimeout(() => { try { uIOhook.stop(); } catch { /* already stopped */ } }, 3000);
  } catch (err) {
    console.warn('Could not trigger the Input Monitoring prompt:', err.message);
  }

  console.log('');
  console.log('Accessibility: ' + (accessibilityTrusted ? 'already granted ✓' : 'prompt shown — "Electron" is now in the list, toggle it on'));
  console.log('Input Monitoring: click Allow on the prompt (or toggle "Electron" in the list)');
  console.log('');

  if (accessibilityTrusted) {
    app.quit();
    return;
  }

  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  console.log('Waiting for Accessibility to be granted (Ctrl+C to skip)…');
  const started = Date.now();
  const poll = setInterval(() => {
    if (systemPreferences.isTrustedAccessibilityClient(false)) {
      clearInterval(poll);
      console.log('Accessibility granted ✓ — restart the app (npm start) to pick it up.');
      app.quit();
    } else if (Date.now() - started > 5 * 60 * 1000) {
      clearInterval(poll);
      console.log('Timed out waiting. Toggle "Electron" on in System Settings, then restart the app.');
      app.quit();
    }
  }, 2000);
});
