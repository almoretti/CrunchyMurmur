const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { atomicWriteFileSync, safeChildPath } = require('./file-utils');

// On-disk layout under Electron's per-user app-data directory:
//   Meetings/
//     <id>\
//       meta.json    — id, title, createdAt, endedAt, userNotes, transcript, aiNotes, aiTemplateId
//       mic.wav      — captured microphone audio (16 kHz mono PCM16)
//
// System audio is optional: supported Windows/macOS builds keep it separate
// so transcription can label the user and other participants independently.

function meetingsDir() {
  const dir = path.join(app.getPath('userData'), 'Meetings');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function meetingDir(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id)) throw new Error('Invalid meeting id.');
  return safeChildPath(meetingsDir(), id);
}

function metaPath(id) { return path.join(meetingDir(id), 'meta.json'); }
function micWavPath(id) { return path.join(meetingDir(id), 'mic.wav'); }
function systemWavPath(id) { return path.join(meetingDir(id), 'system.wav'); }

function nextId() {
  return crypto.randomBytes(8).toString('hex');
}

function read(id) {
  try {
    const raw = fs.readFileSync(metaPath(id), 'utf8');
    const m = JSON.parse(raw);
    return { ...m, id };
  } catch {
    return null;
  }
}

function write(id, m) {
  fs.mkdirSync(meetingDir(id), { recursive: true });
  atomicWriteFileSync(metaPath(id), JSON.stringify(m, null, 2), 'utf8');
}

function list() {
  const dir = meetingsDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    recoverInterruptedMicWav(e.name);
    const m = read(e.name);
    if (m) out.push(m);
  }
  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return out;
}

function get(id) {
  return read(id);
}

function create({ title, calendarEventId } = {}) {
  const id = nextId();
  const now = new Date();
  const m = {
    id,
    title: (title || '').trim() || `Meeting · ${now.toLocaleString()}`,
    createdAt: now.toISOString(),
    endedAt: null,
    userNotes: '',
    transcript: '',
    aiNotes: '',
    aiTemplateId: null,
    calendarEventId: calendarEventId || null,
    hasMicAudio: false,
    hasSystemAudio: false,
  };
  write(id, m);
  return m;
}

function update(id, partial) {
  const cur = read(id);
  if (!cur) throw new Error('Unknown meeting: ' + id);
  const next = { ...cur, ...partial, id };
  write(id, next);
  return next;
}

function wavHeader(sampleCount, sampleRate = 16_000) {
  const bytesPerSample = 2;
  const byteLength = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(byteLength, 40);
  return buffer;
}

function pcm16Buffer(float32Samples) {
  const buffer = Buffer.allocUnsafe(float32Samples.length * 2);
  for (let i = 0; i < float32Samples.length; i++) {
    let s = Math.max(-1, Math.min(1, Number(float32Samples[i]) || 0));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(s | 0, i * 2);
  }
  return buffer;
}

const audioSessions = new Map();

function sessionKey(id, kind) { return `${id}:${kind}`; }

function recoverInterruptedMicWav(id) {
  if (audioSessions.has(sessionKey(id, 'mic'))) return;
  let partialPath;
  try { partialPath = micWavPath(id) + '.partial'; } catch { return; }
  if (!fs.existsSync(partialPath)) return;
  try {
    const bytes = fs.statSync(partialPath).size;
    if (bytes <= 44) {
      fs.unlinkSync(partialPath);
      update(id, { endedAt: new Date().toISOString(), hasMicAudio: false, durationSec: 0 });
      return;
    }
    const sampleCount = Math.floor((bytes - 44) / 2);
    const fd = fs.openSync(partialPath, 'r+');
    try {
      fs.writeSync(fd, wavHeader(sampleCount), 0, 44, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(partialPath, micWavPath(id));
    update(id, {
      endedAt: new Date().toISOString(),
      hasMicAudio: true,
      durationSec: sampleCount / 16_000,
      recoveredAfterCrash: true,
    });
  } catch (err) {
    console.warn('[meetings] could not recover interrupted recording:', err.message);
  }
}

function beginAudioWav(id, kind) {
  if (!read(id)) throw new Error('Unknown meeting: ' + id);
  if (!['mic', 'system'].includes(kind)) throw new Error('Invalid meeting audio kind.');
  const key = sessionKey(id, kind);
  if (audioSessions.has(key)) throw new Error('Meeting audio capture is already active.');
  const finalPath = kind === 'mic' ? micWavPath(id) : systemWavPath(id);
  const partialPath = finalPath + '.partial';
  fs.mkdirSync(meetingDir(id), { recursive: true });
  const fd = fs.openSync(partialPath, 'w');
  fs.writeSync(fd, wavHeader(0));
  audioSessions.set(key, { fd, partialPath, finalPath, sampleCount: 0, kind });
}

function appendAudioSamples(id, kind, samples) {
  const session = audioSessions.get(sessionKey(id, kind));
  if (!session) throw new Error('Meeting audio capture is not active.');
  const data = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  if (data.length === 0) return;
  fs.writeSync(session.fd, pcm16Buffer(data));
  session.sampleCount += data.length;
}

function finishAudioWav(id, kind) {
  const key = sessionKey(id, kind);
  const session = audioSessions.get(key);
  if (!session) throw new Error('Meeting audio capture is not active.');
  audioSessions.delete(key);
  try {
    fs.writeSync(session.fd, wavHeader(session.sampleCount), 0, 44, 0);
    fs.fsyncSync(session.fd);
  } finally {
    fs.closeSync(session.fd);
  }
  fs.renameSync(session.partialPath, session.finalPath);
  const partial = kind === 'mic'
    ? { hasMicAudio: session.sampleCount > 0, durationSec: session.sampleCount / 16_000, endedAt: new Date().toISOString() }
    : { hasSystemAudio: session.sampleCount > 0, systemDurationSec: session.sampleCount / 16_000 };
  return update(id, partial);
}

function abortAudioWav(id, kind) {
  const key = sessionKey(id, kind);
  const session = audioSessions.get(key);
  if (!session) return false;
  audioSessions.delete(key);
  try { fs.closeSync(session.fd); } catch {}
  try { fs.unlinkSync(session.partialPath); } catch {}
  return true;
}

function beginMicWav(id) { return beginAudioWav(id, 'mic'); }
function beginSystemWav(id) { return beginAudioWav(id, 'system'); }
function appendMicSamples(id, samples) { return appendAudioSamples(id, 'mic', samples); }
function appendSystemSamples(id, samples) { return appendAudioSamples(id, 'system', samples); }
function finishMicWav(id) { return finishAudioWav(id, 'mic'); }
function finishSystemWav(id) { return finishAudioWav(id, 'system'); }
function abortMicWav(id) { return abortAudioWav(id, 'mic'); }
function abortSystemWav(id) { return abortAudioWav(id, 'system'); }

function remove(id) {
  abortMicWav(id);
  abortSystemWav(id);
  const dir = meetingDir(id);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function deleteAudio(id) {
  const meeting = read(id);
  if (!meeting) return false;
  abortMicWav(id);
  abortSystemWav(id);
  let removed = false;
  for (const filename of [micWavPath(id), systemWavPath(id)]) {
    if (!fs.existsSync(filename)) continue;
    try { fs.unlinkSync(filename); removed = true; } catch {}
  }
  if (removed || meeting.hasMicAudio || meeting.hasSystemAudio) {
    update(id, { hasMicAudio: false, hasSystemAudio: false });
  }
  return removed;
}

function cleanupAudio(policy, now = Date.now()) {
  if (!policy || policy === 'never' || policy === '0') return 0;
  const days = Number.parseInt(policy, 10);
  const cutoff = Number.isFinite(days) && days > 0 ? now - days * 24 * 60 * 60 * 1000 : null;
  let cleaned = 0;
  for (const meeting of list()) {
    const afterTranscription = policy === 'after_transcription'
      && Boolean(String(meeting.transcript || '').trim());
    const timestamp = Date.parse(meeting.endedAt || meeting.createdAt || '');
    const expired = cutoff !== null && Number.isFinite(timestamp) && timestamp < cutoff;
    if ((afterTranscription || expired) && deleteAudio(meeting.id)) {
      cleaned += 1;
    }
  }
  return cleaned;
}

function totalAudioSize() {
  let bytes = 0;
  for (const meeting of list()) {
    for (const filename of [micWavPath(meeting.id), systemWavPath(meeting.id)]) {
      try { bytes += fs.statSync(filename).size; } catch {}
    }
  }
  return bytes;
}

function reveal(id) {
  return shell.openPath(meetingDir(id));
}

module.exports = {
  list,
  get,
  create,
  update,
  beginMicWav,
  beginSystemWav,
  appendMicSamples,
  appendSystemSamples,
  finishMicWav,
  finishSystemWav,
  abortMicWav,
  abortSystemWav,
  remove,
  reveal,
  meetingsDir,
  meetingDir,
  micWavPath,
  systemWavPath,
  deleteAudio,
  cleanupAudio,
  totalAudioSize,
};
