// OpenAI Chat Completions — direct HTTP. Mirrors Mac OpenAIProvider.swift.

const catalog = require('./model-catalog');

const MODELS = [
  { id: 'gpt-4o',      label: 'GPT-4o (recommended)' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (fastest, cheapest)' },
];
const DEFAULT_MODEL = 'gpt-4o';

function isNotesModel(id) {
  if (!/^(gpt-|o[1-9](?:-|$))/i.test(id)) return false;
  return !/(audio|realtime|transcribe|tts|image|search|moderation|embedding|instruct|vision|codex)/i.test(id);
}

async function listModels(apiKey) {
  if (!apiKey) return MODELS;
  try {
    const data = await catalog.fetchModelList({
      url: 'https://api.openai.com/v1/models',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const models = catalog.uniqueModels(data
      .filter(model => isNotesModel(model.id || ''))
      .map(model => ({ id: model.id, label: model.id }))
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })));
    return models.length ? models : MODELS;
  } catch {
    return MODELS;
  }
}

async function generate({ apiKey, model, prompt }) {
  if (!apiKey) {
    const err = new Error('No OpenAI API key on file. Add it on the Engine page.');
    err.code = 'missing-key';
    throw err;
  }
  const body = {
    model: model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI HTTP ${res.status}: ${snippet || '(empty body)'}`);
  }
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text;
}

module.exports = { generate, listModels, isNotesModel, MODELS, DEFAULT_MODEL, displayName: 'OpenAI' };
