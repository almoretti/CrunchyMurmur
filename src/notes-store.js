const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { atomicWriteFileSync, safePathSegment, safeChildPath } = require('./file-utils');

// Markdown notebook backed by real .md files on disk:
//   %USERPROFILE%\Documents\CrunchyMurmur Notes\
//       Inbox\
//           note-1.md
//       Meetings\
//           meeting-2026-04-26.md
//
// Folders are real subdirectories. The user can edit files in any external
// editor and we'll see the changes the next time we reload.
//
// Note: pre-rename this folder was called "WisperHelp Notes". The migration
// in main.js renames it to "CrunchyMurmur Notes" on first launch after the
// rename, so existing users keep their notes.

const SEED_FOLDERS = ['Inbox', 'Meetings'];

function rootDir() {
  const docs = app.getPath('documents') || path.join(os.homedir(), 'Documents');
  const dir = path.join(docs, 'CrunchyMurmur Notes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function folderPath(name) {
  return safeChildPath(rootDir(), safePathSegment(name, 'Folder name'));
}

function notePath(folder, filename) {
  return safeChildPath(rootDir(), safePathSegment(folder, 'Folder name'), safePathSegment(filename, 'Filename'));
}

function ensureSeedFolders() {
  for (const name of SEED_FOLDERS) {
    const p = path.join(rootDir(), name);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

function stableId(absPath) {
  // Hash the absolute path so the id is stable across reloads.
  return crypto.createHash('sha1').update(absPath).digest('hex').slice(0, 24);
}

function slugify(s) {
  const lower = (s || '').toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === '-' || ch === ' ') out += ' ';
  }
  out = out.split(/\s+/).filter(Boolean).join('-');
  if (!out) out = 'note';
  return out.slice(0, 60);
}

function uniqueFilename(base, folderPath) {
  let candidate = base + '.md';
  let i = 2;
  while (fs.existsSync(path.join(folderPath, candidate))) {
    candidate = `${base}-${i}.md`;
    i += 1;
  }
  return candidate;
}

function displayTitle(filename, content) {
  // Prefer the first ATX heading over the filename.
  const lines = (content || '').split('\n').slice(0, 20);
  for (const line of lines) {
    const trimmed = line.replace(/^\s+/, '');
    if (trimmed.startsWith('# ')) return trimmed.slice(2).trim();
  }
  const stripped = filename.replace(/\.md$/i, '');
  return stripped
    .replace(/-+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultTitle() {
  const d = new Date();
  return 'Note · ' + d.toLocaleString();
}

function readNote(folder, filename) {
  let absPath;
  try { absPath = notePath(folder, filename); } catch { return null; }
  let content = '';
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
  let stat;
  try { stat = fs.statSync(absPath); } catch { return null; }
  return {
    id: stableId(absPath),
    folder,
    filename,
    title: displayTitle(filename, content),
    content,
    createdAt: stat.birthtimeMs ? new Date(stat.birthtimeMs).toISOString() : stat.mtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    path: absPath,
  };
}

function listFolders() {
  ensureSeedFolders();
  const root = rootDir();
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function listNotes(folder) {
  let dir;
  try { dir = folderPath(folder); } catch { return []; }
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
  const notes = [];
  for (const f of files) {
    const n = readNote(folder, f);
    if (n) notes.push(n);
  }
  notes.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return notes;
}

function snapshot() {
  const folders = listFolders();
  const notesByFolder = {};
  const counts = {};
  for (const f of folders) {
    const list = listNotes(f);
    notesByFolder[f] = list;
    counts[f] = list.length;
  }
  return { rootDir: rootDir(), folders, notesByFolder, counts };
}

// Folder operations

function createFolder(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Folder name is empty.');
  // Strip path separators just in case.
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_');
  if (safe.length > 120) throw new Error('Folder name is too long.');
  safePathSegment(safe, 'Folder name');
  fs.mkdirSync(folderPath(safe), { recursive: true });
  return snapshot();
}

function deleteFolder(name) {
  if (!name) throw new Error('Folder name is empty.');
  const dir = folderPath(name);
  if (!fs.existsSync(dir)) return snapshot();
  fs.rmSync(dir, { recursive: true, force: true });
  return snapshot();
}

function renameFolder(oldName, newName) {
  const trimmed = (newName || '').trim().replace(/[\\/:*?"<>|]/g, '_');
  if (trimmed.length > 120) throw new Error('Folder name is too long.');
  if (!trimmed || trimmed === oldName) return snapshot();
  safePathSegment(trimmed, 'Folder name');
  const oldPath = folderPath(oldName);
  const newPath = folderPath(trimmed);
  fs.renameSync(oldPath, newPath);
  return snapshot();
}

function revealFolder(name) {
  return shell.openPath(folderPath(name));
}

// Note operations

function createNote({ title, content, folder }) {
  const folders = listFolders();
  const folderName = folder && folders.includes(folder)
    ? folder
    : (folders[0] || 'Inbox');
  const targetFolderPath = folderPath(folderName);
  fs.mkdirSync(targetFolderPath, { recursive: true });

  const baseTitle = ((title || '').trim() || defaultTitle()).slice(0, 500);
  const baseSlug = slugify(baseTitle);
  const filename = uniqueFilename(baseSlug, targetFolderPath);
  const initial = content && content.length ? String(content).slice(0, 5_000_000) : `# ${baseTitle}\n\n`;
  atomicWriteFileSync(notePath(folderName, filename), initial, 'utf8');

  const note = readNote(folderName, filename);
  return { note, snapshot: snapshot() };
}

function updateNote({ folder, filename, content }) {
  const target = notePath(folder, filename);
  if (!fs.existsSync(target)) throw new Error('Note not found.');
  const nextContent = String(content ?? '');
  if (nextContent.length > 5_000_000) throw new Error('Note exceeds the 5 MB limit.');
  atomicWriteFileSync(target, nextContent, 'utf8');
  return readNote(folder, filename);
}

function deleteNote({ folder, filename }) {
  const target = notePath(folder, filename);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  return snapshot();
}

function renameNote({ folder, filename, newTitle }) {
  const trimmed = (newTitle || '').trim();
  if (!trimmed) return null;
  const baseSlug = slugify(trimmed);
  const oldBase = filename.replace(/\.md$/i, '');
  if (baseSlug === oldBase) return readNote(folder, filename);
  const targetFolderPath = folderPath(folder);
  const newFilename = uniqueFilename(baseSlug, targetFolderPath);
  const oldUrl = notePath(folder, filename);
  const newUrl = notePath(folder, newFilename);
  fs.renameSync(oldUrl, newUrl);
  return readNote(folder, newFilename);
}

function moveNote({ folder, filename, toFolder }) {
  if (folder === toFolder) return readNote(folder, filename);
  if (!listFolders().includes(toFolder)) throw new Error('Destination folder not found.');
  const dest = folderPath(toFolder);
  const baseSlug = filename.replace(/\.md$/i, '');
  const newFilename = uniqueFilename(baseSlug, dest);
  fs.renameSync(notePath(folder, filename), notePath(toFolder, newFilename));
  return readNote(toFolder, newFilename);
}

module.exports = {
  rootDir,
  snapshot,
  listFolders,
  listNotes,
  readNote,
  createFolder,
  deleteFolder,
  renameFolder,
  revealFolder,
  createNote,
  updateNote,
  deleteNote,
  renameNote,
  moveNote,
};
