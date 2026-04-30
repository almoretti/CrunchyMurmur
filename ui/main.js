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
const micDeviceEl = document.getElementById('micDeviceId');
const testMicBtn = document.getElementById('testMic');
const micTestMeterEl = document.getElementById('micTestMeter');
const micHintEl = document.getElementById('micHint');
const saveBtn = document.getElementById('save');
const saveStatus = document.getElementById('saveStatus');
const engineLocalEl = document.getElementById('engineLocal');
const engineGroqEl = document.getElementById('engineGroq');

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

saveBtn.addEventListener('click', async () => {
  const engineKind = document.querySelector('input[name="engineKind"]:checked')?.value || 'local';
  await window.wisper.saveSettings({
    engineKind,
    whisperCliPath: whisperCliPathEl.value.trim(),
    modelPath: modelPathEl.value.trim(),
    groqApiKey: groqApiKeyEl.value.trim(),
    groqModel: groqModelEl.value,
    language: languageEl.value,
    micDeviceId: micDeviceEl.value,
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
  await populateMicDevices(cfg.micDeviceId || '');

  entries = await window.wisper.getHistory();
  render();

  const needsSetup = (cfg.engineKind === 'groq')
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup) {
    document.querySelector('.nav-item[data-tab="settings"]').click();
  }
})();
