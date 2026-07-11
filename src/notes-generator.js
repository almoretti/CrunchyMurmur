const settings = require('./settings');
const templates = require('./templates');
const notes = require('./notes-store');
const anthropic = require('./providers/anthropic');
const openai = require('./providers/openai');
const claudeCode = require('./providers/claude-code');
const codex = require('./providers/codex');
const groq = require('./providers/groq');

const PROVIDERS = { anthropic, openai, claudeCode, codex, groq };
const CLI_PROVIDERS = {
  claudeCode: {
    module: claudeCode,
    modelKey: 'claudeCodeModel',
    effortKey: 'claudeCodeEffort',
    efforts: claudeCode.EFFORTS,
  },
  codex: {
    module: codex,
    modelKey: 'codexModel',
    effortKey: 'codexReasoningEffort',
    efforts: codex.REASONING_EFFORTS,
    resolveEffort: (modelId, effort) => codex.resolveReasoningEffort(modelId, effort),
  },
};

async function listProviders() {
  const cfg = settings.load();
  const [anthropicModels, openaiModels, groqModels] = await Promise.all([
    anthropic.listModels(cfg.anthropicApiKey),
    openai.listModels(cfg.openaiApiKey),
    groq.listModels(cfg.groqApiKey),
  ]);
  // The order here is also the order shown in the UI radio.
  const markBuiltIns = (models, fallback) => models === fallback
    ? models.map(model => ({ ...model, builtIn: true }))
    : models;
  return [
    { id: 'anthropic', displayName: 'Anthropic API', models: markBuiltIns(anthropicModels, anthropic.MODELS), defaultModel: anthropic.DEFAULT_MODEL, kind: 'http', controls: ['model'] },
    { id: 'openai', displayName: 'OpenAI API', models: markBuiltIns(openaiModels, openai.MODELS), defaultModel: openai.DEFAULT_MODEL, kind: 'http', controls: ['model'] },
    { id: 'groq', displayName: 'Groq API (free tier)', models: markBuiltIns(groqModels, groq.MODELS), defaultModel: groq.DEFAULT_MODEL, kind: 'http', controls: ['model'] },
    { id: 'claudeCode', displayName: 'Claude Code (your subscription)', kind: 'cli',
      available: claudeCode.isAvailable(), executable: claudeCode.executable(), controls: ['model', 'effort'], models: claudeCode.models(), defaultModel: '', efforts: claudeCode.EFFORTS },
    { id: 'codex',      displayName: 'Codex (your subscription)', kind: 'cli',
      available: codex.isAvailable(), executable: codex.executable(), controls: ['model', 'effort'], models: codex.models(), defaultModel: '', efforts: codex.REASONING_EFFORTS },
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

  // CLI providers use the installed subscription and accept optional model
  // and effort overrides. Empty model values preserve the CLI configuration.
  const cli = CLI_PROVIDERS[providerId];
  if (cli) {
    const modelId = model || cfg[cli.modelKey] || '';
    const requestedEffort = cfg[cli.effortKey] || 'medium';
    const effort = cli.resolveEffort ? cli.resolveEffort(modelId, requestedEffort) : requestedEffort;
    const text = await cli.module.generate({ prompt, model: modelId, effort });
    return { text, providerId, modelId: modelId || 'CLI default', templateId };
  }

  const apiKey = providerId === 'anthropic' ? cfg.anthropicApiKey
    : providerId === 'openai' ? cfg.openaiApiKey : cfg.groqApiKey;
  const configuredModel = providerId === 'anthropic' ? cfg.anthropicModel
    : providerId === 'openai' ? cfg.openaiModel : cfg.groqNotesModel;
  const modelId = model || configuredModel || mod.DEFAULT_MODEL;
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
