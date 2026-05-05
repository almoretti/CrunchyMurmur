const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  engineKind: 'local', // 'local' | 'groq'
  whisperCliPath: '',
  modelPath: '',
  language: 'auto',
  groqApiKey: '',
  groqModel: 'whisper-large-v3-turbo',
  micDeviceId: '', // '' = OS default mic

  // AI Notes
  aiNotesProvider: 'anthropic',  // 'anthropic' | 'openai' (claudeCode/codex coming later)
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-6',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
};

function configPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeRaw(obj) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2), 'utf8');
}

// API key handling
//   On Windows, safeStorage.encryptString uses DPAPI under the hood, so the
//   encrypted blob can only be decrypted by the same Windows user account.
//   If encryption isn't available (rare; dev edge cases) we fall back to
//   plaintext so the app still works — flagged with a console warning.

// Maps cleartext field name → on-disk pair name. Each cleartext key is
// stripped before persistence and rehydrated on load.
const ENCRYPTED_KEYS = [
  { plain: 'groqApiKey',      encName: 'groqApiKeyEncrypted',      plainName: 'groqApiKeyPlain' },
  { plain: 'anthropicApiKey', encName: 'anthropicApiKeyEncrypted', plainName: 'anthropicApiKeyPlain' },
  { plain: 'openaiApiKey',    encName: 'openaiApiKeyEncrypted',    plainName: 'openaiApiKeyPlain' },
];

function decryptKey(raw, encName, plainName) {
  if (raw[encName]) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw[encName], 'base64'));
      }
    } catch (e) {
      console.warn(`[settings] failed to decrypt ${encName}:`, e.message);
    }
  }
  return raw[plainName] || '';
}

function encryptKey(plain) {
  if (!plain) return { encrypted: '', cleartext: '' };
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: safeStorage.encryptString(plain).toString('base64'),
      cleartext: '',
    };
  }
  console.warn('[settings] safeStorage not available — API key stored in plaintext.');
  return { encrypted: '', cleartext: plain };
}

function load() {
  const raw = readRaw();
  const cfg = { ...DEFAULTS, ...raw };
  // Rehydrate each cleartext API-key field from its on-disk encrypted pair.
  for (const k of ENCRYPTED_KEYS) {
    cfg[k.plain] = decryptKey(raw, k.encName, k.plainName);
    delete cfg[k.encName];
    delete cfg[k.plainName];
  }
  return cfg;
}

function save(partial) {
  const raw = readRaw();
  const stored = { ...raw };

  for (const k of Object.keys(partial || {})) {
    if (ENCRYPTED_KEYS.some((e) => e.plain === k)) continue; // handled below
    stored[k] = partial[k];
  }

  for (const k of ENCRYPTED_KEYS) {
    if (partial && k.plain in partial) {
      const { encrypted, cleartext } = encryptKey(partial[k.plain] || '');
      stored[k.encName] = encrypted;
      stored[k.plainName] = cleartext;
      delete stored[k.plain]; // never persist cleartext field with this name
    }
  }

  writeRaw(stored);
  return load();
}

module.exports = { load, save, configPath, DEFAULTS };
