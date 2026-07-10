const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../src/dictation-stats');

test('dictation stats calculate Unicode words, weighted WPM, and streak', () => {
  const entries = [
    { text: 'Hello, world!', durationSec: 2, createdAt: '2026-07-10T09:00:00' },
    { text: 'Ciao mondo ancora', durationSec: 3, createdAt: '2026-07-09T09:00:00' },
    { text: 'ignored WPM outlier', durationSec: 0.5, createdAt: '2026-07-08T09:00:00' },
  ];
  assert.deepEqual(stats.compute(entries, new Date('2026-07-10T12:00:00')), {
    totalWords: 8,
    wordsPerMinute: 60,
    dayStreak: 3,
    recordingCount: 3,
  });
});

test('streak may start yesterday when today has no activity', () => {
  const entries = [
    { text: 'one', durationSec: 2, createdAt: '2026-07-09T12:00:00' },
    { text: 'two', durationSec: 2, createdAt: '2026-07-08T12:00:00' },
  ];
  assert.equal(stats.compute(entries, new Date('2026-07-10T08:00:00')).dayStreak, 2);
});
