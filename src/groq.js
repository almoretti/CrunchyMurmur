const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * POSTs a 16 kHz mono WAV file to Groq's Whisper endpoint and returns the
 * transcribed text. Uses Node's built-in fetch + FormData (Electron 32 ships
 * Node ≥ 20, both globals available).
 */
async function transcribeWithGroq(wavPath, { groqApiKey, groqModel, language }, { signal } = {}) {
  if (!groqApiKey) {
    throw new Error('Groq API key is not set (Settings → Engine).');
  }

  const buffer = fs.readFileSync(wavPath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), path.basename(wavPath));
  form.append('model', groqModel || 'whisper-large-v3-turbo');
  form.append('response_format', 'text');
  form.append('temperature', '0');
  if (language && language !== 'auto') {
    form.append('language', language);
  }

  let resp;
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Groq transcription timed out after 120 seconds.');
    throw new Error(`Network error reaching Groq: ${e.message}`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', relayAbort);
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('Invalid Groq API key.');
    if (resp.status === 429) throw new Error('Groq rate-limited. Try again in a moment.');
    throw new Error(`Groq error ${resp.status}: ${errText.slice(0, 240)}`);
  }

  // response_format=text returns plain text (not JSON).
  return (await resp.text()).trim();
}

module.exports = { transcribeWithGroq };
