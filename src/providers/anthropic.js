// Anthropic Messages API — direct HTTP. Mirrors Mac AnthropicProvider.swift.

const MODELS = [
  { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5 (highest quality)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (fastest, cheapest)' },
];
const DEFAULT_MODEL = 'claude-sonnet-4-6';

async function generate({ apiKey, model, prompt }) {
  if (!apiKey) {
    const err = new Error('No Anthropic API key on file. Add it on the Engine page.');
    err.code = 'missing-key';
    throw err;
  }
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  // 90 s timeout matches Mac's URLRequest.timeoutInterval.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const snippet = text.length > 280 ? text.slice(0, 280) + '…' : text;
    throw new Error(`Anthropic HTTP ${res.status}: ${snippet || '(empty body)'}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b && b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic returned an empty response.');
  return text;
}

module.exports = { generate, MODELS, DEFAULT_MODEL, displayName: 'Anthropic' };
