const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadWithElectronMock(modulePath, appPaths) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: { getPath: (name) => appPaths[name] || appPaths.userData },
        shell: { openPath: async () => '' },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: () => { throw new Error('not available'); },
          decryptString: () => { throw new Error('not available'); },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return require(modulePath); }
  finally { Module._load = originalLoad; }
}

test('whisper-cli discovery includes Homebrew and validates a compatible executable', async () => {
  const cli = require('../src/whisper-cli');
  const candidates = cli.standardPaths('darwin', { HOME: '/Users/test', PATH: '/custom/bin' });
  assert.ok(candidates.includes('/opt/homebrew/bin/whisper-cli'));
  assert.ok(candidates.includes('/usr/local/bin/whisper-cli'));
  assert.ok(candidates.includes('/custom/bin/whisper-cli'));

  const valid = await cli.validateWhisperCli('/opt/homebrew/bin/whisper-cli', {
    platform: 'darwin',
    stat: async () => ({ isFile: () => true, mode: 0o755 }),
    run: () => ({ status: 0, stdout: 'whisper-cli 1.7.4\n' }),
  });
  assert.deepEqual(valid, { valid: true, path: '/opt/homebrew/bin/whisper-cli', version: 'whisper-cli 1.7.4' });

  const discovered = await cli.discoverWhisperCli({
    platform: 'darwin', env: { HOME: '/Users/test', PATH: '' },
    validate: async (candidate) => candidate === '/usr/local/bin/whisper-cli'
      ? { valid: true, path: candidate, version: 'whisper-cli 1.7.4' }
      : { valid: false },
  });
  assert.equal(discovered.path, '/usr/local/bin/whisper-cli');
  assert.equal(discovered.discovered, true);
});

test('notes store rejects traversal and keeps notes inside Documents', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-notes-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const notes = loadWithElectronMock('../src/notes-store', {
    userData: path.join(base, 'data'),
    documents: path.join(base, 'Documents'),
  });
  notes.createFolder('Projects');
  const created = notes.createNote({ folder: 'Projects', title: 'Safe note', content: '# Safe note\n' });
  assert.ok(created.note.path.startsWith(path.join(base, 'Documents', 'CrunchyMurmur Notes')));
  assert.throws(() => notes.deleteFolder('..'), /invalid/i);
  assert.throws(() => notes.updateNote({ folder: '..', filename: 'outside.md', content: 'bad' }), /invalid/i);
});

test('meeting store streams a valid bounded WAV and rejects invalid ids', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-meeting-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const meetings = loadWithElectronMock('../src/meetings-store', { userData: base });
  const meeting = meetings.create({ title: 'Streaming test' });
  meetings.beginMicWav(meeting.id);
  meetings.appendMicSamples(meeting.id, new Float32Array([0, 0.5, -0.5, 1, -1]));
  const completed = meetings.finishMicWav(meeting.id);
  const wav = fs.readFileSync(meetings.micWavPath(meeting.id));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(40), 10);
  assert.equal(completed.durationSec, 5 / 16_000);
  assert.throws(() => meetings.remove('..'), /invalid meeting id/i);
});

test('meeting store keeps microphone and system audio as separate tracks', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-dual-audio-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const meetings = loadWithElectronMock('../src/meetings-store', { userData: base });
  const meeting = meetings.create({ title: 'Dual audio' });
  meetings.beginMicWav(meeting.id);
  meetings.beginSystemWav(meeting.id);
  meetings.appendMicSamples(meeting.id, new Float32Array([0.5, 0.25]));
  meetings.appendSystemSamples(meeting.id, new Float32Array([-0.5, -0.25, 0.1]));
  meetings.finishMicWav(meeting.id);
  meetings.finishSystemWav(meeting.id);
  const saved = meetings.get(meeting.id);
  assert.equal(saved.hasMicAudio, true);
  assert.equal(saved.hasSystemAudio, true);
  assert.equal(fs.existsSync(meetings.micWavPath(meeting.id)), true);
  assert.equal(fs.existsSync(meetings.systemWavPath(meeting.id)), true);
});

test('meeting retention removes only audio and preserves transcripts and notes', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-retention-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const meetings = loadWithElectronMock('../src/meetings-store', { userData: base });
  const expired = meetings.create({ title: 'Expired' });
  const current = meetings.create({ title: 'Current' });
  meetings.beginMicWav(expired.id);
  meetings.appendMicSamples(expired.id, new Float32Array([0.25, -0.25]));
  meetings.finishMicWav(expired.id);
  meetings.update(expired.id, {
    createdAt: '2020-01-01T00:00:00.000Z',
    endedAt: '2020-01-01T00:01:00.000Z',
    transcript: 'Keep this transcript',
    userNotes: 'Keep these notes',
  });
  assert.equal(meetings.cleanupAudio('30'), 1);
  assert.equal(meetings.get(expired.id).transcript, 'Keep this transcript');
  assert.equal(meetings.get(expired.id).userNotes, 'Keep these notes');
  assert.equal(meetings.get(expired.id).hasMicAudio, false);
  assert.equal(fs.existsSync(meetings.micWavPath(expired.id)), false);
  assert.equal(meetings.get(current.id).title, 'Current');
  assert.equal(meetings.cleanupAudio('never'), 0);
});

test('settings public view masks persisted API keys', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-settings-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const settings = loadWithElectronMock('../src/settings', { userData: base });
  assert.equal(settings.defaultHotkey('win32'), 'Control+Super');
  assert.equal(settings.defaultHotkey('darwin'), 'Fn');
  assert.equal(settings.defaultHotkey('linux'), 'CommandOrControl+Shift+Space');
  assert.equal(settings.load().theme, 'system');
  settings.save({ groqApiKey: 'secret-value', language: 'en', theme: 'light' });
  assert.equal(settings.load().groqApiKey, 'secret-value');
  assert.equal(settings.load().theme, 'light');
  assert.equal(settings.publicView().groqApiKey, settings.SECRET_MASK);
  assert.equal(settings.save({ groqApiKey: settings.SECRET_MASK }).groqApiKey, 'secret-value');
  assert.doesNotMatch(fs.readFileSync(settings.configPath(), 'utf8'), /"groqApiKey"\s*:/);
  const expectedHotkey = process.platform === 'win32' ? 'Control+Super' : process.platform === 'darwin' ? 'Fn' : 'CommandOrControl+Shift+Space';
  assert.equal(settings.load().hotkey, expectedHotkey);
});
