const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { LocalTranscriptionService } = require('../src/local-transcription-service');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit('close', 0));
    return true;
  };
  return child;
}

test('local transcription reuses one whisper-server session for repeated dictations', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-local-service-'));
  const cliPath = path.join(dir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  const serverPath = path.join(dir, process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server');
  const modelPath = path.join(dir, 'ggml-small.bin');
  const wavPath = path.join(dir, 'sample.wav');
  for (const filename of [cliPath, serverPath, modelPath, wavPath]) fs.writeFileSync(filename, 'fixture');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const launches = [];
  const requests = [];
  const service = new LocalTranscriptionService({
    spawnProcess(command, args) {
      launches.push({ command, args });
      return fakeChild();
    },
    choosePort: async () => 43123,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (!options.method) return new Response('ready');
      return Response.json({ text: requests.length === 2 ? 'first result' : 'second result' });
    },
    readinessPollMs: 0,
  });
  t.after(() => service.dispose());

  const settings = { whisperCliPath: cliPath, modelPath, language: 'auto' };
  assert.equal(await service.transcribe(wavPath, settings), 'first result');
  assert.equal(await service.transcribe(wavPath, settings), 'second result');

  assert.equal(launches.length, 1);
  assert.equal(launches[0].command, serverPath);
  assert.equal(requests.filter((request) => request.options.method === 'POST').length, 2);
  const diagnostics = service.diagnostics();
  assert.equal(diagnostics.backend, 'whisper-server');
  assert.equal(diagnostics.launches, 1);
  assert.equal(diagnostics.transcriptions, 2);
});

test('local transcription falls back to whisper-cli when whisper-server is unavailable', async () => {
  const calls = [];
  const service = new LocalTranscriptionService({
    findServer: () => '',
    cliTranscribe: async (wavPath, settings) => {
      calls.push({ wavPath, settings });
      return 'CLI result';
    },
  });

  const settings = { whisperCliPath: 'whisper-cli', modelPath: 'model.bin', language: 'en' };
  assert.equal(await service.transcribe('sample.wav', settings), 'CLI result');
  assert.equal(calls.length, 1);
  assert.equal(service.diagnostics().backend, 'whisper-cli');
});

test('a failed persistent server uses CLI fallback without retrying on every recording', async () => {
  let launches = 0;
  let cliCalls = 0;
  const service = new LocalTranscriptionService({
    findServer: () => 'whisper-server',
    choosePort: async () => 43124,
    spawnProcess() {
      launches += 1;
      const child = fakeChild();
      queueMicrotask(() => child.emit('close', 1));
      return child;
    },
    fetchImpl: async () => { throw new Error('connection refused'); },
    sleep: async () => {},
    now: () => 100,
    cliTranscribe: async () => {
      cliCalls += 1;
      return 'fallback';
    },
  });

  const settings = { whisperCliPath: 'whisper-cli', modelPath: 'model.bin', language: 'en' };
  assert.equal(await service.transcribe('one.wav', settings), 'fallback');
  assert.equal(await service.transcribe('two.wav', settings), 'fallback');
  assert.equal(launches, 1);
  assert.equal(cliCalls, 2);
  assert.equal(service.diagnostics().fallbacks, 1);
});

test('disposing during model preload terminates the pending native process', async () => {
  let child;
  let rejectReadiness;
  const service = new LocalTranscriptionService({
    findServer: () => 'whisper-server',
    choosePort: async () => 43125,
    spawnProcess() {
      child = fakeChild();
      return child;
    },
    fetchImpl: () => new Promise((_resolve, reject) => { rejectReadiness = reject; }),
    sleep: async () => {},
  });

  const pending = service.prepare({ whisperCliPath: 'whisper-cli', modelPath: 'model.bin' });
  while (!child || !rejectReadiness) await new Promise((resolve) => setImmediate(resolve));
  try {
    service.dispose();
    assert.equal(child.killed, true);
  } finally {
    rejectReadiness(new Error('test cleanup'));
    await assert.rejects(pending);
  }
});

test('bundled runtime is used when no external whisper executable is configured', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-bundled-runtime-'));
  const modelPath = path.join(dir, 'model.bin');
  const wavPath = path.join(dir, 'sample.wav');
  fs.writeFileSync(modelPath, 'model');
  fs.writeFileSync(wavPath, 'audio');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const child = fakeChild();
  const launches = [];
  const service = new LocalTranscriptionService({
    resolveRuntime: () => ({ cliPath: 'bundled-cli', serverPath: 'bundled-server' }),
    spawnProcess(command) { launches.push(command); return child; },
    choosePort: async () => 43126,
    fetchImpl: async (_url, options = {}) => options.method
      ? Response.json({ text: 'bundled result' })
      : new Response('ready'),
  });
  t.after(() => service.dispose());

  assert.equal(await service.transcribe(wavPath, { whisperCliPath: '', modelPath, language: 'en' }), 'bundled result');
  assert.deepEqual(launches, ['bundled-server']);
});
