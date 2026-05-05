const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

// Curated subset of whisper.cpp ggml models on HuggingFace. Sizes are bytes
// of the .bin file as published on the LFS endpoint, used for the progress
// bar and disk-usage display. If HuggingFace ever republishes a different
// build the size will mismatch by a few %; that's cosmetic, the download
// still works.
const CATALOG = [
  {
    id: 'tiny.en',
    name: 'Tiny English',
    size: 77_700_000,
    language: 'English only',
    speed: 'Fastest',
    accuracy: 'Lowest',
  },
  {
    id: 'base',
    name: 'Base',
    size: 147_900_000,
    language: 'Multilingual',
    speed: 'Very fast',
    accuracy: 'Low',
  },
  {
    id: 'small',
    name: 'Small',
    size: 487_600_000,
    language: 'Multilingual',
    speed: 'Fast',
    accuracy: 'OK',
  },
  {
    id: 'medium',
    name: 'Medium',
    size: 1_530_000_000,
    language: 'Multilingual',
    speed: 'Slow',
    accuracy: 'Good',
  },
  {
    id: 'large-v3-turbo-q5_0',
    name: 'Large v3 Turbo (Q5)',
    size: 574_000_000,
    language: 'Multilingual',
    speed: 'Fast',
    accuracy: 'Excellent',
    recommended: true,
  },
  {
    id: 'large-v3-turbo',
    name: 'Large v3 Turbo',
    size: 1_620_000_000,
    language: 'Multilingual',
    speed: 'Medium',
    accuracy: 'Excellent',
  },
  {
    id: 'large-v3',
    name: 'Large v3',
    size: 3_100_000_000,
    language: 'Multilingual',
    speed: 'Slowest',
    accuracy: 'Best',
  },
];

function modelsDir() {
  const dir = path.join(app.getPath('userData'), 'Models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function modelFilePath(id) {
  return path.join(modelsDir(), `ggml-${id}.bin`);
}

function modelUrl(id) {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;
}

// Active downloads — one entry per model id while a download is in flight.
// Allows the renderer to cancel by id.
const active = new Map();

function isInstalled(id) {
  try {
    return fs.statSync(modelFilePath(id)).size > 0;
  } catch {
    return false;
  }
}

function listInstalled() {
  // Return both catalog entries that are present and any other ggml-*.bin the
  // user dropped in manually — so external downloads still show up in the UI.
  const dir = modelsDir();
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('ggml-') && f.endsWith('.bin'));
  const out = [];
  for (const f of files) {
    const id = f.slice('ggml-'.length, -'.bin'.length);
    const stat = fs.statSync(path.join(dir, f));
    const meta = CATALOG.find((m) => m.id === id);
    out.push({
      id,
      name: meta ? meta.name : id,
      bytes: stat.size,
      path: path.join(dir, f),
      external: !meta,
    });
  }
  return out;
}

function getCatalog() {
  return CATALOG.map((m) => ({
    ...m,
    installed: isInstalled(m.id),
    path: isInstalled(m.id) ? modelFilePath(m.id) : null,
  }));
}

function removeModel(id) {
  // Cancel an active download too (in case the user hits delete while the
  // download is running).
  cancelDownload(id);
  const p = modelFilePath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  const partial = p + '.partial';
  if (fs.existsSync(partial)) fs.unlinkSync(partial);
  return true;
}

function cancelDownload(id) {
  const a = active.get(id);
  if (!a) return false;
  a.canceled = true;
  try { a.req.destroy(); } catch {}
  return true;
}

/**
 * Stream-download a model. `onProgress({ id, bytesDone, bytesTotal })` fires
 * on every flush; ~throttled by stream chunk size, so don't try to drive a
 * 60-fps UI off it. Resolves when the file is fully written and renamed
 * into place; rejects on network error, HTTP error, or cancel.
 */
function downloadModel(id, onProgress) {
  return new Promise((resolve, reject) => {
    if (active.has(id)) {
      return reject(new Error('A download for this model is already in progress.'));
    }
    const meta = CATALOG.find((m) => m.id === id);
    if (!meta) return reject(new Error('Unknown model id: ' + id));

    const finalPath = modelFilePath(id);
    const partialPath = finalPath + '.partial';

    if (isInstalled(id)) {
      return resolve({ id, path: finalPath });
    }

    const fileStream = fs.createWriteStream(partialPath);
    let bytesDone = 0;
    let bytesTotal = meta.size; // updated from Content-Length when available

    const handleResponse = (res) => {
      // HuggingFace serves an HTTPS redirect to the LFS CDN. Follow once.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = https.get(res.headers.location, handleResponse);
        next.on('error', onError);
        const entry = active.get(id);
        if (entry) entry.req = next;
        return;
      }
      if (res.statusCode !== 200) {
        return onError(new Error(`HTTP ${res.statusCode} from HuggingFace`));
      }
      const total = Number(res.headers['content-length']);
      if (Number.isFinite(total) && total > 0) bytesTotal = total;

      res.on('data', (chunk) => {
        bytesDone += chunk.length;
        try { onProgress && onProgress({ id, bytesDone, bytesTotal }); } catch {}
      });
      res.on('error', onError);
      res.pipe(fileStream);
    };

    const onError = (err) => {
      if (!active.has(id)) return; // already cleaned up
      active.delete(id);
      try { fileStream.destroy(); } catch {}
      try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
      reject(err);
    };

    fileStream.on('finish', () => {
      const entry = active.get(id);
      if (!entry) return; // already errored / canceled
      active.delete(id);
      if (entry.canceled) {
        try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
        return reject(new Error('Download canceled'));
      }
      try {
        fs.renameSync(partialPath, finalPath);
      } catch (e) {
        return reject(e);
      }
      resolve({ id, path: finalPath });
    });
    fileStream.on('error', onError);

    const req = https.get(modelUrl(id), {
      headers: { 'User-Agent': 'CrunchyMurmur-Windows' },
    }, handleResponse);
    req.on('error', onError);

    active.set(id, { req, canceled: false });
  });
}

module.exports = {
  CATALOG,
  modelsDir,
  modelFilePath,
  isInstalled,
  listInstalled,
  getCatalog,
  removeModel,
  downloadModel,
  cancelDownload,
};
