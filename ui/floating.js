// Floating-bar renderer: owns the microphone capture + level meter.
// State machine driven by the main process via wisper.onState(...).
//
//   recording   → start mic, show pulsing red, drive level meter
//   flushing    → stop mic, downsample, ship samples back to main, show neutral
//   transcribing → show spinner (no meter), waiting for main to hide us

const labelEl = document.getElementById('label');
const meterBars = Array.from(document.querySelectorAll('.meter .bar'));

let mediaStream = null;
let audioCtx = null;
let processorNode = null;
let analyser = null;
let chunks = []; // Float32Array[] at native sample rate
let nativeSampleRate = 48000;
let rafHandle = null;

async function startCapture() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch (e) {
    console.error('[floating] getUserMedia failed:', e);
    setLabel('Mic blocked');
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

function setState(state) {
  document.body.classList.remove('state-recording', 'state-flushing', 'state-transcribing');
  document.body.classList.add('state-' + state);

  if (state === 'recording') {
    setLabel('Recording');
    startCapture();
  } else if (state === 'flushing') {
    setLabel('…');
    stopCapture();
    flushAndSubmit();
  } else if (state === 'transcribing') {
    setLabel('Transcribing');
  } else if (state === 'idle') {
    setLabel('');
    stopCapture();
    chunks = [];
  }
}

window.wisper.onState((state) => setState(state));
