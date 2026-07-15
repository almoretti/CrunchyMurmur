const test = require('node:test');
const assert = require('node:assert/strict');

const { parakeetSupportsLanguage } = require('../src/native-transcription-service');

test('Parakeet accepts its 25 European languages and auto detection', () => {
  for (const language of ['auto', 'en', 'it', 'es', 'fr', 'de', 'pt', 'ru', 'uk', 'sv', 'da']) {
    assert.equal(parakeetSupportsLanguage(language), true, language);
  }
});

test('Parakeet directs unsupported spoken languages to Whisper', () => {
  for (const language of ['zh', 'ja', 'ko', 'no', 'tr', 'ar', 'hi']) {
    assert.equal(parakeetSupportsLanguage(language), false, language);
  }
});
