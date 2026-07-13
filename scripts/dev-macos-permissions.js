// Dev-only helper (macOS): get a dev run into the Accessibility and Input
// Monitoring permission lists without hunting for the right entry manually.
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

const ACCESSIBILITY_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const INPUT_MONITORING_GRACE_MS = 15_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  // Prompts and adds the responsible app (your terminal) to
  // Privacy & Security → Accessibility.
  const accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(true);

  // Starting the global key listener triggers the Input Monitoring prompt,
  // which has an Allow button and adds your terminal to that list too. There
  // is no API to observe that grant, so keep the listener (and the process)
  // alive for a grace period rather than exiting while the prompt is pending.
  let inputMonitoringSettled = false;
  let hook = null;
  try {
    ({ uIOhook: hook } = require('uiohook-napi'));
    hook.start();
  } catch (err) {
    console.warn('Could not trigger the Input Monitoring prompt:', err.message);
    inputMonitoringSettled = true;
  }

  console.log('');
  console.log('Accessibility: ' + (accessibilityTrusted
    ? 'already granted ✓'
    : 'prompt shown — your terminal app is now in the list, toggle it on'));
  if (!inputMonitoringSettled) {
    console.log('Input Monitoring: click Allow on the prompt (or toggle your terminal app in that list)');
  }
  console.log('');

  let accessibilitySettled = accessibilityTrusted;
  const quitWhenSettled = () => {
    if (accessibilitySettled && inputMonitoringSettled) {
      if (hook) { try { hook.stop(); } catch { /* already stopped */ } }
      app.quit();
    }
  };

  if (!inputMonitoringSettled) {
    setTimeout(() => {
      inputMonitoringSettled = true;
      quitWhenSettled();
    }, INPUT_MONITORING_GRACE_MS);
  }

  if (accessibilitySettled) {
    quitWhenSettled();
    return;
  }

  shell.openExternal(ACCESSIBILITY_PANE).catch((err) => {
    console.warn('Could not open System Settings automatically:', err.message);
    console.log('Open it manually: System Settings → Privacy & Security → Accessibility, then toggle your terminal app on.');
  });
  console.log('Waiting for Accessibility to be granted (Ctrl+C to skip)…');
  const started = Date.now();
  const poll = setInterval(() => {
    if (systemPreferences.isTrustedAccessibilityClient(false)) {
      clearInterval(poll);
      console.log('Accessibility granted ✓ — restart the app (npm start) to pick it up.');
      accessibilitySettled = true;
      quitWhenSettled();
    } else if (Date.now() - started > POLL_TIMEOUT_MS) {
      clearInterval(poll);
      console.log('Timed out waiting. Toggle your terminal app on in System Settings, then restart the app.');
      accessibilitySettled = true;
      quitWhenSettled();
    }
  }, 2000);
});
