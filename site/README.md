# CrunchyMurmur website

Static landing page for CrunchyMurmur, deployed to Railway from this subfolder
(`railway up` is run inside `site/`, so only this directory is the build context).

Before changing anything here, read the **Website** section of the repository
[AGENTS.md](../AGENTS.md): the page is deliberately coupled to the GitHub
repository name, the release artifact naming pattern, the terminal installer
scripts, and `docs/platform-support.md`.

## Files

- `index.html` — the whole page (hero, terminal installer, features, platform table, downloads).
- `styles.css` — light theme; the design tokens mirror the `:root` light palette in `ui/main.css`.
- `app.js` — OS detection, terminal-tab/copy behavior, and live sync of every
  download link with the latest GitHub release via the public API. Without
  JavaScript (or before the first release exists) all links fall back to the
  GitHub Releases page.
- `docs.html` + `docs.js` — hosted documentation viewer at `/docs`. Fetches the
  Markdown under `docs/` from raw.githubusercontent.com (branch `main`) at page
  load and renders it client-side, so GitHub stays the single source of truth.
  The `DOCS` manifest in `docs.js` must mirror the files under `docs/`.
- `vendor/markdown-it.min.js` — Markdown renderer, vendored from the repository's
  `node_modules` (no CDN dependency).
- `server.js` + `package.json` — zero-dependency static server so Railway's Node
  builder can run `npm start` (serves `/docs` as `docs.html`).
- `assets/` — brand mark and screenshots copied from `assets/` and `docs/images/`.

## Local preview

```sh
node site/server.js
# http://localhost:3000
```

## Deploy

The site lives in its own Railway project (`crunchymurmur-site`, service
`crunchymurmur-site`, domain `crunchymurmur-site-production.up.railway.app`).
From `site/`:

```sh
railway up --detach --service crunchymurmur-site
```
