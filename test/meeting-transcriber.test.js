const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitWav, timestamp, transcribeMeeting } = require('../src/meeting-transcriber');

function testWav(seconds) {
  const samples = 16_000 * seconds;
  const dataBytes = samples * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(16_000, 24); out.writeUInt32LE(32_000, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  return out;
}

test('meeting WAVs split into timestamped chunks', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-chunks-'));
  const source = path.join(dir, 'meeting.wav');
  fs.writeFileSync(source, testWav(3));
  const chunks = splitWav(source, 2);
  t.after(() => {
    for (const chunk of chunks) fs.rmSync(chunk.filename, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.deepEqual(chunks.map((chunk) => chunk.startSeconds), [0, 2]);
  assert.equal(timestamp(0), '0:00');
  assert.equal(timestamp(3661), '1:01:01');
});

test('meeting tracks use the shared local transcription service', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-meeting-service-'));
  const mic = path.join(dir, 'mic.wav');
  const system = path.join(dir, 'system.wav');
  fs.writeFileSync(mic, testWav(1));
  fs.writeFileSync(system, testWav(1));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const calls = [];
  const result = await transcribeMeeting({
    tracks: [
      { filename: mic, speaker: 'YOU' },
      { filename: system, speaker: 'OTHERS' },
    ],
    settings: { engineKind: 'local' },
    localTranscriber: async (filename) => {
      calls.push(filename);
      return calls.length === 1 ? 'My contribution' : 'Their contribution';
    },
  });

  assert.equal(calls.length, 2);
  assert.match(result, /\[YOU\].*My contribution/);
  assert.match(result, /\[OTHERS\].*Their contribution/);
});
