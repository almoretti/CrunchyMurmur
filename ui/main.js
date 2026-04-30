// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
}
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
// Allow inline links to jump tabs (e.g. Settings → "Models" hint).
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('[data-jump-tab]')) {
    e.preventDefault();
    switchTab(t.getAttribute('data-jump-tab'));
  }
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

async function copyEntry(id, btn) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  await window.wisper.copyText(entry.text);
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
  }
}

async function deleteEntry(id) {
  entries = await window.wisper.removeHistory(id);
  render();
}

function render() {
  const q = filter.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.text.toLowerCase().includes(q)) : entries;

  countEl.textContent = visible.length + (visible.length === 1 ? ' entry' : ' entries');
  // Mac hides Clear All when the list is empty.
  clearAllBtn.style.display = entries.length === 0 ? 'none' : '';

  if (visible.length === 0) {
    historyEl.innerHTML = '';
    emptyEl.classList.add('show');
    return;
  }
  emptyEl.classList.remove('show');

  historyEl.innerHTML = visible.map((e) => `
    <div class="entry" data-id="${e.id}">
      <div class="meta">
        <span class="ts">${formatDate(e.createdAt)}</span>
        <span class="dot-sep">·</span>
        <span class="ts">${relativeTime(e.createdAt)}</span>
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
    const copyBtn = el.querySelector('[data-action="copy"]');
    const deleteBtn = el.querySelector('[data-action="delete"]');
    copyBtn.addEventListener('click', () => copyEntry(id, copyBtn));
    deleteBtn.addEventListener('click', () => deleteEntry(id));

    // Right-click context menu — Copy / Delete, mirroring Mac.
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Copy', action: () => copyEntry(id, copyBtn) },
        { label: 'Delete', danger: true, action: () => deleteEntry(id) },
      ]);
    });
  });
}

// Lightweight context menu (no Electron menu plumbing — pure DOM).
function showContextMenu(x, y, items) {
  const existing = document.getElementById('ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.danger) btn.className = 'danger';
    btn.addEventListener('click', () => {
      menu.remove();
      item.action();
    });
    menu.appendChild(btn);
  }
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  // Clamp to viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 6) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 6) + 'px';

  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escDismiss);
    }
  };
  const escDismiss = (ev) => {
    if (ev.key === 'Escape') {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escDismiss);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escDismiss);
  }, 0);
}

searchEl.addEventListener('input', (e) => { filter = e.target.value; render(); });
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear all recordings?')) return;
  entries = await window.wisper.clearHistory();
  render();
});

window.wisper.onHistoryChanged((next) => { entries = next; render(); });

// ----- Models tab -----
const modelsListEl = document.getElementById('modelsList');
const modelsDirPathEl = document.getElementById('modelsDirPath');
const openModelsFolderBtn = document.getElementById('openModelsFolder');

function formatBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB';
  return b + ' B';
}

let catalog = [];
const downloadingIds = new Set();

function renderModels() {
  modelsListEl.innerHTML = '';
  for (const m of catalog) {
    const card = document.createElement('div');
    card.className = 'model-card' + (m.installed ? ' installed' : '') + (downloadingIds.has(m.id) ? ' downloading' : '');
    card.dataset.id = m.id;

    const badges = [];
    if (m.recommended && !m.installed) badges.push('<span class="badge recommended">Recommended</span>');
    if (m.installed) badges.push('<span class="badge installed">Installed</span>');

    card.innerHTML = `
      <div class="name">${escapeHtml(m.name)} ${badges.join(' ')}</div>
      <div class="meta">
        <span>${formatBytes(m.size)}</span>
        <span>${escapeHtml(m.language)}</span>
        <span>Speed: ${escapeHtml(m.speed)}</span>
        <span>Accuracy: ${escapeHtml(m.accuracy)}</span>
      </div>
      <div class="actions"></div>
      <div class="progress">
        <div class="progress-track"><div class="progress-fill"></div></div>
        <span class="progress-label">Starting…</span>
      </div>
    `;

    const actions = card.querySelector('.actions');
    if (downloadingIds.has(m.id)) {
      const cancel = document.createElement('button');
      cancel.className = 'text-button danger';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => window.wisper.modelsCancel(m.id));
      actions.appendChild(cancel);
    } else if (m.installed) {
      const use = document.createElement('button');
      use.className = 'text-button';
      use.textContent = 'Use this';
      use.addEventListener('click', () => useModel(m.id, m.path));
      actions.appendChild(use);

      const del = document.createElement('button');
      del.className = 'text-button danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${m.name}? This frees ${formatBytes(m.size)} on disk.`)) return;
        await window.wisper.modelsRemove(m.id);
      });
      actions.appendChild(del);
    } else {
      const dl = document.createElement('button');
      dl.className = 'primary-button';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => downloadModel(m.id));
      actions.appendChild(dl);
    }

    modelsListEl.appendChild(card);
  }
}

async function refreshCatalog() {
  catalog = await window.wisper.modelsCatalog();
  renderModels();
}

async function downloadModel(id) {
  downloadingIds.add(id);
  renderModels();
  const result = await window.wisper.modelsDownload(id);
  downloadingIds.delete(id);
  if (!result.ok) {
    // Don't alert on user-initiated cancel.
    if (!/canceled/i.test(result.error || '')) {
      alert('Download failed: ' + result.error);
    }
  }
  await refreshCatalog();
  await populateInstalledPicker();
}

function useModel(id, modelPath) {
  // Jump to Engine, set engine = local, fill path.
  switchTab('engine');
  applyEngineKind('local');
  modelPathEl.value = modelPath;
  installedModelPickerEl.value = modelPath;
  // Persist immediately so the user doesn't have to remember to hit Save.
  window.wisper.saveSettings({ engineKind: 'local', modelPath });
  engineSaveStatusEl.textContent = `Using ${id}.`;
  setTimeout(() => { engineSaveStatusEl.textContent = ''; }, 2000);
}

window.wisper.onModelProgress(({ id, bytesDone, bytesTotal }) => {
  const card = modelsListEl.querySelector(`.model-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const fill = card.querySelector('.progress-fill');
  const label = card.querySelector('.progress-label');
  const pct = bytesTotal > 0 ? (bytesDone / bytesTotal) * 100 : 0;
  fill.style.width = pct.toFixed(1) + '%';
  label.textContent = `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)} · ${pct.toFixed(0)}%`;
});

window.wisper.onModelsChanged(async () => {
  await refreshCatalog();
  await populateInstalledPicker();
});

openModelsFolderBtn.addEventListener('click', () => window.wisper.modelsOpenDir());

// Settings
const whisperCliPathEl = document.getElementById('whisperCliPath');
const modelPathEl = document.getElementById('modelPath');
const installedModelPickerEl = document.getElementById('installedModelPicker');
const groqApiKeyEl = document.getElementById('groqApiKey');
const groqModelEl = document.getElementById('groqModel');
const languageEl = document.getElementById('language');
const micDeviceEl = document.getElementById('micDeviceId');
const testMicBtn = document.getElementById('testMic');
const micTestMeterEl = document.getElementById('micTestMeter');
const micHintEl = document.getElementById('micHint');
const saveEngineBtn = document.getElementById('saveEngine');
const saveGeneralBtn = document.getElementById('saveGeneral');
const engineSaveStatusEl = document.getElementById('engineSaveStatus');
const generalSaveStatusEl = document.getElementById('generalSaveStatus');
const engineLocalEl = document.getElementById('engineLocal');
const engineGroqEl = document.getElementById('engineGroq');

async function populateInstalledPicker() {
  const installed = await window.wisper.modelsInstalled();
  const current = modelPathEl.value;
  installedModelPickerEl.innerHTML = '<option value="">— Pick from your downloads —</option>';
  for (const m of installed) {
    const opt = document.createElement('option');
    opt.value = m.path;
    opt.textContent = `${m.name} (${formatBytes(m.bytes)})`;
    installedModelPickerEl.appendChild(opt);
  }
  // Reflect the current path in the dropdown if it points at one of the
  // downloaded models, otherwise leave the picker on the placeholder.
  if (current && installed.some((m) => m.path === current)) {
    installedModelPickerEl.value = current;
  } else {
    installedModelPickerEl.value = '';
  }
}

installedModelPickerEl?.addEventListener('change', () => {
  if (installedModelPickerEl.value) modelPathEl.value = installedModelPickerEl.value;
});

// Microphone picker
async function populateMicDevices(selectedId) {
  // Labels are only populated after mic permission has been granted at least
  // once. If we got back unlabeled devices, prompt for permission then re-list.
  let devices = await navigator.mediaDevices.enumerateDevices();
  let inputs = devices.filter((d) => d.kind === 'audioinput');
  const anyLabeled = inputs.some((d) => d.label);

  if (!anyLabeled && inputs.length) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
      inputs = devices.filter((d) => d.kind === 'audioinput');
    } catch {
      // Permission denied; we'll just show a generic list.
    }
  }

  // Rebuild options, preserving the always-present "Default" option at top.
  micDeviceEl.innerHTML = '<option value="">Default microphone (system)</option>';
  for (const d of inputs) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 6)}…)`;
    micDeviceEl.appendChild(opt);
  }

  // Restore selection if it's still in the list; otherwise reset to default
  // and warn the user that the saved device isn't available.
  if (selectedId && inputs.some((d) => d.deviceId === selectedId)) {
    micDeviceEl.value = selectedId;
  } else {
    micDeviceEl.value = '';
    if (selectedId) {
      micHintEl.textContent = 'Saved microphone is not available. Falling back to default.';
      micHintEl.style.color = 'var(--danger)';
    }
  }
}

// Refresh device list when devices are plugged/unplugged.
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    populateMicDevices(micDeviceEl.value);
  });
}

// Live mic-level test
const micTestBars = micTestMeterEl ? Array.from(micTestMeterEl.querySelectorAll('.bar')) : [];
let micTestStream = null;
let micTestCtx = null;
let micTestAnalyser = null;
let micTestRaf = null;
let micTestTimeout = null;

function stopMicTest() {
  if (micTestRaf) cancelAnimationFrame(micTestRaf);
  micTestRaf = null;
  if (micTestTimeout) clearTimeout(micTestTimeout);
  micTestTimeout = null;
  if (micTestAnalyser) { try { micTestAnalyser.disconnect(); } catch {} micTestAnalyser = null; }
  if (micTestCtx)      { try { micTestCtx.close(); }            catch {} micTestCtx = null; }
  if (micTestStream)   {
    micTestStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    micTestStream = null;
  }
  micTestMeterEl.classList.remove('active');
  micTestBars.forEach((b) => { b.style.height = '4px'; b.style.opacity = '0.4'; });
  testMicBtn.textContent = 'Test';
}

async function startMicTest() {
  testMicBtn.textContent = 'Stop';
  micTestMeterEl.classList.add('active');
  const id = micDeviceEl.value || '';
  const constraints = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (id) constraints.deviceId = { exact: id };

  try {
    micTestStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    micHintEl.textContent = 'Could not open the selected mic: ' + (e.message || e);
    micHintEl.style.color = 'var(--danger)';
    stopMicTest();
    return;
  }

  micTestCtx = new AudioContext();
  const src = micTestCtx.createMediaStreamSource(micTestStream);
  micTestAnalyser = micTestCtx.createAnalyser();
  micTestAnalyser.fftSize = 512;
  src.connect(micTestAnalyser);

  const buf = new Uint8Array(micTestAnalyser.frequencyBinCount);
  const tick = () => {
    micTestAnalyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    micTestBars.forEach((bar, i) => {
      const threshold = (i + 1) / micTestBars.length;
      const intensity = Math.max(0, Math.min(1, peak / threshold));
      bar.style.height = (4 + intensity * 14) + 'px';
      bar.style.opacity = String(0.4 + intensity * 0.6);
    });
    micTestRaf = requestAnimationFrame(tick);
  };
  micTestRaf = requestAnimationFrame(tick);

  // Auto-stop after 8 s so we never leave the mic open.
  micTestTimeout = setTimeout(stopMicTest, 8000);
}

testMicBtn.addEventListener('click', () => {
  if (micTestStream) stopMicTest();
  else startMicTest();
});

// Stop the mic test if the user navigates away from Settings.
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => { if (micTestStream) stopMicTest(); });
});

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

saveEngineBtn.addEventListener('click', async () => {
  const engineKind = document.querySelector('input[name="engineKind"]:checked')?.value || 'local';
  await window.wisper.saveSettings({
    engineKind,
    whisperCliPath: whisperCliPathEl.value.trim(),
    modelPath: modelPathEl.value.trim(),
    groqApiKey: groqApiKeyEl.value.trim(),
    groqModel: groqModelEl.value,
  });
  engineSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { engineSaveStatusEl.textContent = ''; }, 1500);
});

saveGeneralBtn.addEventListener('click', async () => {
  await window.wisper.saveSettings({
    language: languageEl.value,
    micDeviceId: micDeviceEl.value,
  });
  generalSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { generalSaveStatusEl.textContent = ''; }, 1500);
});

(async () => {
  const cfg = await window.wisper.getSettings();
  whisperCliPathEl.value = cfg.whisperCliPath || '';
  modelPathEl.value = cfg.modelPath || '';
  groqApiKeyEl.value = cfg.groqApiKey || '';
  groqModelEl.value = cfg.groqModel || 'whisper-large-v3-turbo';
  languageEl.value = cfg.language || 'auto';
  applyEngineKind(cfg.engineKind || 'local');
  await populateMicDevices(cfg.micDeviceId || '');

  entries = await window.wisper.getHistory();
  render();

  // Models tab data + the path label in the header.
  modelsDirPathEl.textContent = await window.wisper.modelsDir();
  await refreshCatalog();
  await populateInstalledPicker();

  const needsSetup = (cfg.engineKind === 'groq')
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup) {
    switchTab('engine');
  }
})();
