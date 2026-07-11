/* Developer tool: prints a generated locale catalog to stdout; it never edits files. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
const htmlFiles = ['main.html', 'floating.html'].map(name => path.join(root, 'ui', name));
const jsFiles = ['main.js', 'floating.js'].map(name => path.join(root, 'ui', name));
const messages = new Set();
const add = value => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (/[A-Za-z]{2}/.test(clean) && !/^(https?:|[.#]|[a-z]+[-_:][a-z])/i.test(clean)) messages.add(clean);
};
for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/>([^<>]+)</g)) add(match[1]);
  for (const match of source.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) add(match[1]);
}
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const templateValue = node => node.quasis.map((part, index) => part.value.cooked + (index < node.expressions.length ? `{${index}}` : '')).join('');
  const addHtml = value => {
    for (const match of value.matchAll(/>([^<>]+)</g)) add(match[1]);
    for (const match of value.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) add(match[1]);
  };
  const collectValue = (node, html = false) => {
    if (!node) return;
    if (node.type === 'Literal' && typeof node.value === 'string') (html ? addHtml : add)(node.value);
    else if (node.type === 'TemplateLiteral') (html ? addHtml : add)(templateValue(node));
    else if (node.type === 'ConditionalExpression') { collectValue(node.consequent, html); collectValue(node.alternate, html); }
    else if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression') { collectValue(node.left, html); collectValue(node.right, html); }
  };
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression') {
      const property = node.left.computed ? node.left.property?.value : node.left.property?.name;
      if (property === 'textContent') collectValue(node.right);
      if (property === 'innerHTML') collectValue(node.right, true);
    }
    if (node.type === 'Property') {
      const key = node.computed ? node.key?.value : (node.key?.name || node.key?.value);
      if (key === 'placeholder') collectValue(node.value);
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && ['alert', 'confirm', 'prompt'].includes(node.callee.name)) collectValue(node.arguments[0]);
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const property = node.callee.computed ? node.callee.property?.value : node.callee.property?.name;
      if (property === 't') collectValue(node.arguments[0]);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
    }
  };
  visit(ast);
}

const locales = ['it', 'es', 'pt', 'fr', 'de', 'da', 'no', 'sv', 'zh', 'ko', 'ja'];
const english = [...messages].sort((a, b) => a.localeCompare(b));
const catalogs = { en: Object.fromEntries(english.map(message => [message, message])) };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function translateBatch(batch, locale) {
  const target = locale === 'no' ? 'nb' : locale;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch('https://translate.fedilab.app/translate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: batch, source: 'en', target, format: 'text' }),
    });
    if (response.ok) {
      const data = await response.json();
      const parts = Array.isArray(data.translatedText) ? data.translatedText : [data.translatedText];
      if (parts.length === batch.length) return parts.map(value => value.trim());
    }
    await delay(Math.min(30_000, 5_000 * (attempt + 1)));
  }
  // Fall back to individual requests if an instance does not support arrays.
  const translated = [];
  for (const message of batch) {
    const response = await fetch('https://translate.fedilab.app/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: message, source: 'en', target, format: 'text' }) });
    if (!response.ok) throw new Error(`Translation failed for ${locale}: ${response.status}`);
    const data = await response.json();
    translated.push(String(data.translatedText).trim());
    await delay(150);
  }
  return translated;
}

(async () => {
  for (const locale of (process.argv.includes('--source-only') ? [] : locales)) {
    try {
      const values = [];
      for (let index = 0; index < english.length; index += 80) {
        values.push(...await translateBatch(english.slice(index, index + 80), locale));
        await delay(2500);
      }
      catalogs[locale] = Object.fromEntries(english.map((message, index) => [message, values[index]]));
      process.stderr.write(`${locale}: ${values.length}\n`);
    } catch (error) {
      process.stderr.write(`${locale}: skipped (${error.message})\n`);
    }
  }
  const generated = `/* Generated by scripts/generate-i18n-catalog.js. */\nwindow.__CRUNCHY_I18N_CATALOGS__ = ${JSON.stringify(catalogs, null, 2)};\n`;
  if (process.argv.includes('--base64')) process.stdout.write(`CATALOG_BASE64:${zlib.gzipSync(generated).toString('base64')}`);
  else process.stdout.write(generated);
})().catch(error => { console.error(error); process.exit(1); });
