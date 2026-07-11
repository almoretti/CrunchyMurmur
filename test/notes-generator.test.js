const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRecordingPrompt } = require('../src/notes-generator');

const template = { instructions: 'Summarise decisions and action items.' };

test('meeting AI prompt includes live notes as labelled context', () => {
  const prompt = makeRecordingPrompt({
    template,
    recording: {
      kind: 'meeting',
      text: '[YOU] Welcome.\n[OTHERS] Ship on Friday.',
      userNotes: '- Decision: Friday launch\n- Owner: Alex',
      createdAt: '2026-07-11T12:00:00.000Z',
      durationSec: 600,
      language: 'en',
    },
  });

  assert.match(prompt, /# User's live notes\n- Decision: Friday launch\n- Owner: Alex/);
  assert.match(prompt, /meeting transcript and may contain multiple speakers/);
  assert.doesNotMatch(prompt, /There are no other speakers/);
  assert.match(prompt, /# Transcript\n\[YOU\] Welcome/);
  assert.match(prompt, /Do not invent details that aren't in the supplied material/);
  assert.doesNotMatch(prompt, /aren't in the transcript/);
});

test('dictation AI prompt does not add a live-notes section', () => {
  const prompt = makeRecordingPrompt({
    template,
    recording: {
      text: 'A personal dictation.',
      createdAt: '2026-07-11T12:00:00.000Z',
      durationSec: 30,
      language: 'en',
    },
  });

  assert.doesNotMatch(prompt, /# User's live notes/);
  assert.match(prompt, /There are no other speakers/);
});
