const MIN_DURATION_FOR_WPM = 1.5;

function wordCount(text) {
  return (String(text || '').match(/[\p{L}\p{N}]+/gu) || []).length;
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previousLocalDay(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - 1);
  return copy;
}

function computeDayStreak(entries, now = new Date()) {
  const activeDays = new Set(entries.map((entry) => localDayKey(entry.createdAt)).filter(Boolean));
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!activeDays.has(localDayKey(cursor))) cursor = previousLocalDay(cursor);
  let streak = 0;
  while (activeDays.has(localDayKey(cursor))) {
    streak += 1;
    cursor = previousLocalDay(cursor);
  }
  return streak;
}

function compute(entries, now = new Date()) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  let totalWords = 0;
  let timedWords = 0;
  let timedSeconds = 0;
  for (const entry of safeEntries) {
    const words = wordCount(entry?.text);
    totalWords += words;
    const seconds = Number(entry?.durationSec) || 0;
    if (words > 0 && seconds >= MIN_DURATION_FOR_WPM) {
      timedWords += words;
      timedSeconds += seconds;
    }
  }
  return {
    totalWords,
    wordsPerMinute: timedSeconds > 0 ? Math.round((timedWords / timedSeconds) * 60) : 0,
    dayStreak: computeDayStreak(safeEntries, now),
    recordingCount: safeEntries.length,
  };
}

function formatCompact(value) {
  const number = Number(value) || 0;
  if (number < 1_000) return String(number);
  if (number < 1_000_000) return `${(number / 1_000).toFixed(1)}K`;
  return `${(number / 1_000_000).toFixed(1)}M`;
}

module.exports = { MIN_DURATION_FOR_WPM, wordCount, computeDayStreak, compute, formatCompact };
