const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');

// On-disk layout:
//   %APPDATA%\CrunchyMurmur\Meetings\
//     <id>\
//       meta.json    — id, title, createdAt, endedAt, userNotes, transcript, aiNotes, aiTemplateId
//       mic.wav      — captured microphone audio (16 kHz mono PCM16)
//
// Mac MeetingsStore also stores system.wav alongside; the Windows port is
// mic-only until WASAPI loopback is wired up.

function meetingsDir() {
  const dir = path.join(app.getPath('userData'), 'Meetings');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function meetingDir(id) {
  return path.join(meetingsDir(), id);
}

function metaPath(id) { return path.join(meetingDir(id), 'meta.json'); }
function micWavPath(id) { return path.join(meetingDir(id), 'mic.wav'); }

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
  fs.writeFileSync(metaPath(id), JSON.stringify(m, null, 2), 'utf8');
}

function list() {
  const dir = meetingsDir();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
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

// Write a 16 kHz mono PCM16 WAV from a Float32 sample array to mic.wav.
// Same encoder shape as src/transcriber.js writeTempWav, kept inline so
// we don't have to plumb a new path arg through that helper.
function writeMicWav(id, float32Samples) {
  const dir = meetingDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const sampleRate = 16_000;
  const bytesPerSample = 2;
  const byteLength = float32Samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + byteLength);
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
  for (let i = 0; i < float32Samples.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(s | 0, 44 + i * 2);
  }
  fs.writeFileSync(micWavPath(id), buffer);
  const m = read(id);
  if (m) write(id, { ...m, hasMicAudio: true, durationSec: float32Samples.length / sampleRate });
}

function remove(id) {
  const dir = meetingDir(id);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function reveal(id) {
  return shell.openPath(meetingDir(id));
}

module.exports = {
  list,
  get,
  create,
  update,
  writeMicWav,
  remove,
  reveal,
  meetingsDir,
  meetingDir,
  micWavPath,
};
