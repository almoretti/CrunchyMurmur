// Tab switching
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// History
const historyEl = document.getElementById('history');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const clearAllBtn = document.getElementById('clearAll');

let entries = [];
let filter = '';

function relativeTime(iso) {
  const ts = new Date(iso).getTime();
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  if (diffSec < 60)   return 'just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + ' min ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' h ago';
  return Math.floor(diffSec / 86400) + ' d ago';
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  const q = filter.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.text.toLowerCase().includes(q)) : entries;

  countEl.textContent = visible.length + (visible.length === 1 ? ' entry' : ' entries');

  if (visible.length === 0) {
    historyEl.innerHTML = '';
    emptyEl.classList.add('show');
    return;
  }
  emptyEl.classList.remove('show');

  historyEl.innerHTML = visible.map((e) => `
    <div class="entry" data-id="${e.id}">
      <div class="meta">
        <span>${formatDate(e.createdAt)}</span>
        <span>·</span>
        <span>${relativeTime(e.createdAt)}</span>
        ${e.language && e.language !== 'auto' ? `<span class="lang">${escapeHtml(e.language.toUpperCase())}</span>` : ''}
      </div>
      <div class="text">${escapeHtml(e.text)}</div>
      <div class="actions">
        <button class="text-button" data-action="copy">Copy</button>
        <button class="text-button danger" data-action="delete">Delete</button>
      </div>
    </div>
  `).join('');

  historyEl.querySelectorAll('.entry').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-action="copy"]').addEventListener('click', () => {
      const entry = entries.find((e) => e.id === id);
      if (entry) window.wisper.copyText(entry.text);
    });
    el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      entries = await window.wisper.removeHistory(id);
      render();
    });
  });
}

searchEl.addEventListener('input', (e) => { filter = e.target.value; render(); });
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear the entire history?')) return;
  entries = await window.wisper.clearHistory();
  render();
});

window.wisper.onHistoryChanged((next) => { entries = next; render(); });

// Settings
const whisperCliPathEl = document.getElementById('whisperCliPath');
const modelPathEl = document.getElementById('modelPath');
const groqApiKeyEl = document.getElementById('groqApiKey');
const groqModelEl = document.getElementById('groqModel');
const languageEl = document.getElementById('language');
const saveBtn = document.getElementById('save');
const saveStatus = document.getElementById('saveStatus');
const engineLocalEl = document.getElementById('engineLocal');
const engineGroqEl = document.getElementById('engineGroq');

function applyEngineKind(kind) {
  const k = kind === 'groq' ? 'groq' : 'local';
  engineLocalEl.classList.toggle('active', k === 'local');
  engineGroqEl.classList.toggle('active', k === 'groq');
  document.querySelectorAll('input[name="engineKind"]').forEach((r) => {
    r.checked = r.value === k;
  });
}

document.querySelectorAll('input[name="engineKind"]').forEach((r) => {
  r.addEventListener('change', (e) => applyEngineKind(e.target.value));
});

document.getElementById('pickCli').addEventListener('click', async () => {
  const p = await window.wisper.pickFile([{ name: 'Executables', extensions: ['exe'] }]);
  if (p) whisperCliPathEl.value = p;
});
document.getElementById('pickModel').addEventListener('click', async () => {
  const p = await window.wisper.pickFile([{ name: 'GGML model', extensions: ['bin'] }]);
  if (p) modelPathEl.value = p;
});

saveBtn.addEventListener('click', async () => {
  const engineKind = document.querySelector('input[name="engineKind"]:checked')?.value || 'local';
  await window.wisper.saveSettings({
    engineKind,
    whisperCliPath: whisperCliPathEl.value.trim(),
    modelPath: modelPathEl.value.trim(),
    groqApiKey: groqApiKeyEl.value.trim(),
    groqModel: groqModelEl.value,
    language: languageEl.value,
  });
  saveStatus.textContent = 'Saved.';
  setTimeout(() => { saveStatus.textContent = ''; }, 1500);
});

(async () => {
  const cfg = await window.wisper.getSettings();
  whisperCliPathEl.value = cfg.whisperCliPath || '';
  modelPathEl.value = cfg.modelPath || '';
  groqApiKeyEl.value = cfg.groqApiKey || '';
  groqModelEl.value = cfg.groqModel || 'whisper-large-v3-turbo';
  languageEl.value = cfg.language || 'auto';
  applyEngineKind(cfg.engineKind || 'local');

  entries = await window.wisper.getHistory();
  render();

  const needsSetup = (cfg.engineKind === 'groq')
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup) {
    document.querySelector('.nav-item[data-tab="settings"]').click();
  }
})();
