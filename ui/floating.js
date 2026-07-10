// Floating-bar renderer: owns the microphone capture + level meter.
// State machine driven by the main process via wisper.onState(...).
//
//   recording   → start mic, show pulsing red, drive level meter
//   flushing    → stop mic, downsample, ship samples back to main, show neutral
//   transcribing → show spinner (no meter), waiting for main to hide us

const labelEl = document.getElementById('label');
const timerEl = document.getElementById('timer');
const pillEl = document.getElementById('pill');
const meterBars = Array.from(document.querySelectorAll('.meter .bar'));

let mediaStream = null;
let audioCtx = null;
let processorNode = null;
let analyser = null;
let chunks = []; // Float32Array[] at native sample rate
let nativeSampleRate = 48000;
let rafHandle = null;
let captureGeneration = 0;

// Meeting timer state — when in 'meeting' state, we tick a 1 s timer based
// on the startedAt timestamp passed from main. Independent of the dictation
// audio graph.
let meetingStartedAt = 0;
let meetingTimerHandle = null;

async function startCapture() {
  const generation = ++captureGeneration;
  let micDeviceId = '';
  try {
    const cfg = await window.wisper.getSettings();
    micDeviceId = (cfg && cfg.micDeviceId) || '';
  } catch {}

  const audioConstraints = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  // `exact` so a saved-but-now-unavailable mic surfaces as an error rather than
  // silently falling back to a different device (which is exactly the bug we're
  // trying to fix).
  if (micDeviceId) audioConstraints.deviceId = { exact: micDeviceId };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    if (generation !== captureGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    mediaStream = stream;
  } catch (e) {
    if (generation !== captureGeneration) return;
    console.error('[floating] getUserMedia failed:', e);
    setLabel(micDeviceId ? 'Mic unavailable' : 'Mic blocked');
    window.wisper.captureFailed(e && e.message ? e.message : String(e));
    return;
  }

  audioCtx = new AudioContext();
  nativeSampleRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(mediaStream);

  // ScriptProcessor is deprecated but works everywhere without an AudioWorklet.
  // 4096 frames @ 48 kHz ≈ 85 ms per chunk — plenty for a level meter.
  processorNode = audioCtx.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (ev) => {
    const ch = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(ch));
  };

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  source.connect(processorNode);
  processorNode.connect(audioCtx.destination);

  drawMeter();
}

function drawMeter() {
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    // Map peak (0..1) to 5 bars of varying height.
    meterBars.forEach((bar, i) => {
      const threshold = (i + 1) / meterBars.length;
      const intensity = Math.max(0, Math.min(1, peak / threshold));
      bar.style.height = (4 + intensity * 10) + 'px';
      bar.style.opacity = 0.4 + intensity * 0.6;
    });
    rafHandle = requestAnimationFrame(tick);
  };
  rafHandle = requestAnimationFrame(tick);
}

function stopCapture() {
  captureGeneration += 1;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = null;
  if (processorNode) { try { processorNode.disconnect(); } catch {} processorNode = null; }
  if (analyser)      { try { analyser.disconnect(); }      catch {} analyser = null; }
  if (audioCtx)      { try { audioCtx.close(); }            catch {} audioCtx = null; }
  if (mediaStream)   {
    mediaStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    mediaStream = null;
  }
}

function flushAndSubmit() {
  // Concat chunks → Float32 → downsample to 16 kHz → ship to main.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const flat = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { flat.set(c, o); o += c.length; }
  chunks = [];

  const ratio = nativeSampleRate / 16000;
  const targetLen = Math.floor(flat.length / ratio);
  const out = new Float32Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    // Linear interp downsample. Whisper is forgiving; this is fine for speech.
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, flat.length - 1);
    const frac = srcIdx - lo;
    out[i] = flat[lo] * (1 - frac) + flat[hi] * frac;
  }

  // IPC can't transfer Float32Array directly without structured clone, but it
  // does copy plain arrays. Use Array.from to be explicit and safe.
  return window.wisper.submitSamples(Array.from(out));
}

function setLabel(text) { labelEl.textContent = text; }

function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tickMeetingTimer() {
  if (!meetingStartedAt) return;
  timerEl.textContent = fmtElapsed(Date.now() - meetingStartedAt);
}

function startMeetingTimer() {
  if (meetingTimerHandle) clearInterval(meetingTimerHandle);
  tickMeetingTimer();
  meetingTimerHandle = setInterval(tickMeetingTimer, 1000);
}

function stopMeetingTimer() {
  if (meetingTimerHandle) { clearInterval(meetingTimerHandle); meetingTimerHandle = null; }
  meetingStartedAt = 0;
  timerEl.textContent = '';
}

function setState(state) {
  document.body.classList.remove('state-recording', 'state-flushing', 'state-transcribing', 'state-meeting');
  document.body.classList.add('state-' + state);

  if (state === 'recording') {
    setLabel('Recording');
    stopMeetingTimer();
    startCapture();
  } else if (state === 'flushing') {
    setLabel('…');
    stopCapture();
    flushAndSubmit();
  } else if (state === 'transcribing') {
    setLabel('Transcribing');
  } else if (state === 'meeting') {
    setLabel('Recording meeting · click to stop');
    stopCapture();
    chunks = [];
    // Timer is started once we receive the startedAt from main (see below).
  } else if (state === 'idle') {
    setLabel('');
    stopCapture();
    stopMeetingTimer();
    chunks = [];
  }
}

window.wisper.onState((state) => setState(state));

window.wisper.onMeetingState(({ startedAt }) => {
  meetingStartedAt = startedAt || Date.now();
  startMeetingTimer();
});

// Click anywhere on the pill while in meeting state → ask main to stop
// the meeting. Main forwards to the main window's renderer which actually
// owns the audio capture.
pillEl.addEventListener('click', () => {
  if (document.body.classList.contains('state-meeting')) {
    window.wisper.requestStopMeeting();
  }
});
