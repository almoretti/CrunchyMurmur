const settings = require('./settings');
const templates = require('./templates');
const notes = require('./notes-store');
const anthropic = require('./providers/anthropic');
const openai = require('./providers/openai');
const claudeCode = require('./providers/claude-code');
const codex = require('./providers/codex');

const PROVIDERS = { anthropic, openai, claudeCode, codex };

function listProviders() {
  // The order here is also the order shown in the UI radio.
  return [
    { id: 'anthropic',  displayName: 'Anthropic API', models: anthropic.MODELS, defaultModel: anthropic.DEFAULT_MODEL, kind: 'http' },
    { id: 'openai',     displayName: 'OpenAI API',    models: openai.MODELS,    defaultModel: openai.DEFAULT_MODEL,    kind: 'http' },
    { id: 'claudeCode', displayName: 'Claude Code (your subscription)', kind: 'cli',
      available: claudeCode.isAvailable(), executable: claudeCode.executable() },
    { id: 'codex',      displayName: 'Codex (your subscription)', kind: 'cli',
      available: codex.isAvailable(), executable: codex.executable() },
  ];
}

// Compose the prompt for a single-speaker dictation (Recordings tab).
// The Mac equivalent (NoteTemplate.makePrompt) is meeting-aware; this is the
// recording-aware variant — same structure, no [YOU]/[OTHERS] tags, no live
// notes block.
function makeRecordingPrompt({ template, recording }) {
  const ts = new Date(recording.createdAt);
  const dateLine = ts.toLocaleString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const minutes = Math.max(1, Math.round((recording.durationSec || 0) / 60));
  const langLine = recording.language && recording.language !== 'auto'
    ? `Language: ${recording.language.toUpperCase()}`
    : '';

  return `You are an expert at extracting structured notes from voice transcripts. Your job is to turn a recorded dictation into clean, useful notes.

The user dictated this with their microphone. There are no other speakers — everything below is from the user.

# Recording metadata
Recorded: ${dateLine}
Duration: ~${minutes} minute${minutes === 1 ? '' : 's'}
${langLine}

# Transcript
${recording.text}

# Your task
${template.instructions}

Output in clean Markdown. Use headings (##) for sections. Be concise — avoid filler words and repetition. Do not invent details that aren't in the transcript. If a section has nothing to fill, write "_None._" rather than padding.`;
}

async function generateFromRecording({ recording, templateId, provider, model }) {
  const tpl = templates.find(templateId);
  if (!tpl) throw new Error('Unknown template id: ' + templateId);

  const cfg = settings.load();
  const providerId = provider || cfg.aiNotesProvider || 'anthropic';
  const mod = PROVIDERS[providerId];
  if (!mod) throw new Error('Unknown provider: ' + providerId);

  const prompt = makeRecordingPrompt({ template: tpl, recording });

  // CLI providers don't need an API key or model — they shell out to the
  // user's installed CLI which uses their existing subscription.
  if (providerId === 'claudeCode' || providerId === 'codex') {
    const text = await mod.generate({ prompt });
    return { text, providerId, modelId: null, templateId };
  }

  const apiKey = providerId === 'anthropic' ? cfg.anthropicApiKey : cfg.openaiApiKey;
  const modelId = model || (providerId === 'anthropic' ? cfg.anthropicModel : cfg.openaiModel) || mod.DEFAULT_MODEL;
  const text = await mod.generate({ apiKey, model: modelId, prompt });
  return { text, providerId, modelId, templateId };
}

// Persists the generated markdown into the user's Notes folder. Default
// destination is "Inbox" — same as Mac's "Send to Notes" default.
function saveToNotes({ markdown, recording, templateId, providerId, modelId, folder }) {
  const tpl = templates.find(templateId) || { name: 'AI note' };
  const ts = new Date(recording.createdAt);
  const dateStamp = ts.toISOString().slice(0, 10); // YYYY-MM-DD
  const title = `${tpl.name} — ${dateStamp}`;
  // Header gives the user provenance; the AI's own output follows.
  const provenance = [
    `# ${title}`,
    '',
    `> Generated from recording on ${ts.toLocaleString()} via ${providerId}` +
      (modelId ? ` · ${modelId}` : '') + '.',
    '',
    markdown.trim(),
    '',
  ].join('\n');
  const targetFolder = folder || 'Inbox';
  const r = notes.createNote({ title, content: provenance, folder: targetFolder });
  return r.note;
}

module.exports = {
  listProviders,
  generateFromRecording,
  saveToNotes,
  makeRecordingPrompt,
};
