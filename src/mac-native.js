const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

function executablePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'native', 'CrunchyMurmurNative')
    : path.join(app.getAppPath(), 'build', 'native', 'CrunchyMurmurNative');
}

function run(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') return reject(new Error('macOS native integration is unavailable on this platform.'));
    const child = spawn(executablePath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('macOS integration timed out.')); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `macOS integration exited ${code}`));
    });
  });
}

async function calendarEvents() {
  const rows = JSON.parse(await run(['calendar']) || '[]');
  return rows.map((row) => ({
    uid: `eventkit-${row.id}`,
    title: row.title,
    location: row.location || '',
    description: '',
    start: row.start,
    end: row.end,
    isAllDay: Boolean(row.isAllDay),
    feedId: 'macos-eventkit',
    calendarName: row.calendar,
    color: '#bf5af2',
  }));
}

async function permissionStatus() {
  return JSON.parse(await run(['permission-status'], 5_000) || '{}');
}

module.exports = { executablePath, run, calendarEvents, permissionStatus };
