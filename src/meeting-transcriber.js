const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { transcribeWav } = require('./transcriber');
const { transcribeWithGroq } = require('./groq');

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 5 * 60;

function wavHeader(sampleCount) {
  const dataBytes = sampleCount * 2;
  const out = Buffer.alloc(44);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 2, 28); out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  return out;
}

function splitWav(filename, chunkSeconds = CHUNK_SECONDS) {
  const wav = fs.readFileSync(filename);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt32LE(24) !== SAMPLE_RATE) {
    throw new Error('Meeting audio is not a supported 16 kHz WAV file.');
  }
  const pcm = wav.subarray(44);
  const bytesPerChunk = chunkSeconds * SAMPLE_RATE * 2;
  const chunks = [];
  for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
    const body = pcm.subarray(offset, Math.min(offset + bytesPerChunk, pcm.length));
    const target = path.join(os.tmpdir(), `crunchymurmur-meeting-${crypto.randomUUID()}.wav`);
    fs.writeFileSync(target, Buffer.concat([wavHeader(body.length / 2), body]));
    chunks.push({ filename: target, startSeconds: offset / 2 / SAMPLE_RATE });
  }
  return chunks;
}

function timestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function transcribeMeeting({
  tracks,
  settings,
  signal,
  onProgress = () => {},
  localTranscriber = transcribeWav,
}) {
  const work = [];
  for (const track of tracks) {
    for (const chunk of splitWav(track.filename)) work.push({ ...chunk, speaker: track.speaker });
  }
  const lines = [];
  try {
    for (let index = 0; index < work.length; index++) {
      if (signal?.aborted) throw new Error('Transcription cancelled.');
      const item = work[index];
      onProgress({ progress: index / work.length, stage: `Transcribing ${item.speaker.toLowerCase()} audio ${index + 1} of ${work.length}` });
      const text = settings.engineKind === 'groq'
        ? await transcribeWithGroq(item.filename, settings, { signal })
        : await localTranscriber(item.filename, settings, { signal });
      if (text.trim()) lines.push(`**[${timestamp(item.startSeconds)}] [${item.speaker}]** ${text.trim()}`);
    }
    onProgress({ progress: 1, stage: 'Complete' });
    return lines.join('\n\n');
  } finally {
    for (const item of work) try { fs.unlinkSync(item.filename); } catch {}
  }
}

module.exports = { splitWav, timestamp, transcribeMeeting, CHUNK_SECONDS };
