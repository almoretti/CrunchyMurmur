const fs = require('fs');
const path = require('path');
const https = require('https');
const ical = require('node-ical');
const { app } = require('electron');
const { atomicWriteFileSync } = require('./file-utils');
const macNative = require('./mac-native');

// Persistent on-disk feed list lives next to settings.json. Each feed has
// a stable id (so users can rename/delete), the URL, an optional label
// (defaulting to the calendar name from the feed), and a color used for
// the strip in front of each event in the UI.
function feedsPath() {
  return path.join(app.getPath('userData'), 'calendar-feeds.json');
}

function loadFeeds() {
  try {
    return JSON.parse(fs.readFileSync(feedsPath(), 'utf8'));
  } catch {
    return [];
  }
}

function writeFeeds(list) {
  atomicWriteFileSync(feedsPath(), JSON.stringify(list, null, 2), 'utf8');
}

function nextId() {
  return 'feed-' + Math.random().toString(36).slice(2, 10);
}

// In-memory cache of fetched events per feed, refreshed on demand.
const cache = new Map(); // feedId → { events, fetchedAt, error }

let nativeCache = { events: [], fetchedAt: null, error: null };

function normalizeFeedUrl(url) {
  const value = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Calendar feed URL is invalid.'); }
  if (parsed.protocol !== 'https:') throw new Error('Calendar feeds must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Calendar feed URLs cannot contain embedded credentials.');
  return parsed.toString();
}

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const finalUrl = normalizeFeedUrl(url);
    const req = https.get(finalUrl, { headers: { 'User-Agent': 'CrunchyMurmur' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('Too many calendar feed redirects.'));
        const nextUrl = new URL(res.headers.location, finalUrl).toString();
        return fetchText(nextUrl, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ICS feed`));
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes > 10 * 1024 * 1024) {
          req.destroy(new Error('Calendar feed exceeds the 10 MB limit.'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20_000, () => { req.destroy(new Error('Calendar feed timed out')); });
  });
}

function flattenEvents(parsed, windowStart, windowEnd) {
  const out = [];
  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (!item || item.type !== 'VEVENT') continue;
    if (item.rrule) {
      // Expand recurring events within the window.
      const dates = item.rrule.between(windowStart, windowEnd, true);
      const lengthMs = (item.end - item.start) || 30 * 60 * 1000;
      for (const d of dates) {
        // Honor cancelled overrides (item.recurrences map keyed by ISO date).
        const isoKey = d.toISOString().split('T')[0];
        if (item.exdate && item.exdate[isoKey]) continue;
        const override = item.recurrences && item.recurrences[isoKey];
        const start = override ? override.start : d;
        const end = override ? override.end : new Date(d.getTime() + lengthMs);
        out.push(toEvent(item, start, end, override));
      }
    } else {
      if (!item.start) continue;
      // Skip events outside the window; the next-fetch will refresh.
      const start = new Date(item.start);
      const end = item.end ? new Date(item.end) : new Date(start.getTime() + 30 * 60 * 1000);
      if (end < windowStart || start > windowEnd) continue;
      out.push(toEvent(item, start, end, item));
    }
  }
  out.sort((a, b) => new Date(a.start) - new Date(b.start));
  return out;
}

function toEvent(base, start, end, source) {
  return {
    uid: (source.uid || base.uid || '') + '-' + new Date(start).toISOString(),
    title: source.summary || base.summary || '(Untitled)',
    location: source.location || base.location || '',
    description: source.description || base.description || '',
    start: start.toISOString(),
    end: end.toISOString(),
    isAllDay: base.datetype === 'date',
  };
}

async function refresh(feedId) {
  const feeds = loadFeeds();
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) throw new Error('Unknown feed id: ' + feedId);
  try {
    const text = await fetchText(feed.url);
    const parsed = ical.sync.parseICS(text);
    // Two-day window — same as the Mac CalendarManager (now → +2 days).
    const start = new Date();
    const end = new Date(start.getTime() + 48 * 60 * 60 * 1000);
    const events = flattenEvents(parsed, start, end);
    cache.set(feedId, { events, fetchedAt: Date.now(), error: null });
    return { ok: true, count: events.length };
  } catch (err) {
    cache.set(feedId, {
      events: cache.get(feedId)?.events || [],
      fetchedAt: cache.get(feedId)?.fetchedAt || 0,
      error: err.message || String(err),
    });
    return { ok: false, error: err.message || String(err) };
  }
}

async function refreshAll() {
  const feeds = loadFeeds();
  const tasks = feeds.map((f) => refresh(f.id).catch((e) => ({ ok: false, error: e.message })));
  if (process.platform === 'darwin') {
    tasks.push(macNative.calendarEvents().then((events) => {
      nativeCache = { events, fetchedAt: Date.now(), error: null };
      return { ok: true, count: events.length, source: 'EventKit' };
    }).catch((error) => {
      nativeCache = { ...nativeCache, error: error.message };
      return { ok: false, error: error.message, source: 'EventKit' };
    }));
  }
  const results = await Promise.all(tasks);
  return results;
}

function snapshot() {
  const feeds = loadFeeds();
  const all = [];
  for (const f of feeds) {
    const c = cache.get(f.id);
    const events = (c && c.events ? c.events : []).map((e) => ({ ...e, feedId: f.id, color: f.color || '#0a84ff' }));
    all.push(...events);
  }
  all.push(...nativeCache.events);
  // De-duplicate by uid (some feeds export the same event multiple times).
  const seen = new Set();
  const dedup = [];
  for (const e of all) {
    const k = e.uid + '|' + e.start;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(e);
  }
  dedup.sort((a, b) => new Date(a.start) - new Date(b.start));
  return {
    feeds: feeds.map((f) => ({
      ...f,
      lastError: cache.get(f.id)?.error || null,
      lastFetchedAt: cache.get(f.id)?.fetchedAt || null,
    })),
    events: dedup,
    nativeCalendar: process.platform === 'darwin'
      ? { available: true, lastError: nativeCache.error, lastFetchedAt: nativeCache.fetchedAt }
      : { available: false },
  };
}

function addFeed({ url, label, color }) {
  const feeds = loadFeeds();
  const id = nextId();
  feeds.push({ id, url: normalizeFeedUrl(url), label: (label || '').trim().slice(0, 200), color: color || '#0a84ff' });
  writeFeeds(feeds);
  return id;
}

function updateFeed({ id, url, label, color }) {
  const feeds = loadFeeds();
  const i = feeds.findIndex((f) => f.id === id);
  if (i === -1) throw new Error('Unknown feed: ' + id);
  if (url !== undefined)   feeds[i].url = normalizeFeedUrl(url);
  if (label !== undefined) feeds[i].label = (label || '').trim();
  if (color !== undefined) feeds[i].color = color || '#0a84ff';
  writeFeeds(feeds);
  cache.delete(id); // invalidate so next refresh re-fetches with new URL
}

function removeFeed(id) {
  const feeds = loadFeeds().filter((f) => f.id !== id);
  writeFeeds(feeds);
  cache.delete(id);
}

module.exports = {
  loadFeeds,
  addFeed,
  updateFeed,
  removeFeed,
  refresh,
  refreshAll,
  snapshot,
};
