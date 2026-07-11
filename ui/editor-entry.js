import {
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
} from '@muyajs/core';
import '@muyajs/core/lib/core.css';

Muya.use(InlineFormatToolbar);
Muya.use(LinkTools, {
  jumpClick(linkInfo) {
    const href = String(linkInfo?.href || '');
    if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  },
});
Muya.use(ParagraphFrontButton);
Muya.use(ParagraphFrontMenu);
Muya.use(ParagraphQuickInsertMenu);

function wordCount(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
}

function formatStats(text) {
  const words = wordCount(text);
  const characters = [...String(text)].length;
  const lines = String(text).length ? String(text).split('\n').length : 1;
  return `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${characters.toLocaleString()} characters · ${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`;
}

function mount(textarea, options = {}) {
  if (!textarea || textarea.__crunchyEditor) return textarea?.__crunchyEditor || null;

  const shell = document.createElement('div');
  shell.className = `text-editor-shell muya-editor-shell${options.compact ? ' compact' : ''}`;
  shell.dataset.editorEngine = 'muya';
  shell.innerHTML = '<div class="text-editor-surface"></div>';
  textarea.before(shell);
  textarea.hidden = true;
  textarea.setAttribute('aria-hidden', 'true');

  const surface = shell.querySelector('.text-editor-surface');
  const stats = options.stats ? document.querySelector(options.stats) : null;
  let suppressInput = false;
  const readMarkdown = () => muya.getMarkdown().replace(/\n$/, '');

  const updateMirror = (dispatchInput = true) => {
    const value = readMarkdown();
    textarea.value = value;
    if (stats) stats.textContent = formatStats(value);
    if (dispatchInput && !suppressInput) textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return value;
  };

  const muya = new Muya(surface, {
    markdown: textarea.value || '',
    disableHtml: true,
    footnote: false,
    frontMatter: false,
    math: false,
    superSubScript: false,
    codeBlockLineNumbers: false,
    spellcheckEnabled: options.spellcheck !== false,
    hideQuickInsertHint: false,
  });
  muya.init();
  muya.on('json-change', () => updateMirror(true));

  const api = {
    getValue: readMarkdown,
    setValue(value) {
      const next = String(value ?? '');
      if (next === readMarkdown()) return;
      suppressInput = true;
      muya.setContent(next);
      suppressInput = false;
      updateMirror(false);
    },
    hasFocus: () => shell.contains(document.activeElement),
    focus: () => muya.focus(),
    setMode() {
      // Muya is an always-live Markdown WYSIWYG surface; preview modes are obsolete.
    },
    destroy() {
      muya.destroy();
      shell.remove();
      textarea.hidden = false;
      textarea.removeAttribute('aria-hidden');
      delete textarea.__crunchyEditor;
    },
    muya,
    shell,
  };

  textarea.__crunchyEditor = api;
  updateMirror(false);
  return api;
}

window.CrunchyEditor = { mount, formatStats, wordCount };
