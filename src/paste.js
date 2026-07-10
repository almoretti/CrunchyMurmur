const { clipboard } = require('electron');
const { execFile } = require('child_process');

function run(executable, args) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, timeout: 10_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function sendPasteShortcut() {
  if (process.platform === 'win32') {
    // Fixed script: no transcript text is interpolated into the command. The
    // text travels only through the clipboard, avoiding command injection.
    const script = [
      '$ErrorActionPreference = "Stop"',
      '$shell = New-Object -ComObject WScript.Shell',
      'Start-Sleep -Milliseconds 40',
      '$shell.SendKeys("^v")',
    ].join('; ');
    return run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-Command', script,
    ]);
  }

  if (process.platform === 'darwin') {
    return run('/usr/bin/osascript', [
      '-e', 'tell application "System Events" to keystroke "v" using command down',
    ]);
  }

  // Wayland compositors generally use wtype; X11 desktops use xdotool.
  // Neither is bundled because both interact with the user's display server.
  if (process.env.WAYLAND_DISPLAY) {
    try { return await run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']); } catch {}
  }
  return run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
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

  let pasted = false;
  try {
    await sendPasteShortcut();
    pasted = true;
  } catch (e) {
    // Fall back: leave it on the clipboard. The user can paste manually.
    console.error('[paste] synthesized paste failed:', e);
  }

  // Restore the prior clipboard contents after the target app has had time to read.
  if (pasted) {
    setTimeout(() => {
      if (prior !== text) clipboard.writeText(prior);
    }, 350);
  }
  return pasted;
}

module.exports = { pasteText };
