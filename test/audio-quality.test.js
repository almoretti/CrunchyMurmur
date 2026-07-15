const test = require('node:test');
const assert = require('node:assert/strict');

const { analyseSpeechSamples } = require('../src/audio-quality');

test('rejects recordings that are too short for useful speech', () => {
  const result = analyseSpeechSamples(new Array(4_000).fill(0.1));
  assert.equal(result.usable, false);
  assert.equal(result.reason, 'too-short');
});

test('rejects near-silent recordings before they can hallucinate text', () => {
  const samples = Array.from({ length: 16_000 }, (_, index) => Math.sin(index / 20) * 0.0007);
  const result = analyseSpeechSamples(samples);
  assert.equal(result.usable, false);
  assert.equal(result.reason, 'no-speech');
});

test('rejects a constant DC offset as silence', () => {
  const result = analyseSpeechSamples(new Array(16_000).fill(0.04));
  assert.equal(result.usable, false);
  assert.equal(result.reason, 'no-speech');
});

test('accepts a normal speech-level signal', () => {
  const samples = Array.from({ length: 16_000 }, (_, index) => Math.sin(index / 20) * 0.04);
  const result = analyseSpeechSamples(samples);
  assert.equal(result.usable, true);
  assert.ok(result.peak > 0.03);
});
