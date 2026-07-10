const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Locate a CLI across Windows, macOS, and Linux, including common package-manager paths.
function locate(name) {
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [
      path.join(home, 'AppData', 'Roaming', 'npm', `${name}.cmd`),
      path.join(home, 'AppData', 'Roaming', 'npm', `${name}.ps1`),
      path.join(home, 'AppData', 'Roaming', 'npm', `${name}.exe`),
      path.join(home, '.bun', 'bin', `${name}.exe`),
      path.join(home, '.deno', 'bin', `${name}.exe`),
      path.join(home, '.cargo', 'bin', `${name}.exe`),
    ]
    : [
      path.join(home, '.local', 'bin', name),
      path.join(home, '.bun', 'bin', name),
      path.join(home, '.cargo', 'bin', name),
      path.join(home, '.npm-global', 'bin', name),
      path.join('/opt/homebrew/bin', name),
      path.join('/usr/local/bin', name),
      path.join('/usr/bin', name),
    ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  // Fall through to the platform path lookup utility.
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(finder, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
    if (first && fs.existsSync(first)) return first;
  } catch {
    // Path lookup exits non-zero when not found; that's fine.
  }
  return null;
}

// Run a CLI with stdin = prompt, capture stdout/stderr, enforce timeout.
function run({ executable, args = [], stdinText = '', timeoutMs = 120_000, isolated = false }) {
  return new Promise((resolve, reject) => {
    // .cmd and .ps1 shims need a shell on Windows so the wrapper is interpreted.
    const isShim = /\.(cmd|ps1)$/i.test(executable);
    const cwd = isolated ? fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-ai-')) : undefined;
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: isShim,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });

    const cleanup = () => {
      if (cwd) try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
    };

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      reject(new Error(`${path.basename(executable)} timed out after ${Math.round(timeoutMs / 1000)} s.`));
    }, timeoutMs);

    child.on('error', (err) => { clearTimeout(timer); cleanup(); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });

    if (stdinText) {
      try { child.stdin.write(stdinText); } catch {}
    }
    try { child.stdin.end(); } catch {}
  });
}

module.exports = { locate, run };
