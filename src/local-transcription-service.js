const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { transcribeWav } = require('./transcriber');

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_STARTUP_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_RETRY_BACKOFF_MS = 60 * 1000;
const HEALTH_REQUEST_TIMEOUT_MS = 1_000;
const INFERENCE_TIMEOUT_MS = 10 * 60 * 1000;

function boundedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function serverExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
}

function findWhisperServer(whisperCliPath, {
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync,
} = {}) {
  const candidates = [];
  if (whisperCliPath) candidates.push(path.join(path.dirname(whisperCliPath), serverExecutableName(platform)));

  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  for (const directory of String(env.PATH || '').split(platformPath.delimiter)) {
    if (directory) candidates.push(platformPath.join(directory, serverExecutableName(platform)));
  }

  if (platform === 'win32') {
    candidates.push(
      platformPath.join(env.ProgramFiles || 'C:\\Program Files', 'whisper.cpp', 'whisper-server.exe'),
      platformPath.join(env.LOCALAPPDATA || env.USERPROFILE || '', 'whisper.cpp', 'whisper-server.exe'),
    );
  } else {
    candidates.push('/opt/homebrew/bin/whisper-server', '/usr/local/bin/whisper-server', '/usr/bin/whisper-server');
  }
  return [...new Set(candidates.filter(Boolean))].find((candidate) => exists(candidate)) || '';
}

function chooseUnusedPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class LocalTranscriptionService {
  constructor({
    spawnProcess = spawn,
    fetchImpl = globalThis.fetch,
    choosePort = chooseUnusedPort,
    findServer = findWhisperServer,
    resolveRuntime = () => ({}),
    cliTranscribe = transcribeWav,
    readFile = fs.promises.readFile,
    now = () => Date.now(),
    sleep = delay,
    logger = console,
    readinessPollMs = 100,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    retryBackoffMs = DEFAULT_RETRY_BACKOFF_MS,
  } = {}) {
    this.spawnProcess = spawnProcess;
    this.fetchImpl = fetchImpl;
    this.choosePort = choosePort;
    this.findServer = findServer;
    this.resolveRuntime = resolveRuntime;
    this.cliTranscribe = cliTranscribe;
    this.readFile = readFile;
    this.now = now;
    this.sleep = sleep;
    this.logger = logger;
    this.readinessPollMs = readinessPollMs;
    this.startupTimeoutMs = startupTimeoutMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.retryBackoffMs = retryBackoffMs;
    this.session = null;
    this.starting = null;
    this.pendingChild = null;
    this.idleTimer = null;
    this.failedSession = null;
    this.stats = {
      backend: 'whisper-cli',
      serverPath: '',
      modelPath: '',
      launches: 0,
      transcriptions: 0,
      fallbacks: 0,
      lastLoadMs: null,
      lastInferenceMs: null,
      lastError: '',
    };
  }

  async prepare(settings, { signal } = {}) {
    const runtime = this.#runtime(settings);
    const serverPath = runtime.serverPath;
    if (!serverPath || !settings.modelPath) return false;
    const key = `${serverPath}\n${settings.modelPath}`;
    if (this.failedSession?.key === key && this.now() < this.failedSession.retryAfter) return false;
    try {
      await this.#ensureSession(serverPath, settings.modelPath, signal);
    } catch (error) {
      this.failedSession = { key, retryAfter: this.now() + this.retryBackoffMs };
      throw error;
    }
    this.#armIdleTimer();
    return true;
  }

  async transcribe(wavPath, settings, { signal } = {}) {
    const runtime = this.#runtime(settings);
    const effectiveSettings = { ...settings, whisperCliPath: runtime.cliPath || settings.whisperCliPath };
    const serverPath = runtime.serverPath;
    const sessionKey = `${serverPath}\n${effectiveSettings.modelPath}`;
    const inBackoff = this.failedSession?.key === sessionKey && this.now() < this.failedSession.retryAfter;
    if (serverPath && effectiveSettings.modelPath && !inBackoff) {
      try {
        this.#disarmIdleTimer();
        const session = await this.#ensureSession(serverPath, effectiveSettings.modelPath, signal);
        const startedAt = this.now();
        const audio = await this.readFile(wavPath);
        const form = new FormData();
        form.append('file', new Blob([audio], { type: 'audio/wav' }), path.basename(wavPath));
        form.append('language', effectiveSettings.language || 'auto');
        form.append('response_format', 'json');
        form.append('temperature', '0.0');
        const response = await this.fetchImpl(`${session.url}/inference`, {
          method: 'POST',
          body: form,
          signal: boundedSignal(signal, INFERENCE_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`whisper-server returned HTTP ${response.status}: ${await response.text()}`);
        const payload = await response.json();
        this.stats.transcriptions += 1;
        this.stats.lastInferenceMs = this.now() - startedAt;
        this.stats.lastError = '';
        this.failedSession = null;
        this.#armIdleTimer();
        this.logger.info?.(`[local-transcription] backend=whisper-server inferenceMs=${this.stats.lastInferenceMs}`);
        return String(payload.text || '').trim();
      } catch (error) {
        if (signal?.aborted) throw error;
        this.stats.fallbacks += 1;
        this.stats.lastError = error.message || String(error);
        this.failedSession = { key: sessionKey, retryAfter: this.now() + this.retryBackoffMs };
        this.logger.warn?.(`[local-transcription] persistent server unavailable; using whisper-cli: ${this.stats.lastError}`);
        this.#stopSession();
      }
    }

    const startedAt = this.now();
    const result = await this.cliTranscribe(wavPath, effectiveSettings, { signal });
    this.stats.backend = 'whisper-cli';
    this.stats.serverPath = '';
    this.stats.modelPath = effectiveSettings.modelPath || '';
    this.stats.transcriptions += 1;
    this.stats.lastInferenceMs = this.now() - startedAt;
    return result;
  }

  diagnostics() {
    return { ...this.stats, ready: Boolean(this.session) };
  }

  dispose() {
    this.#stopSession();
    this.failedSession = null;
  }

  #runtime(settings) {
    if (settings.whisperCliPath) {
      return {
        cliPath: settings.whisperCliPath,
        serverPath: this.findServer(settings.whisperCliPath),
        bundled: false,
      };
    }
    const bundled = this.resolveRuntime() || {};
    return {
      cliPath: bundled.cliPath || '',
      serverPath: bundled.serverPath || '',
      bundled: Boolean(bundled.cliPath || bundled.serverPath),
    };
  }

  async #ensureSession(serverPath, modelPath, signal) {
    const key = `${serverPath}\n${modelPath}`;
    if (this.session?.key === key) return this.session;
    if (this.starting?.key === key) return this.starting.promise;
    this.#stopSession();

    const promise = this.#startSession({ key, serverPath, modelPath, signal });
    this.starting = { key, promise };
    try {
      return await promise;
    } finally {
      if (this.starting?.promise === promise) this.starting = null;
    }
  }

  async #startSession({ key, serverPath, modelPath, signal }) {
    const port = await this.choosePort();
    const url = `http://127.0.0.1:${port}`;
    const startedAt = this.now();
    const child = this.spawnProcess(serverPath, [
      '--model', modelPath,
      '--threads', String(Math.min(16, os.availableParallelism?.() || os.cpus().length || 4)),
      '--host', '127.0.0.1',
      '--port', String(port),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.pendingChild = child;
    this.stats.launches += 1;

    let output = '';
    child.stdout?.on('data', (chunk) => { output = `${output}${chunk}`.slice(-4_000); });
    child.stderr?.on('data', (chunk) => { output = `${output}${chunk}`.slice(-4_000); });
    let exited = false;
    let exitError = null;
    child.once('error', (error) => { exitError = error; });
    child.once('close', (code) => {
      exited = true;
      if (this.pendingChild === child) this.pendingChild = null;
      if (code && !exitError) exitError = new Error(`whisper-server exited ${code}: ${output.trim() || 'no error output'}`);
      if (this.session?.child === child) {
        this.session = null;
        this.stats.ready = false;
      }
    });

    const deadline = startedAt + this.startupTimeoutMs;
    while (this.now() <= deadline) {
      if (signal?.aborted) {
        try { child.kill(); } catch {}
        throw new Error('Transcription cancelled.');
      }
      if (exitError || exited) throw exitError || new Error('whisper-server exited before it became ready.');
      try {
        const response = await this.fetchImpl(`${url}/`, {
          signal: boundedSignal(signal, HEALTH_REQUEST_TIMEOUT_MS),
        });
        if (response.ok) {
          if (this.pendingChild !== child) throw new Error('whisper-server startup was cancelled.');
          this.pendingChild = null;
          this.session = { key, child, url };
          this.stats.backend = 'whisper-server';
          this.stats.serverPath = serverPath;
          this.stats.modelPath = modelPath;
          this.stats.lastLoadMs = this.now() - startedAt;
          this.stats.lastError = '';
          this.failedSession = null;
          this.logger.info?.(`[local-transcription] backend=whisper-server modelLoadMs=${this.stats.lastLoadMs}`);
          return this.session;
        }
      } catch {}
      await this.sleep(this.readinessPollMs);
    }
    try { child.kill(); } catch {}
    throw new Error(`whisper-server did not become ready within ${Math.ceil(this.startupTimeoutMs / 1000)} seconds.`);
  }

  #armIdleTimer() {
    this.#disarmIdleTimer();
    if (!this.idleTimeoutMs) return;
    this.idleTimer = setTimeout(() => this.#stopSession(), this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  #disarmIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  #stopSession() {
    this.#disarmIdleTimer();
    const child = this.session?.child;
    const pendingChild = this.pendingChild;
    this.session = null;
    this.pendingChild = null;
    if (child) {
      try { child.kill(); } catch {}
    }
    if (pendingChild && pendingChild !== child) {
      try { pendingChild.kill(); } catch {}
    }
  }
}

module.exports = {
  LocalTranscriptionService,
  findWhisperServer,
  serverExecutableName,
  chooseUnusedPort,
};
