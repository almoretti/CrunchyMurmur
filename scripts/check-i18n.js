const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ui', 'i18n.js'), 'utf8');
const messagesSource = fs.readFileSync(path.join(root, 'ui', 'messages.js'), 'utf8');
const emptyList = () => [];
const document = {
  documentElement: {}, body: {},
  querySelectorAll: emptyList,
  createTreeWalker: () => ({ nextNode: () => false }),
};
const window = { dispatchEvent() {} };
const context = {
  window, document, navigator: { language: 'en' },
  NodeFilter: { SHOW_TEXT: 4 }, CustomEvent: function CustomEvent() {},
  MutationObserver: function MutationObserver() { return { observe() {} }; },
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
};
vm.runInNewContext(messagesSource, context);
vm.runInNewContext(source, context);

const expected = ['en', 'it', 'es', 'pt', 'fr', 'de', 'da', 'no', 'sv', 'zh', 'ko', 'ja'];
const { catalogs, supported } = window.i18n;
if (JSON.stringify(supported) !== JSON.stringify(expected)) throw new Error('Supported locale list changed unexpectedly.');
const englishKeys = Object.keys(catalogs.en).sort();
for (const locale of expected) {
  const keys = Object.keys(catalogs[locale] || {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(englishKeys)) throw new Error(`${locale} catalog is missing or has extra keys.`);
  for (const key of keys) if (!String(catalogs[locale][key]).trim()) throw new Error(`${locale} has an empty translation for "${key}".`);
}
const generated = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-i18n-catalog.js'), '--source-only'], { encoding: 'utf8' });
if (generated.status !== 0) throw new Error(generated.stderr || 'Could not extract renderer messages.');
const generatedWindow = {};
vm.runInNewContext(generated.stdout, { window: generatedWindow });
const extractedKeys = Object.keys(generatedWindow.__CRUNCHY_I18N_CATALOGS__.en).sort();
if (JSON.stringify(extractedKeys) !== JSON.stringify(Object.keys(window.__CRUNCHY_I18N_CATALOGS__.en).sort())) {
  const missing = extractedKeys.filter(key => !window.__CRUNCHY_I18N_CATALOGS__.en[key]);
  const stale = Object.keys(window.__CRUNCHY_I18N_CATALOGS__.en).filter(key => !generatedWindow.__CRUNCHY_I18N_CATALOGS__.en[key]);
  throw new Error(`Source catalog is stale. Missing: ${missing.join(' | ') || 'none'}. Stale: ${stale.join(' | ') || 'none'}.`);
}
for (const file of ['main.html', 'floating.html']) {
  const html = fs.readFileSync(path.join(root, 'ui', file), 'utf8');
  const messagesIndex = html.indexOf('<script src="messages.js"></script>');
  const i18nIndex = html.indexOf('<script src="i18n.js"></script>');
  const pageIndex = html.indexOf(`<script src="${file === 'main.html' ? 'main.js' : 'floating.js'}"></script>`);
  if (messagesIndex < 0 || i18nIndex < 0 || pageIndex < 0 || !(messagesIndex < i18nIndex && i18nIndex < pageIndex)) {
    throw new Error(`${file} must load messages.js, i18n.js, then its page script in that order.`);
  }
}
console.log(`i18n: ${englishKeys.length} renderer messages catalogued across ${expected.length} locales.`);
