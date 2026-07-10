const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWriteFileSync(filename, data, encoding) {
  const dir = path.dirname(filename);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(filename)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, data, encoding);
    fs.renameSync(temp, filename);
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
  }
}

function safePathSegment(value, label = 'Path component') {
  if (typeof value !== 'string' || !value || value === '.' || value === '..') {
    throw new Error(`${label} is invalid.`);
  }
  if (value.includes('\0') || path.basename(value) !== value || /[\\/]/.test(value)) {
    throw new Error(`${label} must be a single path component.`);
  }
  return value;
}

function safeChildPath(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const clean = segments.map((segment) => safePathSegment(segment));
  const candidate = path.resolve(resolvedRoot, ...clean);
  const relative = path.relative(resolvedRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes the permitted root.');
  }
  return candidate;
}

module.exports = { atomicWriteFileSync, safePathSegment, safeChildPath };
