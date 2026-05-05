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

    // Right-click context menu — Copy / Generate AI note / Delete.
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Copy', action: () => copyEntry(id, copyBtn) },
        { label: 'Generate AI note…', action: () => openAINotePopup(id, ev.clientX, ev.clientY) },
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

// ----- Notes tab -----
const foldersListEl = document.getElementById('foldersList');
const notesListEl = document.getElementById('notesList');
const notesEmptyEl = document.getElementById('notesEmpty');
const noteEditorEl = document.getElementById('noteEditor');
const notesSelectMessageEl = document.getElementById('notesSelectMessage');
const noteTitleEl = document.getElementById('noteTitle');
const noteBodyEl = document.getElementById('noteBody');
const noteSaveStatusEl = document.getElementById('noteSaveStatus');
const newFolderBtn = document.getElementById('newFolder');
const newNoteBtn = document.getElementById('newNote');
const notesSearchEl = document.getElementById('notesSearch');
const noteDeleteBtn = document.getElementById('noteDeleteBtn');
const noteMoveBtn = document.getElementById('noteMoveBtn');
const openNotesRootBtn = document.getElementById('openNotesRoot');

let notesSnapshot = { folders: [], notesByFolder: {}, counts: {} };
let selectedFolder = null;
let selectedNote = null; // { folder, filename, ... }
let notesFilter = '';
let saveTimer = null;
let saveDirty = false;

function snippetOf(content) {
  // Same as Mac NoteRow: skip headings, take first non-empty body line.
  for (const line of (content || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    return t.slice(0, 200);
  }
  return '';
}

function renderFolders() {
  foldersListEl.innerHTML = '';
  for (const name of notesSnapshot.folders) {
    const li = document.createElement('li');
    if (name === selectedFolder) li.classList.add('active');
    li.innerHTML = `
      <span class="glyph">▣</span>
      <span class="name"></span>
      <span class="count">${notesSnapshot.counts[name] || 0}</span>
    `;
    li.querySelector('.name').textContent = name;
    li.addEventListener('click', () => {
      selectedFolder = name;
      // Pick the most recent note in the folder for convenience.
      const list = notesSnapshot.notesByFolder[name] || [];
      const next = list[0] || null;
      openNote(next);
      renderNotesTab();
    });
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Open in Explorer', action: () => window.wisper.notesRevealFolder(name) },
        { label: 'Rename folder', action: () => promptRenameFolder(name) },
        { label: 'Delete folder', danger: true, action: () => promptDeleteFolder(name) },
      ]);
    });
    foldersListEl.appendChild(li);
  }
}

function renderNotes() {
  const list = (notesSnapshot.notesByFolder[selectedFolder] || []);
  const q = notesFilter.trim().toLowerCase();
  const visible = q
    ? list.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : list;

  notesListEl.innerHTML = '';
  for (const n of visible) {
    const li = document.createElement('li');
    if (selectedNote && n.filename === selectedNote.filename && n.folder === selectedNote.folder) {
      li.classList.add('active');
    }
    const meta = `<span>${formatDate(n.modifiedAt)}</span><span>·</span><span>${relativeTime(n.modifiedAt)}</span>`;
    li.innerHTML = `
      <div class="title"></div>
      <div class="meta">${meta}</div>
      <div class="snippet"></div>
    `;
    li.querySelector('.title').textContent = n.title;
    li.querySelector('.snippet').textContent = snippetOf(n.content);
    li.addEventListener('click', () => openNote(n));
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Move to folder…', action: () => promptMoveNote(n) },
        { label: 'Delete note', danger: true, action: () => deleteNote(n) },
      ]);
    });
    notesListEl.appendChild(li);
  }
  notesEmptyEl.classList.toggle('show', visible.length === 0);
}

function renderEditor() {
  if (!selectedNote) {
    noteEditorEl.classList.add('hidden');
    notesSelectMessageEl.classList.remove('hidden');
    return;
  }
  noteEditorEl.classList.remove('hidden');
  notesSelectMessageEl.classList.add('hidden');
  // Only update DOM if changed, so the user's caret position isn't reset
  // every time we re-render after typing.
  if (document.activeElement !== noteTitleEl) noteTitleEl.value = selectedNote.title;
  if (document.activeElement !== noteBodyEl)  noteBodyEl.value = selectedNote.content;
}

function renderNotesTab() {
  renderFolders();
  renderNotes();
  renderEditor();
}

async function reloadNotes(reselectFirst = false) {
  notesSnapshot = await window.wisper.notesSnapshot();
  if (!selectedFolder || !notesSnapshot.folders.includes(selectedFolder)) {
    selectedFolder = notesSnapshot.folders[0] || null;
  }
  if (reselectFirst) {
    const list = notesSnapshot.notesByFolder[selectedFolder] || [];
    openNote(list[0] || null);
  }
  renderNotesTab();
}

function openNote(note) {
  // Flush any pending autosave for the note we're leaving before swapping.
  flushPendingSave(true);
  selectedNote = note ? { ...note } : null;
  renderNotesTab();
}

function scheduleSave() {
  saveDirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPendingSave, 400);
  noteSaveStatusEl.textContent = 'Saving…';
}

async function flushPendingSave(immediate = false) {
  if (!saveDirty || !selectedNote) {
    if (immediate && saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return;
  }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveDirty = false;
  const folder = selectedNote.folder;
  const filename = selectedNote.filename;
  const content = noteBodyEl.value;
  const title = noteTitleEl.value.trim();
  const updated = await window.wisper.notesUpdate({ folder, filename, content });
  // If the title changed, rename the file (which changes the filename slug).
  if (title && updated && title !== updated.title) {
    const renamed = await window.wisper.notesRename({ folder, filename, newTitle: title });
    if (renamed) {
      selectedNote = { ...renamed };
      // Renamed via in-memory update; broadcastNotes() in main fires a
      // notes:changed which will refresh everything including the list.
    }
  } else if (updated) {
    selectedNote = { ...updated };
  }
  noteSaveStatusEl.textContent = 'Saved';
  setTimeout(() => { if (noteSaveStatusEl.textContent === 'Saved') noteSaveStatusEl.textContent = ''; }, 1200);
}

noteBodyEl.addEventListener('input', scheduleSave);
noteTitleEl.addEventListener('input', scheduleSave);
noteTitleEl.addEventListener('blur', () => flushPendingSave(true));

// New folder / new note / search / open in Explorer
async function promptNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  await window.wisper.notesCreateFolder(name);
  selectedFolder = name.trim();
  await reloadNotes();
}
newFolderBtn.addEventListener('click', promptNewFolder);

async function promptRenameFolder(oldName) {
  const newName = prompt('Rename folder to:', oldName);
  if (!newName || newName === oldName) return;
  await window.wisper.notesRenameFolder(oldName, newName);
  if (selectedFolder === oldName) selectedFolder = newName.trim();
  await reloadNotes();
}

async function promptDeleteFolder(name) {
  const noteCount = notesSnapshot.counts[name] || 0;
  const msg = noteCount > 0
    ? `Delete folder "${name}" and ${noteCount} note${noteCount === 1 ? '' : 's'} inside? This cannot be undone.`
    : `Delete folder "${name}"?`;
  if (!confirm(msg)) return;
  await window.wisper.notesDeleteFolder(name);
  if (selectedFolder === name) {
    selectedFolder = null;
    selectedNote = null;
  }
  await reloadNotes();
}

async function promptMoveNote(note) {
  const others = notesSnapshot.folders.filter((f) => f !== note.folder);
  if (others.length === 0) { alert('No other folders. Create one first.'); return; }
  const target = prompt(`Move "${note.title}" to which folder?\n\n${others.join(', ')}`, others[0]);
  if (!target) return;
  if (!notesSnapshot.folders.includes(target)) { alert('No folder named "' + target + '".'); return; }
  const moved = await window.wisper.notesMove({ folder: note.folder, filename: note.filename, toFolder: target });
  if (moved) {
    selectedFolder = target;
    selectedNote = { ...moved };
  }
  await reloadNotes();
}

async function deleteNote(note) {
  if (!confirm(`Delete "${note.title}"?`)) return;
  await window.wisper.notesDelete({ folder: note.folder, filename: note.filename });
  if (selectedNote && selectedNote.filename === note.filename && selectedNote.folder === note.folder) {
    selectedNote = null;
  }
  await reloadNotes();
}

newNoteBtn.addEventListener('click', async () => {
  if (!selectedFolder) {
    alert('Pick or create a folder first.');
    return;
  }
  const r = await window.wisper.notesCreate({ title: '', content: '', folder: selectedFolder });
  notesSnapshot = r.snapshot;
  if (r.note) selectedNote = { ...r.note };
  renderNotesTab();
  // Move focus to the title for immediate naming.
  setTimeout(() => { noteTitleEl.focus(); noteTitleEl.select(); }, 0);
});

notesSearchEl.addEventListener('input', (e) => { notesFilter = e.target.value; renderNotes(); });

noteDeleteBtn.addEventListener('click', () => { if (selectedNote) deleteNote(selectedNote); });
noteMoveBtn.addEventListener('click', () => { if (selectedNote) promptMoveNote(selectedNote); });
openNotesRootBtn.addEventListener('click', () => window.wisper.notesOpenRoot());

window.wisper.onNotesChanged((snap) => {
  notesSnapshot = snap;
  // If our selected note was deleted/renamed externally, drop the selection.
  if (selectedNote) {
    const list = notesSnapshot.notesByFolder[selectedNote.folder] || [];
    const found = list.find((n) => n.filename === selectedNote.filename);
    if (!found) selectedNote = null;
  }
  renderNotesTab();
});

// Markdown toolbar — wrap or prefix selected text in the textarea.
function applyMd(kind) {
  const ta = noteBodyEl;
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const sel = ta.value.slice(start, end);
  const after = ta.value.slice(end);

  const wrap = (left, right) => {
    ta.value = before + left + sel + right + after;
    ta.selectionStart = start + left.length;
    ta.selectionEnd = end + left.length;
  };
  const linePrefix = (prefix) => {
    // Apply to the start of every line in the selection (or the current line).
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = end + (after.indexOf('\n') === -1 ? after.length : after.indexOf('\n'));
    const head = ta.value.slice(0, lineStart);
    const tail = ta.value.slice(lineEnd);
    const lines = ta.value.slice(lineStart, lineEnd).split('\n').map((l) => prefix + l).join('\n');
    ta.value = head + lines + tail;
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + lines.length;
  };

  switch (kind) {
    case 'h1':       linePrefix('# '); break;
    case 'h2':       linePrefix('## '); break;
    case 'h3':       linePrefix('### '); break;
    case 'bold':     wrap('**', '**'); break;
    case 'italic':   wrap('*', '*'); break;
    case 'strike':   wrap('~~', '~~'); break;
    case 'code':     wrap('`', '`'); break;
    case 'bullet':   linePrefix('- '); break;
    case 'numbered': linePrefix('1. '); break;
    case 'todo':     linePrefix('- [ ] '); break;
    case 'quote':    linePrefix('> '); break;
    case 'link': {
      const url = prompt('URL:', sel.startsWith('http') ? sel : 'https://');
      if (!url) return;
      const display = sel || 'link';
      ta.value = before + `[${display}](${url})` + after;
      ta.selectionStart = before.length + 1;
      ta.selectionEnd = before.length + 1 + display.length;
      break;
    }
    case 'hr':       ta.value = before + '\n---\n' + after; break;
  }
  ta.focus();
  scheduleSave();
}
document.querySelectorAll('.md-btn').forEach((btn) => {
  btn.addEventListener('click', () => applyMd(btn.dataset.md));
});

// Editor keyboard shortcuts within the textarea.
noteBodyEl.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { e.preventDefault(); applyMd('bold'); }
  else if (k === 'i') { e.preventDefault(); applyMd('italic'); }
  else if (k === 'e') { e.preventDefault(); applyMd('code'); }
  else if (k === 'k') { e.preventDefault(); applyMd('link'); }
  else if (k === '1' && e.shiftKey === false) { e.preventDefault(); applyMd('h1'); }
  else if (k === '2' && e.shiftKey === false) { e.preventDefault(); applyMd('h2'); }
  else if (k === '3' && e.shiftKey === false) { e.preventDefault(); applyMd('h3'); }
});

// Ensure pending saves flush when the tab is changed away.
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => { if (saveDirty) flushPendingSave(true); });
});

// ----- Templates tab -----
const templatesListEl = document.getElementById('templatesList');
const templateEditorEl = document.getElementById('templateEditor');
const templatesSelectMessageEl = document.getElementById('templatesSelectMessage');
const templateNameEl = document.getElementById('templateName');
const templateDescriptionEl = document.getElementById('templateDescription');
const templateInstructionsEl = document.getElementById('templateInstructions');
const templateSaveBtn = document.getElementById('templateSaveBtn');
const templateRevertBtn = document.getElementById('templateRevertBtn');
const templateSaveStatusEl = document.getElementById('templateSaveStatus');

let templatesCatalog = [];
let selectedTemplateId = null;
let templateOriginal = null; // last-saved snapshot, used to detect dirty edits

function selectedTemplate() {
  return templatesCatalog.find((t) => t.id === selectedTemplateId) || null;
}

function renderTemplatesList() {
  templatesListEl.innerHTML = '';
  for (const t of templatesCatalog) {
    const li = document.createElement('li');
    if (t.id === selectedTemplateId) li.classList.add('active');
    const customizedDot = t.customized ? '<span class="customized" title="Customized"></span>' : '';
    li.innerHTML = `
      <div class="name">${customizedDot}<span class="label-text"></span></div>
      <div class="desc"></div>
    `;
    li.querySelector('.label-text').textContent = t.name;
    li.querySelector('.desc').textContent = t.description;
    li.addEventListener('click', () => openTemplate(t.id));
    templatesListEl.appendChild(li);
  }
}

function renderTemplateEditor() {
  const t = selectedTemplate();
  if (!t) {
    templateEditorEl.classList.add('hidden');
    templatesSelectMessageEl.classList.remove('hidden');
    return;
  }
  templateEditorEl.classList.remove('hidden');
  templatesSelectMessageEl.classList.add('hidden');
  if (document.activeElement !== templateNameEl)         templateNameEl.value = t.name;
  if (document.activeElement !== templateDescriptionEl)  templateDescriptionEl.value = t.description;
  if (document.activeElement !== templateInstructionsEl) templateInstructionsEl.value = t.instructions;
  templateRevertBtn.hidden = !t.customized;
}

function isTemplateDirty() {
  if (!templateOriginal) return false;
  return (
    templateNameEl.value !== templateOriginal.name ||
    templateDescriptionEl.value !== templateOriginal.description ||
    templateInstructionsEl.value !== templateOriginal.instructions
  );
}

async function openTemplate(id) {
  // Guard against losing edits if the user clicks another template mid-edit.
  if (templateOriginal && isTemplateDirty()) {
    if (!confirm('You have unsaved changes to this template. Discard them?')) return;
  }
  selectedTemplateId = id;
  const t = selectedTemplate();
  templateOriginal = t ? { name: t.name, description: t.description, instructions: t.instructions } : null;
  renderTemplatesList();
  renderTemplateEditor();
}

async function reloadTemplates() {
  templatesCatalog = await window.wisper.templatesList();
  if (!selectedTemplateId && templatesCatalog.length) {
    selectedTemplateId = templatesCatalog[0].id;
    const t = selectedTemplate();
    templateOriginal = t ? { name: t.name, description: t.description, instructions: t.instructions } : null;
  }
  renderTemplatesList();
  renderTemplateEditor();
}

templateSaveBtn.addEventListener('click', async () => {
  const t = selectedTemplate();
  if (!t) return;
  const updated = await window.wisper.templatesSave({
    id: t.id,
    name: templateNameEl.value.trim() || t.name,
    description: templateDescriptionEl.value.trim(),
    instructions: templateInstructionsEl.value,
  });
  // Refresh the in-memory catalog so the customized-dot updates.
  templatesCatalog = templatesCatalog.map((x) => (x.id === updated.id ? updated : x));
  templateOriginal = { name: updated.name, description: updated.description, instructions: updated.instructions };
  renderTemplatesList();
  renderTemplateEditor();
  templateSaveStatusEl.textContent = 'Saved';
  templateSaveStatusEl.style.color = '#30d158';
  setTimeout(() => { templateSaveStatusEl.textContent = ''; templateSaveStatusEl.style.color = ''; }, 1500);
});

// ----- Meetings tab — Calendar feed + meetings list -----
const calendarListEl = document.getElementById('calendarList');
const calendarEmptyEl = document.getElementById('calendarEmpty');
const meetingsListEl = document.getElementById('meetingsList');
const meetingsEmptyEl = document.getElementById('meetingsEmpty');
const manageFeedsBtn = document.getElementById('manageFeedsBtn');
const refreshCalendarBtn = document.getElementById('refreshCalendarBtn');
const feedsDialogEl = document.getElementById('feedsDialog');
const feedsDialogCloseBtn = document.getElementById('feedsDialogClose');
const feedsListEl = document.getElementById('feedsList');
const feedNewUrlEl = document.getElementById('feedNewUrl');
const feedNewLabelEl = document.getElementById('feedNewLabel');
const feedAddBtn = document.getElementById('feedAddBtn');

let calendarSnapshot = { feeds: [], events: [] };

function eventTimingClass(ev) {
  const now = Date.now();
  const start = new Date(ev.start).getTime();
  const end = new Date(ev.end).getTime();
  if (now >= start && now < end) return 'happening';
  if (start - now <= 15 * 60 * 1000 && start > now) return 'soon';
  return '';
}

function fmtEventTime(ev) {
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const sameDay = s.toDateString() === e.toDateString();
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (ev.isAllDay) return 'All day';
  if (sameDay) return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
  return s.toLocaleString(undefined, { month: 'short', day: 'numeric', ...opts });
}

function renderCalendar() {
  calendarListEl.innerHTML = '';
  const upcoming = calendarSnapshot.events.filter((e) => new Date(e.end).getTime() > Date.now()).slice(0, 6);
  for (const ev of upcoming) {
    const li = document.createElement('li');
    const cls = eventTimingClass(ev);
    if (cls) li.classList.add(cls);
    if (ev.color) li.style.borderLeftColor = ev.color;
    li.innerHTML = `
      <div class="when"></div>
      <div class="title"></div>
      ${ev.location ? '<div class="where"></div>' : ''}
    `;
    li.querySelector('.when').textContent = fmtEventTime(ev);
    li.querySelector('.title').textContent = ev.title;
    if (ev.location) li.querySelector('.where').textContent = ev.location;
    calendarListEl.appendChild(li);
  }
  calendarEmptyEl.style.display = (calendarSnapshot.feeds.length === 0) ? 'block' : 'none';
}

function renderFeedsDialog() {
  feedsListEl.innerHTML = '';
  for (const f of calendarSnapshot.feeds) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="swatch" style="background:${f.color || '#0a84ff'}"></div>
      <div class="info">
        <div class="label"></div>
        <div class="url"></div>
        ${f.lastError ? '<div class="err"></div>' : ''}
      </div>
      <button class="text-button danger" data-action="remove">Remove</button>
    `;
    li.querySelector('.label').textContent = f.label || '(unlabeled)';
    li.querySelector('.url').textContent = f.url;
    if (f.lastError) li.querySelector('.err').textContent = f.lastError;
    li.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      if (!confirm(`Remove feed "${f.label || f.url}"?`)) return;
      await window.wisper.calendarRemoveFeed(f.id);
    });
    feedsListEl.appendChild(li);
  }
}

manageFeedsBtn.addEventListener('click', () => {
  feedsDialogEl.classList.remove('hidden');
  renderFeedsDialog();
});
feedsDialogCloseBtn.addEventListener('click', () => feedsDialogEl.classList.add('hidden'));
feedsDialogEl.addEventListener('click', (e) => {
  if (e.target === feedsDialogEl) feedsDialogEl.classList.add('hidden');
});

feedAddBtn.addEventListener('click', async () => {
  const url = feedNewUrlEl.value.trim();
  if (!url) { alert('Paste an ICS URL first.'); return; }
  await window.wisper.calendarAddFeed({ url, label: feedNewLabelEl.value.trim() });
  feedNewUrlEl.value = '';
  feedNewLabelEl.value = '';
});

refreshCalendarBtn.addEventListener('click', async () => {
  refreshCalendarBtn.textContent = '…';
  await window.wisper.calendarRefresh();
  refreshCalendarBtn.textContent = '↻';
});

window.wisper.onCalendarChanged((snap) => {
  calendarSnapshot = snap;
  renderCalendar();
  if (!feedsDialogEl.classList.contains('hidden')) renderFeedsDialog();
});

// Re-fetch when the user switches to Meetings (cheap; throttled by node-ical
// network anyway).
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.tab === 'meetings' && calendarSnapshot.feeds.length > 0) {
      window.wisper.calendarRefresh();
    }
  });
});

// ----- Meetings recording + detail pane -----
const startMeetingBtn = document.getElementById('startMeetingBtn');
const meetingDetailEl = document.getElementById('meetingDetail');
const meetingsSelectMessageEl = document.getElementById('meetingsSelectMessage');
const meetingTitleEl = document.getElementById('meetingTitle');
const meetingRecordingStatusEl = document.getElementById('meetingRecordingStatus');
const stopMeetingBtn = document.getElementById('stopMeetingBtn');
const transcribeMeetingBtn = document.getElementById('transcribeMeetingBtn');
const aiNotesMeetingBtn = document.getElementById('aiNotesMeetingBtn');
const deleteMeetingBtn = document.getElementById('deleteMeetingBtn');
const meetingUserNotesEl = document.getElementById('meetingUserNotes');
const meetingTranscriptEl = document.getElementById('meetingTranscript');
const meetingTranscriptEmptyEl = document.getElementById('meetingTranscriptEmpty');
const meetingAiNotesEl = document.getElementById('meetingAiNotes');
const meetingAiNotesEmptyEl = document.getElementById('meetingAiNotesEmpty');

let meetingsList = [];
let selectedMeeting = null;
let activeMeetingId = null; // currently-recording meeting (if any)
let mtgMediaStream = null;
let mtgAudioCtx = null;
let mtgProcessor = null;
let mtgChunks = [];
let mtgNativeRate = 48_000;
let mtgStartedAt = 0;
let mtgTimerHandle = null;
let mtgTitleSaveTimer = null;
let mtgNotesSaveTimer = null;

function fmtDuration(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderMeetingsList() {
  meetingsListEl.innerHTML = '';
  for (const m of meetingsList) {
    const li = document.createElement('li');
    if (m.id === selectedMeeting?.id) li.classList.add('active');
    if (m.id === activeMeetingId) li.classList.add('recording');
    const date = new Date(m.createdAt);
    const subtitle = m.id === activeMeetingId
      ? '● Recording…'
      : `${date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` +
        (m.durationSec ? ' · ' + fmtDuration(m.durationSec) : '');
    li.innerHTML = `<div class="title"></div><div class="meta"></div>`;
    li.querySelector('.title').textContent = m.title;
    li.querySelector('.meta').textContent = subtitle;
    li.addEventListener('click', () => openMeeting(m));
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Reveal in Explorer', action: () => window.wisper.meetingsReveal(m.id) },
        { label: 'Delete meeting', danger: true, action: () => deleteMeeting(m) },
      ]);
    });
    meetingsListEl.appendChild(li);
  }
  meetingsEmptyEl.style.display = meetingsList.length === 0 ? 'block' : 'none';
}

function renderMeetingDetail() {
  if (!selectedMeeting) {
    meetingDetailEl.classList.add('hidden');
    meetingsSelectMessageEl.classList.remove('hidden');
    return;
  }
  meetingDetailEl.classList.remove('hidden');
  meetingsSelectMessageEl.classList.add('hidden');

  if (document.activeElement !== meetingTitleEl)
    meetingTitleEl.value = selectedMeeting.title;
  if (document.activeElement !== meetingUserNotesEl)
    meetingUserNotesEl.value = selectedMeeting.userNotes || '';

  const isRecording = activeMeetingId === selectedMeeting.id;
  stopMeetingBtn.hidden = !isRecording;
  transcribeMeetingBtn.hidden = isRecording || !selectedMeeting.hasMicAudio || Boolean(selectedMeeting.transcript);
  aiNotesMeetingBtn.hidden = isRecording || !selectedMeeting.transcript;
  deleteMeetingBtn.hidden = isRecording;

  if (isRecording) {
    meetingRecordingStatusEl.textContent = `Recording · ${fmtDuration((Date.now() - mtgStartedAt) / 1000)}`;
    meetingRecordingStatusEl.style.color = 'var(--danger)';
  } else if (selectedMeeting.durationSec) {
    meetingRecordingStatusEl.textContent = `Length · ${fmtDuration(selectedMeeting.durationSec)}`;
    meetingRecordingStatusEl.style.color = '';
  } else {
    meetingRecordingStatusEl.textContent = '';
  }

  if (selectedMeeting.transcript) {
    meetingTranscriptEl.classList.remove('hidden');
    meetingTranscriptEl.textContent = selectedMeeting.transcript;
    meetingTranscriptEmptyEl.style.display = 'none';
  } else {
    meetingTranscriptEl.classList.add('hidden');
    meetingTranscriptEmptyEl.style.display = '';
  }
  if (selectedMeeting.aiNotes) {
    meetingAiNotesEl.classList.remove('hidden');
    meetingAiNotesEl.textContent = selectedMeeting.aiNotes;
    meetingAiNotesEmptyEl.style.display = 'none';
  } else {
    meetingAiNotesEl.classList.add('hidden');
    meetingAiNotesEmptyEl.style.display = '';
  }
}

function renderMeetingsAll() {
  renderMeetingsList();
  renderMeetingDetail();
}

function openMeeting(m) {
  selectedMeeting = m ? { ...m } : null;
  renderMeetingsAll();
}

async function deleteMeeting(m) {
  if (!confirm(`Delete "${m.title}"? Audio + transcript + notes will be removed.`)) return;
  await window.wisper.meetingsDelete(m.id);
  if (selectedMeeting?.id === m.id) selectedMeeting = null;
}

async function startMeeting() {
  // Get the chosen mic up front so we fail fast if it's misconfigured.
  const cfg = window.__lastSettings || {};
  const constraints = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (cfg.micDeviceId) constraints.deviceId = { exact: cfg.micDeviceId };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    alert('Could not open the microphone. ' + (e.message || e));
    return;
  }

  // Create the meeting record only after getUserMedia succeeds, so we don't
  // leave empty stubs behind on permission failures.
  const m = await window.wisper.meetingsCreate({});
  activeMeetingId = m.id;
  selectedMeeting = m;

  mtgMediaStream = stream;
  mtgAudioCtx = new AudioContext();
  mtgNativeRate = mtgAudioCtx.sampleRate;
  const source = mtgAudioCtx.createMediaStreamSource(mtgMediaStream);
  mtgProcessor = mtgAudioCtx.createScriptProcessor(4096, 1, 1);
  mtgProcessor.onaudioprocess = (ev) => {
    const ch = ev.inputBuffer.getChannelData(0);
    mtgChunks.push(new Float32Array(ch));
  };
  source.connect(mtgProcessor);
  mtgProcessor.connect(mtgAudioCtx.destination);

  mtgStartedAt = Date.now();
  mtgChunks = [];
  // Tick once a second so the running timer in the header updates without us
  // having to drive the whole render() loop on rAF.
  if (mtgTimerHandle) clearInterval(mtgTimerHandle);
  mtgTimerHandle = setInterval(() => {
    if (selectedMeeting && selectedMeeting.id === activeMeetingId) {
      meetingRecordingStatusEl.textContent = `Recording · ${fmtDuration((Date.now() - mtgStartedAt) / 1000)}`;
    }
  }, 1000);

  // Tell main to show the floating pill in meeting state.
  window.wisper.meetingsPillStart({ id: m.id, startedAt: mtgStartedAt });

  renderMeetingsAll();
}

async function stopMeeting() {
  if (!activeMeetingId) return;
  const meetingId = activeMeetingId;
  if (mtgTimerHandle) { clearInterval(mtgTimerHandle); mtgTimerHandle = null; }
  // Tear down the audio graph.
  if (mtgProcessor) { try { mtgProcessor.disconnect(); } catch {} mtgProcessor = null; }
  if (mtgAudioCtx)  { try { mtgAudioCtx.close(); }     catch {} mtgAudioCtx = null; }
  if (mtgMediaStream) {
    mtgMediaStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    mtgMediaStream = null;
  }

  // Concat and downsample to 16 kHz mono — same pipeline as the dictation
  // floating window. Whisper gets exactly what it expects.
  const total = mtgChunks.reduce((n, c) => n + c.length, 0);
  const flat = new Float32Array(total);
  let o = 0;
  for (const c of mtgChunks) { flat.set(c, o); o += c.length; }
  mtgChunks = [];

  const ratio = mtgNativeRate / 16_000;
  const targetLen = Math.floor(flat.length / ratio);
  const out = new Float32Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, flat.length - 1);
    const frac = srcIdx - lo;
    out[i] = flat[lo] * (1 - frac) + flat[hi] * frac;
  }

  meetingRecordingStatusEl.textContent = 'Saving audio…';
  meetingRecordingStatusEl.style.color = '';
  await window.wisper.meetingsSaveAudio(meetingId, Array.from(out));
  activeMeetingId = null;

  // Hide the floating pill — meeting is over.
  window.wisper.meetingsPillStop();

  // The store broadcast already refreshes the list; we just need to keep the
  // selection.
  selectedMeeting = await window.wisper.meetingsGet(meetingId);
  renderMeetingsAll();
}

// Stop request from the floating pill — user clicked the pill while a meeting
// was recording. Forward to the same stopMeeting() the in-app Stop button
// uses so the audio save + UI update path is identical.
window.wisper.onPillRequestStopMeeting(() => {
  if (activeMeetingId) stopMeeting();
});

async function transcribeMeeting() {
  if (!selectedMeeting) return;
  meetingRecordingStatusEl.textContent = 'Transcribing…';
  transcribeMeetingBtn.disabled = true;
  const r = await window.wisper.meetingsTranscribe(selectedMeeting.id);
  transcribeMeetingBtn.disabled = false;
  if (!r.ok) {
    meetingRecordingStatusEl.textContent = '';
    alert('Transcription failed: ' + r.error);
    return;
  }
  selectedMeeting = r.meeting;
  meetingRecordingStatusEl.textContent = '';
  renderMeetingsAll();
}

async function generateMeetingAINotes() {
  if (!selectedMeeting) return;
  // Pick template via a small popup, same as Recordings.
  const popup = document.createElement('div');
  popup.id = 'ai-note-popup';
  popup.className = 'ai-note-popup';
  popup.style.left = '50%';
  popup.style.top = '120px';
  popup.style.transform = 'translateX(-50%)';
  popup.innerHTML = `
    <div class="ai-pop-header">AI notes for this meeting</div>
    <label class="ai-pop-label">Template</label>
    <select id="aiPopMeetingTemplate"></select>
    <div class="ai-pop-actions">
      <button class="text-button" id="aiPopMeetingCancel">Cancel</button>
      <button class="primary-button" id="aiPopMeetingGenerate">Generate</button>
    </div>
    <div class="ai-pop-status" id="aiPopMeetingStatus"></div>
  `;
  document.body.appendChild(popup);
  const sel = popup.querySelector('#aiPopMeetingTemplate');
  for (const t of templatesCatalog) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    if (selectedMeeting.aiTemplateId === t.id) opt.selected = true;
    sel.appendChild(opt);
  }
  const close = () => popup.remove();
  popup.querySelector('#aiPopMeetingCancel').addEventListener('click', close);
  popup.querySelector('#aiPopMeetingGenerate').addEventListener('click', async () => {
    const status = popup.querySelector('#aiPopMeetingStatus');
    const btn = popup.querySelector('#aiPopMeetingGenerate');
    status.textContent = 'Generating…';
    btn.disabled = true;
    const r = await window.wisper.meetingsGenerateAINotes(selectedMeeting.id, sel.value);
    if (!r.ok) {
      status.textContent = '';
      alert('Generation failed: ' + r.error);
      btn.disabled = false;
      return;
    }
    selectedMeeting = r.meeting;
    renderMeetingsAll();
    close();
  });
}

startMeetingBtn.addEventListener('click', startMeeting);
stopMeetingBtn.addEventListener('click', stopMeeting);
transcribeMeetingBtn.addEventListener('click', transcribeMeeting);
aiNotesMeetingBtn.addEventListener('click', generateMeetingAINotes);
deleteMeetingBtn.addEventListener('click', () => { if (selectedMeeting) deleteMeeting(selectedMeeting); });

meetingTitleEl.addEventListener('input', () => {
  if (mtgTitleSaveTimer) clearTimeout(mtgTitleSaveTimer);
  mtgTitleSaveTimer = setTimeout(async () => {
    if (!selectedMeeting) return;
    const updated = await window.wisper.meetingsUpdate(selectedMeeting.id, { title: meetingTitleEl.value.trim() });
    selectedMeeting = updated;
  }, 400);
});
meetingUserNotesEl.addEventListener('input', () => {
  if (mtgNotesSaveTimer) clearTimeout(mtgNotesSaveTimer);
  mtgNotesSaveTimer = setTimeout(async () => {
    if (!selectedMeeting) return;
    const updated = await window.wisper.meetingsUpdate(selectedMeeting.id, { userNotes: meetingUserNotesEl.value });
    selectedMeeting = updated;
  }, 400);
});

window.wisper.onMeetingsChanged((list) => {
  meetingsList = list;
  if (selectedMeeting) {
    selectedMeeting = list.find((m) => m.id === selectedMeeting.id) || null;
  }
  renderMeetingsAll();
});

// ----- AI Notes generation popover (used from the Recordings tab) -----

function openAINotePopup(recordingId, x, y) {
  // Bail early if we have no provider configured. Otherwise the user clicks
  // Generate and gets a generic "missing key" error — friendlier to nudge
  // them to Settings up front.
  const cfg = window.__lastSettings || {};
  const provider = cfg.aiNotesProvider || 'anthropic';
  // Anthropic / OpenAI need an API key. Claude Code / Codex just need the
  // CLI on disk (validated at generate time — we don't pre-check here, the
  // error path on missing CLI is friendly enough).
  const needsKey = provider === 'anthropic' || provider === 'openai';
  const keyOk = !needsKey ||
    (provider === 'anthropic' && cfg.anthropicApiKey) ||
    (provider === 'openai' && cfg.openaiApiKey);
  if (!keyOk) {
    if (confirm('No API key on file for the AI Notes provider. Open the Engine tab to add one?')) {
      switchTab('engine');
    }
    return;
  }

  // Lightweight popover near the click point.
  const existing = document.getElementById('ai-note-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'ai-note-popup';
  popup.className = 'ai-note-popup';
  popup.innerHTML = `
    <div class="ai-pop-header">Generate AI note</div>
    <label class="ai-pop-label">Template</label>
    <select id="aiPopTemplate"></select>
    <p class="ai-pop-hint" id="aiPopProviderHint"></p>
    <div class="ai-pop-actions">
      <button class="text-button" id="aiPopCancel">Cancel</button>
      <button class="primary-button" id="aiPopGenerate">Generate</button>
    </div>
    <div class="ai-pop-status" id="aiPopStatus"></div>
  `;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  document.body.appendChild(popup);

  const rect = popup.getBoundingClientRect();
  if (rect.right > window.innerWidth) popup.style.left = (window.innerWidth - rect.width - 12) + 'px';
  if (rect.bottom > window.innerHeight) popup.style.top = (window.innerHeight - rect.height - 12) + 'px';

  const sel = popup.querySelector('#aiPopTemplate');
  for (const t of templatesCatalog) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  const providerLabel = {
    anthropic: `Anthropic · ${cfg.anthropicModel || 'default'}`,
    openai: `OpenAI · ${cfg.openaiModel || 'default'}`,
    claudeCode: 'Claude Code (your subscription)',
    codex: 'Codex (your subscription)',
  }[provider] || provider;
  popup.querySelector('#aiPopProviderHint').textContent = `Using ${providerLabel}.`;

  const close = () => { popup.remove(); document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escDismiss); };
  const dismiss = (ev) => { if (!popup.contains(ev.target)) close(); };
  const escDismiss = (ev) => { if (ev.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escDismiss);
  }, 0);

  popup.querySelector('#aiPopCancel').addEventListener('click', close);
  popup.querySelector('#aiPopGenerate').addEventListener('click', async () => {
    const templateId = sel.value;
    const statusEl = popup.querySelector('#aiPopStatus');
    statusEl.textContent = 'Generating…';
    popup.querySelector('#aiPopGenerate').disabled = true;
    popup.querySelector('#aiPopCancel').disabled = true;

    const r = await window.wisper.aiNotesGenerateFromRecording({ recordingId, templateId });
    if (!r.ok) {
      statusEl.textContent = '';
      alert('Generation failed: ' + r.error);
      popup.querySelector('#aiPopGenerate').disabled = false;
      popup.querySelector('#aiPopCancel').disabled = false;
      return;
    }
    statusEl.textContent = 'Saved to Notes / Inbox.';
    setTimeout(() => {
      close();
      switchTab('notes');
      // Open the newly created note.
      if (r.note) {
        selectedFolder = r.note.folder;
        selectedNote = { ...r.note };
        renderNotesTab();
      }
    }, 600);
  });
}

templateRevertBtn.addEventListener('click', async () => {
  const t = selectedTemplate();
  if (!t) return;
  if (!confirm(`Revert "${t.name}" to the bundled default? Your edits will be lost.`)) return;
  const reverted = await window.wisper.templatesRevert(t.id);
  templatesCatalog = templatesCatalog.map((x) => (x.id === reverted.id ? reverted : x));
  templateOriginal = { name: reverted.name, description: reverted.description, instructions: reverted.instructions };
  renderTemplatesList();
  renderTemplateEditor();
  templateSaveStatusEl.textContent = 'Reverted';
  templateSaveStatusEl.style.color = 'var(--text-muted)';
  setTimeout(() => { templateSaveStatusEl.textContent = ''; templateSaveStatusEl.style.color = ''; }, 1500);
});

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
  const cfg = await window.wisper.saveSettings({
    engineKind,
    whisperCliPath: whisperCliPathEl.value.trim(),
    modelPath: modelPathEl.value.trim(),
    groqApiKey: groqApiKeyEl.value.trim(),
    groqModel: groqModelEl.value,
  });
  window.__lastSettings = cfg;
  engineSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { engineSaveStatusEl.textContent = ''; }, 1500);
});

// AI Notes provider config
const aiAnthropicEl = document.getElementById('aiAnthropic');
const aiOpenaiEl = document.getElementById('aiOpenai');
const anthropicApiKeyEl = document.getElementById('anthropicApiKey');
const anthropicModelEl = document.getElementById('anthropicModel');
const openaiApiKeyEl = document.getElementById('openaiApiKey');
const openaiModelEl = document.getElementById('openaiModel');
const saveAiNotesBtn = document.getElementById('saveAiNotes');
const aiNotesSaveStatusEl = document.getElementById('aiNotesSaveStatus');

function applyAiNotesProvider(kind) {
  const valid = ['anthropic', 'openai', 'claudeCode', 'codex'];
  const k = valid.includes(kind) ? kind : 'anthropic';
  aiAnthropicEl.classList.toggle('active', k === 'anthropic');
  aiOpenaiEl.classList.toggle('active', k === 'openai');
  document.getElementById('aiClaudeCode').classList.toggle('active', k === 'claudeCode');
  document.getElementById('aiCodex').classList.toggle('active', k === 'codex');
  document.querySelectorAll('input[name="aiNotesProvider"]').forEach((r) => {
    r.checked = r.value === k;
  });
}
document.querySelectorAll('input[name="aiNotesProvider"]').forEach((r) => {
  r.addEventListener('change', (e) => applyAiNotesProvider(e.target.value));
});

async function populateAiNotesModels() {
  const providers = await window.wisper.aiNotesProviders();
  const fill = (selectEl, providerId) => {
    const p = providers.find((x) => x.id === providerId);
    if (!p || !p.models) return;
    selectEl.innerHTML = '';
    for (const m of p.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      selectEl.appendChild(opt);
    }
  };
  fill(anthropicModelEl, 'anthropic');
  fill(openaiModelEl, 'openai');

  // CLI provider availability hints
  const cc = providers.find((p) => p.id === 'claudeCode');
  const cx = providers.find((p) => p.id === 'codex');
  const ccStatus = document.getElementById('claudeCodeStatus');
  const cxStatus = document.getElementById('codexStatus');
  const ccDetail = document.getElementById('claudeCodeDetail');
  const cxDetail = document.getElementById('codexDetail');
  if (cc) {
    ccStatus.textContent = cc.available ? '· installed' : '· not found';
    ccStatus.style.color = cc.available ? '#30d158' : 'var(--danger)';
    ccDetail.textContent = cc.available
      ? `Found at ${cc.executable}. Uses your Claude Code subscription — no API key charged.`
      : 'No claude CLI found on PATH. Install Claude Code (npm install -g @anthropic-ai/claude-code) and re-launch WisperHelp.';
  }
  if (cx) {
    cxStatus.textContent = cx.available ? '· installed' : '· not found';
    cxStatus.style.color = cx.available ? '#30d158' : 'var(--danger)';
    cxDetail.textContent = cx.available
      ? `Found at ${cx.executable}. Uses your Codex subscription — no API key charged.`
      : 'No codex CLI found on PATH. Install OpenAI Codex and re-launch WisperHelp.';
  }
}

saveAiNotesBtn.addEventListener('click', async () => {
  const provider = document.querySelector('input[name="aiNotesProvider"]:checked')?.value || 'anthropic';
  const cfg = await window.wisper.saveSettings({
    aiNotesProvider: provider,
    anthropicApiKey: anthropicApiKeyEl.value.trim(),
    anthropicModel: anthropicModelEl.value,
    openaiApiKey: openaiApiKeyEl.value.trim(),
    openaiModel: openaiModelEl.value,
  });
  window.__lastSettings = cfg;
  aiNotesSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { aiNotesSaveStatusEl.textContent = ''; }, 1500);
});

saveGeneralBtn.addEventListener('click', async () => {
  const cfg = await window.wisper.saveSettings({
    language: languageEl.value,
    micDeviceId: micDeviceEl.value,
  });
  window.__lastSettings = cfg;
  generalSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { generalSaveStatusEl.textContent = ''; }, 1500);
});

(async () => {
  const cfg = await window.wisper.getSettings();
  window.__lastSettings = cfg;
  whisperCliPathEl.value = cfg.whisperCliPath || '';
  modelPathEl.value = cfg.modelPath || '';
  groqApiKeyEl.value = cfg.groqApiKey || '';
  groqModelEl.value = cfg.groqModel || 'whisper-large-v3-turbo';
  languageEl.value = cfg.language || 'auto';
  applyEngineKind(cfg.engineKind || 'local');
  await populateMicDevices(cfg.micDeviceId || '');

  // AI Notes provider config
  await populateAiNotesModels();
  applyAiNotesProvider(cfg.aiNotesProvider || 'anthropic');
  anthropicApiKeyEl.value = cfg.anthropicApiKey || '';
  anthropicModelEl.value = cfg.anthropicModel || 'claude-sonnet-4-6';
  openaiApiKeyEl.value = cfg.openaiApiKey || '';
  openaiModelEl.value = cfg.openaiModel || 'gpt-4o';

  entries = await window.wisper.getHistory();
  render();

  // Models tab data + the path label in the header.
  modelsDirPathEl.textContent = await window.wisper.modelsDir();
  await refreshCatalog();
  await populateInstalledPicker();

  // Notes tab data — folders, notes, then drop into the most recent note
  // of the first folder for immediate continuity.
  await reloadNotes(true);

  // Templates tab data.
  await reloadTemplates();

  // Calendar snapshot — initial render is fast even before fetches finish
  // (we just show whatever's cached). Then refresh in the background so any
  // new events show up.
  calendarSnapshot = await window.wisper.calendarSnapshot();
  renderCalendar();
  if (calendarSnapshot.feeds.length > 0) {
    window.wisper.calendarRefresh();
  }

  // Meetings list
  meetingsList = await window.wisper.meetingsList();
  renderMeetingsAll();

  const needsSetup = (cfg.engineKind === 'groq')
    ? !cfg.groqApiKey
    : (!cfg.whisperCliPath || !cfg.modelPath);
  if (needsSetup) {
    switchTab('engine');
  }
})();
