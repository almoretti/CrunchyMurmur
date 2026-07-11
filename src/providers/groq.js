const catalog = require('./model-catalog');

const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (recommended)' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
  { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
  { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
];
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function isNotesModel(model) {
  const id = String(model?.id || '');
  if (model?.active === false) return false;
  return id.length > 0 && !/(whisper|guard|safety|moderation|speech|tts|compound|embed)/i.test(id);
}

async function listModels(apiKey) {
  if (!apiKey) return MODELS;
  try {
    const data = await catalog.fetchModelList({
      url: 'https://api.groq.com/openai/v1/models',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const models = catalog.uniqueModels(data
      .filter(isNotesModel)
      .map(model => ({ id: model.id, label: model.id }))
      .sort((a, b) => a.id.localeCompare(b.id)));
    return models.length ? models : MODELS;
  } catch {
    return MODELS;
  }
}

async function generate({ apiKey, model, prompt, systemPrompt, maxTokens = 4096 }) {
  if (!apiKey) throw new Error('No Groq API key on file. Add it on the Engine page.');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, max_tokens: maxTokens, temperature: 0 }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Groq AI request timed out after 90 seconds.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq HTTP ${response.status}: ${body.slice(0, 280) || '(empty body)'}`);
  }
  const data = await response.json();
  const text = String(data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('Groq returned an empty response.');
  return text;
}

module.exports = { generate, listModels, isNotesModel, MODELS, DEFAULT_MODEL, displayName: 'Groq' };
