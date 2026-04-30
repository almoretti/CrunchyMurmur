const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

function historyPath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function load() {
  try {
    const raw = fs.readFileSync(historyPath(), 'utf8');
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function add({ text, language, durationSec }) {
  const entries = load();
  entries.unshift({
    id: crypto.randomUUID(),
    text,
    language: language || null,
    durationSec: Number(durationSec) || 0,
    createdAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(entries, null, 2), 'utf8');
  return entries;
}

function remove(id) {
  const entries = load().filter((e) => e.id !== id);
  fs.writeFileSync(historyPath(), JSON.stringify(entries, null, 2), 'utf8');
  return entries;
}

function clear() {
  fs.writeFileSync(historyPath(), '[]', 'utf8');
  return [];
}

module.exports = { load, add, remove, clear, historyPath };
