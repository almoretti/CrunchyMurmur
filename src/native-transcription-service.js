const readline = require('readline');
const { spawn } = require('child_process');

const PARAKEET_LANGUAGES = new Set([
  'auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu',
  'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk',
]);

function parakeetSupportsLanguage(language) {
  return PARAKEET_LANGUAGES.has(String(language || 'auto').toLowerCase());
}

class NativeTranscriptionService {
  constructor({ resolveExecutable, spawnProcess = spawn, logger = console } = {}) {
    this.resolveExecutable = resolveExecutable;
    this.spawnProcess = spawnProcess;
    this.logger = logger;
    this.child = null;
    this.lines = null;
    this.pending = null;
    this.modelPath = '';
    this.startPromise = null;
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

  async prepare({ parakeetModelPath }) {
    const modelPath = String(parakeetModelPath || '').trim();
    if (!modelPath) throw new Error('Download Parakeet V3 before using this engine.');
    if (this.stats.ready && this.modelPath === modelPath) return this.diagnostics();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start(modelPath).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async #start(modelPath) {
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
      const { resolve, reject } = this.pending;
      this.pending = null;
      try {
        const response = JSON.parse(line);
        if (!response.ok) reject(new Error(response.error || 'Local transcription failed.'));
        else resolve(response);
      } catch (error) {
        reject(new Error(`Invalid response from local transcription engine: ${error.message}`));
      }
    });

    const response = await this.#request({ action: 'load', modelPath });
    this.modelPath = modelPath;
    this.stats.ready = true;
    this.stats.modelPath = modelPath;
    this.stats.lastLoadMs = response.loadMs ?? null;
    this.stats.lastError = '';
    this.logger.info?.(`[native-transcription] engine=parakeet modelLoadMs=${this.stats.lastLoadMs}`);
    return this.diagnostics();
  }

  async transcribe(audioPath, settings) {
    if (!parakeetSupportsLanguage(settings?.language)) {
      throw new Error('Parakeet V3 does not support the selected language. Choose Whisper for broader language support.');
    }
    await this.prepare(settings);
    const response = await this.#request({
      action: 'transcribe',
      modelPath: this.modelPath,
      audioPath,
    });
    this.stats.lastInferenceMs = response.inferenceMs ?? null;
    this.stats.lastError = '';
    this.logger.info?.(`[native-transcription] engine=parakeet inferenceMs=${this.stats.lastInferenceMs}`);
    return String(response.text || '').trim();
  }

  #request(message) {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Local transcription engine is not running.'));
    if (this.pending) return Promise.reject(new Error('Local transcription engine is busy.'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
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
    const { reject } = this.pending;
    this.pending = null;
    reject(error);
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
