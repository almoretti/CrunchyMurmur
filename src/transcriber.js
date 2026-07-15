const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Spawn whisper.cpp's CLI against a 16 kHz mono WAV file.
 * Returns the trimmed transcript on stdout.
 */
function transcribeWav(wavPath, { whisperCliPath, modelPath, language }, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!whisperCliPath || !fs.existsSync(whisperCliPath)) {
      return reject(new Error('Whisper CLI path is not set or invalid (Settings → Engine).'));
    }
    if (!modelPath || !fs.existsSync(modelPath)) {
      return reject(new Error('Whisper model path is not set or invalid (Settings → Engine).'));
    }

    // -nt = no timestamps. -l auto = auto-detect language. -otxt = also write .txt
    // alongside, but we read stdout so we don't depend on it.
    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-l', language || 'auto',
      '-t', String(Math.min(16, os.availableParallelism?.() || os.cpus().length || 4)),
      '-nt',
      '--no-prints',
    ];

    const proc = spawn(whisperCliPath, args, { windowsHide: true });
    let settled = false;
    const abort = () => {
      if (settled) return;
      try { proc.kill(); } catch {}
    };
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch {}
      if (!settled) reject(new Error('Local transcription timed out after 10 minutes.'));
    }, 10 * 60 * 1000);

    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (err) => { clearTimeout(timeout); settled = true; signal?.removeEventListener('abort', abort); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new Error('Transcription cancelled.'));
      if (code === 0) {
        resolve(out.trim());
      } else {
        reject(new Error(`whisper-cli exited ${code}: ${err.trim() || 'no error output'}`));
      }
    });
  });
}

/**
 * Write a Float32 16 kHz mono PCM array to a temporary WAV file.
 * Returns the file path.
 */
function writeTempWav(float32Samples) {
  const tmp = path.join(os.tmpdir(), `crunchymurmur-${crypto.randomUUID()}.wav`);
  const buffer = encodeWav(float32Samples, 16000);
  fs.writeFileSync(tmp, buffer);
  return tmp;
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2; // PCM16
  const byteLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + byteLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);              // PCM chunk size
  buffer.writeUInt16LE(1, 20);               // PCM format
  buffer.writeUInt16LE(1, 22);               // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32);  // block align
  buffer.writeUInt16LE(16, 34);              // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(byteLength, 40);

  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(s | 0, 44 + i * 2);
  }
  return buffer;
}

module.exports = { transcribeWav, writeTempWav };
