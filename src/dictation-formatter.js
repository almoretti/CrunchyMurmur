const groq = require('./providers/groq');
const anthropic = require('./providers/anthropic');

const SYSTEM_PROMPT = `You are a transcription formatter. Reformat raw voice-to-text for pasting into the application the user is typing in.

Rules:
- Never change the meaning or add information that was not spoken.
- Remove speech fillers and false starts.
- Format spoken lists as Markdown bullets using "- ".
- Clean punctuation and capitalization in prose.
- Leave short phrases and commands as plain text.
- Output only the formatted text, with no preamble.`;

// The user can override the formatter instructions in settings; an empty or
// whitespace-only value falls back to the built-in prompt.
function effectiveSystemPrompt(settings) {
  const custom = String(settings.aiFormatSystemPrompt || '').trim();
  return custom || SYSTEM_PROMPT;
}

async function format(text, settings) {
  const original = String(text || '').trim();
  if (!original || settings.aiFormatEnabled !== 'true') return original;
  const systemPrompt = effectiveSystemPrompt(settings);
  try {
    if (settings.groqApiKey) {
      return await groq.generate({
        apiKey: settings.groqApiKey,
        model: settings.groqFormatModel || 'llama-3.1-8b-instant',
        prompt: original,
        systemPrompt,
        maxTokens: 1024,
      });
    }
    if (settings.aiFormatFallback === 'anthropic' && settings.anthropicApiKey) {
      return await anthropic.generate({
        apiKey: settings.anthropicApiKey,
        model: 'claude-haiku-4-5',
        prompt: `${systemPrompt}\n\nRaw transcript:\n${original}`,
      });
    }
  } catch (error) {
    console.warn('[formatter] formatting failed; using raw transcript:', error.message);
  }
  return original;
}

module.exports = { format, effectiveSystemPrompt, SYSTEM_PROMPT };
