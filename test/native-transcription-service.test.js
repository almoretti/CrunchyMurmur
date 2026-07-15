const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { NativeTranscriptionService, parakeetSupportsLanguage } = require('../src/native-transcription-service');

function fakeHelper() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.stdin = {
    writable: true,
    write(line, callback) {
      const request = JSON.parse(line);
      if (request.action === 'load') child.stdout.write(`${JSON.stringify({ ok: true, loadMs: 1 })}\n`);
      callback?.();
    },
    end() {},
  };
  child.kill = () => { child.killed = true; };
  return child;
}

test('Parakeet accepts its 25 European languages and auto detection', () => {
  for (const language of ['auto', 'bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk']) {
    assert.equal(parakeetSupportsLanguage(language), true, language);
  }
});

test('Parakeet directs unsupported spoken languages to Whisper', () => {
  for (const language of ['zh', 'ja', 'ko', 'no', 'tr', 'ar', 'hi']) {
    assert.equal(parakeetSupportsLanguage(language), false, language);
  }
});

test('native transcription abort terminates an in-flight helper request', async () => {
  const child = fakeHelper();
  const service = new NativeTranscriptionService({ resolveExecutable: () => 'helper', spawnProcess: () => child });
  const controller = new AbortController();
  const pending = service.transcribe('audio.wav', { parakeetModelPath: 'model', language: 'en' }, { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, /cancelled/i);
  assert.equal(child.killed, true);
});

test('native transcription times out and restarts an unresponsive helper', async () => {
  const child = fakeHelper();
  const service = new NativeTranscriptionService({
    resolveExecutable: () => 'helper',
    spawnProcess: () => child,
    inferenceTimeoutMs: 5,
  });
  await assert.rejects(
    service.transcribe('audio.wav', { parakeetModelPath: 'model', language: 'en' }),
    /timed out/i,
  );
  assert.equal(child.killed, true);
});
