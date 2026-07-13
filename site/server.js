// Minimal zero-dependency static file server for the CrunchyMurmur landing page.
// Used by the Railway deployment (npm start); any static host works equally well.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const CANONICAL_HOST = 'crunchymurmur.com';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const urlPath = decodeURIComponent(url.pathname);

  // The Railway service domain stays reachable but permanently redirects to the
  // canonical custom domain so search engines consolidate on one origin.
  const host = String(req.headers.host || '').toLowerCase();
  if (host.endsWith('.up.railway.app')) {
    res.writeHead(301, { Location: `https://${CANONICAL_HOST}${url.pathname}${url.search}` });
    return res.end();
  }

  let filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // Extensionless page routes: /docs -> docs.html
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    // HTML references app.js/styles.css without cache-busting hashes, so scripts
    // and styles must revalidate on every load — a long-lived cached app.js kept
    // running against newer markup after deploys (e.g. the language picker
    // shipped with no listener attached). Only images stay cacheable.
    const longLived = ['.svg', '.png', '.ico'].includes(ext);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': longLived ? 'public, max-age=3600' : 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CrunchyMurmur site listening on port ${PORT}`);
});
