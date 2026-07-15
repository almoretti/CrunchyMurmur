function analyseSpeechSamples(samples, {
  sampleRate = 16_000,
  minimumSeconds = 0.5,
  minimumPeak = 0.008,
  minimumRms = 0.001,
  activeThreshold = 0.003,
  minimumActiveFraction = 0.01,
} = {}) {
  const input = samples || [];
  if (input.length < sampleRate * minimumSeconds) {
    return { usable: false, reason: 'too-short', durationSeconds: input.length / sampleRate };
  }
  let sumSquares = 0;
  let sum = 0;
  let peak = 0;
  let active = 0;
  for (const raw of input) {
    const value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
    const magnitude = Math.abs(value);
    sumSquares += value * value;
    sum += value;
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= activeThreshold) active += 1;
  }
  const mean = sum / input.length;
  const rms = Math.sqrt(Math.max(0, (sumSquares / input.length) - (mean * mean)));
  const activeFraction = active / input.length;
  const usable = peak >= minimumPeak && rms >= minimumRms && activeFraction >= minimumActiveFraction;
  return {
    usable,
    reason: usable ? '' : 'no-speech',
    durationSeconds: input.length / sampleRate,
    peak,
    rms,
    activeFraction,
  };
}

module.exports = { analyseSpeechSamples };
