// Generates the localised landing pages (/it/, /es/, ...), sitemap.xml, and robots.txt
// from index.html and i18n-catalog.js. Runs automatically via the package.json
// prestart hook, so every deploy regenerates the pages; run manually for local dev.
//
// index.html stays the English source of truth. Each PHRASES key must match the
// exact inner HTML of one element (replaced as >key<); each ATTRIBUTES key must
// match an exact attribute value (replaced as "key"). The generator fails the
// build if a catalog entry no longer matches index.html, so the catalog cannot
// silently drift out of date.

const fs = require('fs');
const path = require('path');
const { LANGUAGES, PHRASES, ATTRIBUTES } = require('./i18n-catalog');

const SITE_ORIGIN = 'https://crunchymurmur.com';
const ROOT = __dirname;

const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Validate the catalog against the source page. ---
const problems = [];
for (const [key, values] of Object.entries(PHRASES)) {
  if (values.length !== LANGUAGES.length) problems.push(`PHRASES ${JSON.stringify(key.slice(0, 60))} has ${values.length} translations, expected ${LANGUAGES.length}.`);
  if (!source.includes(`>${key}<`)) problems.push(`PHRASES key not found in index.html as an element body: ${JSON.stringify(key.slice(0, 80))}`);
}
for (const [key, values] of Object.entries(ATTRIBUTES)) {
  if (values.length !== LANGUAGES.length) problems.push(`ATTRIBUTES ${JSON.stringify(key.slice(0, 60))} has ${values.length} translations, expected ${LANGUAGES.length}.`);
  if (!source.includes(`"${key}"`)) problems.push(`ATTRIBUTES key not found in index.html as an attribute value: ${JSON.stringify(key.slice(0, 80))}`);
}
if (problems.length) {
  console.error(`i18n catalog is out of sync with index.html:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// Longest keys first so no phrase can match inside a longer one.
const phraseKeys = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
const attributeKeys = Object.keys(ATTRIBUTES).sort((a, b) => b.length - a.length);

for (const [index, language] of LANGUAGES.entries()) {
  let page = source;
  page = page.replace('<html lang="en">', `<html lang="${language.code}">`);
  page = page.replace(`<link rel="canonical" href="${SITE_ORIGIN}/">`, `<link rel="canonical" href="${SITE_ORIGIN}/${language.code}/">`);
  page = page.replace('<option value="/" selected>', '<option value="/">');
  page = page.replace(`<option value="/${language.code}/"`, `<option value="/${language.code}/" selected`);
  for (const key of phraseKeys) page = page.replaceAll(`>${key}<`, `>${PHRASES[key][index]}<`);
  for (const key of attributeKeys) page = page.replaceAll(`"${key}"`, `"${ATTRIBUTES[key][index]}"`);
  const directory = path.join(ROOT, language.code);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), page);
}

// --- sitemap.xml with hreflang alternates for every page. ---
const urls = [{ code: 'en', loc: `${SITE_ORIGIN}/` }, ...LANGUAGES.map((l) => ({ code: l.code, loc: `${SITE_ORIGIN}/${l.code}/` }))];
const alternates = [
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/"/>`,
  ...urls.map((u) => `    <xhtml:link rel="alternate" hreflang="${u.code}" href="${u.loc}"/>`),
].join('\n');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n${alternates}\n  </url>`),
  '</urlset>',
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);

console.log(`Generated ${LANGUAGES.length} localised pages, sitemap.xml, and robots.txt.`);
