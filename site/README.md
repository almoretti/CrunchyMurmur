# CrunchyMurmur website

Static landing page for CrunchyMurmur, deployed to Railway with `/site` as the
configured service root.

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
- `i18n-catalog.js` + `generate-i18n.js` — landing-page localisation. The
  catalog maps every English phrase on `index.html` to the same 11 languages as
  the app UI (`ui/i18n.js`); the generator writes `/<lang>/index.html` pages,
  `sitemap.xml` (with `hreflang` alternates), and `robots.txt`. It runs on every
  `npm start` via the `prestart` hook, and it fails the build if the catalog and
  `index.html` drift apart, so edit them together. The generated output is
  gitignored. Dynamic strings that `app.js` injects (download button, release
  line, copy feedback) live in the `UI_STRINGS` table inside `app.js`.
- `assets/` — brand mark and screenshots copied from `assets/` and `docs/images/`.

`index.html` is the English source of truth. Its translatable strings are
replaced by exact match (`>phrase<` for element bodies, `"phrase"` for
attributes), so keep each translatable block on a single line.

## Local preview

```sh
node site/generate-i18n.js   # regenerate the localised pages
node site/server.js
# http://localhost:3000 (English), /it/, /es/, /pt/, /fr/, /de/, /da/, /no/, /sv/, /zh/, /ko/, /ja/
```

## Deploy

The site lives in its own Railway project (`crunchymurmur-site`, service
`crunchymurmur-site`), served at https://crunchymurmur.com/ (the Railway
service domain `crunchymurmur-site-production.up.railway.app` 301-redirects
there; `SITE_ORIGIN` in `generate-i18n.js` and the `hreflang`/canonical links
in `index.html` must all use the canonical domain)
and auto-deploys from GitHub `main` (root directory `/site`, watch paths
`/site/**`), so merging a PR that touches this folder is enough. Manual
override from `site/`:

```sh
railway up .. --path-as-root --detach --service crunchymurmur-site
```

The parent path and `--path-as-root` preserve the repository-level `/site`
prefix expected by the Railway service while retaining the project link stored
for this local `site/` directory.
