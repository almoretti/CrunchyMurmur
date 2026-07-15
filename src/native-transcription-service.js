const readline = require('readline');
const { spawn } = require('child_process');

const PARAKEET_LANGUAGES = new Set([
  'auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu',
  'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk',
]);
const LOAD_TIMEOUT_MS = 5 * 60 * 1000;
const INFERENCE_TIMEOUT_MS = 10 * 60 * 1000;

function parakeetSupportsLanguage(language) {
  return PARAKEET_LANGUAGES.has(String(language || 'auto').toLowerCase());
}

class NativeTranscriptionService {
  constructor({ resolveExecutable, spawnProcess = spawn, logger = console, loadTimeoutMs = LOAD_TIMEOUT_MS, inferenceTimeoutMs = INFERENCE_TIMEOUT_MS } = {}) {
    this.resolveExecutable = resolveExecutable;
    this.spawnProcess = spawnProcess;
    this.logger = logger;
    this.child = null;
    this.lines = null;
    this.pending = null;
    this.modelPath = '';
    this.startPromise = null;
    this.loadTimeoutMs = loadTimeoutMs;
    this.inferenceTimeoutMs = inferenceTimeoutMs;
    this.stats = {
      backend: 'transcribe-rs',
      ready: false,
      modelPath: '',
      lastLoadMs: null,
      lastInferenceMs: null,
      lastError: '',
    };
  }

  diagnostics() {
    return { ...this.stats, executablePath: this.resolveExecutable?.() || '' };
  }

  async prepare({ parakeetModelPath }, { signal } = {}) {
    const modelPath = String(parakeetModelPath || '').trim();
    if (!modelPath) throw new Error('Download Parakeet V3 before using this engine.');
    if (this.stats.ready && this.modelPath === modelPath) return this.diagnostics();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start(modelPath, signal).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async #start(modelPath, signal) {
    this.dispose();
    const executable = this.resolveExecutable?.();
    if (!executable) throw new Error('The bundled local transcription engine is missing.');

    const child = this.spawnProcess(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8_000); });
    child.once('error', (error) => this.#failPending(error));
    child.once('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.stats.ready = false;
      this.#failPending(new Error(`Local transcription engine exited ${code}: ${stderr.trim() || 'no error output'}`));
    });

    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on('line', (line) => {
      if (!this.pending) return;
      try {
        const response = JSON.parse(line);
        if (!response.ok) this.#failPending(new Error(response.error || 'Local transcription failed.'));
        else this.#resolvePending(response);
      } catch (error) {
        this.#failPending(new Error(`Invalid response from local transcription engine: ${error.message}`));
      }
    });

    const response = await this.#request({ action: 'load', modelPath }, { signal, timeoutMs: this.loadTimeoutMs });
    this.modelPath = modelPath;
    this.stats.ready = true;
    this.stats.modelPath = modelPath;
    this.stats.lastLoadMs = response.loadMs ?? null;
    this.stats.lastError = '';
    this.logger.info?.(`[native-transcription] engine=parakeet modelLoadMs=${this.stats.lastLoadMs}`);
    return this.diagnostics();
  }

  async transcribe(audioPath, settings, { signal } = {}) {
    if (!parakeetSupportsLanguage(settings?.language)) {
      throw new Error('Parakeet V3 does not support the selected language. Choose Whisper for broader language support.');
    }
    if (signal?.aborted) throw new Error('Transcription cancelled.');
    await this.prepare(settings, { signal });
    const response = await this.#request({
      action: 'transcribe',
      modelPath: this.modelPath,
      audioPath,
    }, { signal, timeoutMs: this.inferenceTimeoutMs });
    this.stats.lastInferenceMs = response.inferenceMs ?? null;
    this.stats.lastError = '';
    this.logger.info?.(`[native-transcription] engine=parakeet inferenceMs=${this.stats.lastInferenceMs}`);
    return String(response.text || '').trim();
  }

  #request(message, { signal, timeoutMs } = {}) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Local transcription engine is not running.'));
    if (this.pending) return Promise.reject(new Error('Local transcription engine is busy.'));
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.#failPending(new Error('Transcription cancelled.'));
        this.#terminateChild();
      };
      const timer = timeoutMs ? setTimeout(() => {
        this.#failPending(new Error('Local transcription engine timed out.'));
        this.#terminateChild();
      }, timeoutMs) : null;
      timer?.unref?.();
      this.pending = { resolve, reject, timer, cleanup: () => signal?.removeEventListener('abort', abort) };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      this.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) this.#failPending(error);
      });
    }).catch((error) => {
      this.stats.lastError = error.message || String(error);
      throw error;
    });
  }

  #failPending(error) {
    if (!this.pending) return;
    const { reject, timer, cleanup } = this.pending;
    this.pending = null;
    if (timer) clearTimeout(timer);
    cleanup?.();
    reject(error);
  }

  #resolvePending(response) {
    if (!this.pending) return;
    const { resolve, timer, cleanup } = this.pending;
    this.pending = null;
    if (timer) clearTimeout(timer);
    cleanup?.();
    resolve(response);
  }

  #terminateChild() {
    const child = this.child;
    this.child = null;
    this.stats.ready = false;
    this.modelPath = '';
    try { this.lines?.close(); } catch {}
    this.lines = null;
    try { child?.kill(); } catch {}
  }

  dispose() {
    const child = this.child;
    this.child = null;
    this.stats.ready = false;
    this.modelPath = '';
    this.#failPending(new Error('Local transcription engine stopped.'));
    try { this.lines?.close(); } catch {}
    this.lines = null;
    try { child?.stdin?.end(`${JSON.stringify({ action: 'shutdown' })}\n`); } catch {}
    setTimeout(() => {
      try { if (child && !child.killed) child.kill(); } catch {}
    }, 1_000).unref?.();
  }
}

module.exports = { NativeTranscriptionService, parakeetSupportsLanguage };
