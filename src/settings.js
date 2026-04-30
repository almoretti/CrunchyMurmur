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

function decryptKey(raw) {
  if (raw.groqApiKeyEncrypted) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw.groqApiKeyEncrypted, 'base64'));
      }
    } catch (e) {
      console.warn('[settings] failed to decrypt Groq key:', e.message);
    }
  }
  return raw.groqApiKeyPlain || '';
}

function encryptKey(plain) {
  if (!plain) return { groqApiKeyEncrypted: '', groqApiKeyPlain: '' };
  if (safeStorage.isEncryptionAvailable()) {
    return {
      groqApiKeyEncrypted: safeStorage.encryptString(plain).toString('base64'),
      groqApiKeyPlain: '',
    };
  }
  console.warn('[settings] safeStorage not available — Groq key stored in plaintext.');
  return { groqApiKeyEncrypted: '', groqApiKeyPlain: plain };
}

function load() {
  const raw = readRaw();
  const cfg = { ...DEFAULTS, ...raw, groqApiKey: decryptKey(raw) };
  // Strip the on-disk-only fields from the returned shape.
  delete cfg.groqApiKeyEncrypted;
  delete cfg.groqApiKeyPlain;
  return cfg;
}

function save(partial) {
  const raw = readRaw();
  const stored = { ...raw };

  for (const k of Object.keys(partial || {})) {
    if (k === 'groqApiKey') continue; // handled below
    stored[k] = partial[k];
  }

  if (partial && 'groqApiKey' in partial) {
    const { groqApiKeyEncrypted, groqApiKeyPlain } = encryptKey(partial.groqApiKey || '');
    stored.groqApiKeyEncrypted = groqApiKeyEncrypted;
    stored.groqApiKeyPlain = groqApiKeyPlain;
  }

  // Never persist the cleartext field.
  delete stored.groqApiKey;
  writeRaw(stored);
  return load();
}

module.exports = { load, save, configPath, DEFAULTS };
