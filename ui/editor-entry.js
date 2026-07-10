import { basicSetup, EditorView } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection } from '@codemirror/state';
import { placeholder } from '@codemirror/view';
import MarkdownIt from 'markdown-it';

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

const defaultLinkOpen = renderer.renderer.rules.link_open
  || ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noreferrer noopener');
  return defaultLinkOpen(tokens, index, options, env, self);
};

function editorTheme(dark) {
  return EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    fontSize: '14px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': { padding: '18px 22px', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': {
    display: 'none',
    backgroundColor: 'transparent',
    border: '0',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-activeLine': { backgroundColor: 'var(--surface-tint)' },
  '.cm-panels': {
    backgroundColor: 'var(--surface-raised)',
    color: 'var(--text)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--selection)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface-raised)',
    border: '1px solid var(--border)',
  },
  }, { dark });
}

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
  shell.className = `text-editor-shell${options.compact ? ' compact' : ''}`;
  shell.dataset.mode = options.defaultMode || 'write';
  shell.innerHTML = `
    <div class="text-editor-source" role="group"></div>
    <article class="text-editor-preview markdown-content" aria-label="Markdown preview"></article>
  `;
  textarea.before(shell);
  textarea.hidden = true;
  textarea.setAttribute('aria-hidden', 'true');

  const source = shell.querySelector('.text-editor-source');
  const preview = shell.querySelector('.text-editor-preview');
  const stats = options.stats ? document.querySelector(options.stats) : null;
  const toolbar = options.toolbar ? document.querySelector(options.toolbar) : null;
  const colourScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const colourTheme = new Compartment();
  let suppressInput = false;

  const refresh = (value) => {
    preview.innerHTML = renderer.render(value || '');
    preview.classList.toggle('empty', !value.trim());
    if (!value.trim()) preview.innerHTML = '<p>Nothing to preview yet.</p>';
    if (stats) stats.textContent = formatStats(value);
  };

  const view = new EditorView({
    doc: textarea.value || '',
    parent: source,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      colourTheme.of(editorTheme(colourScheme.matches)),
      placeholder(options.placeholder || textarea.placeholder || 'Start writing…'),
      EditorView.contentAttributes.of({
        'aria-label': options.label || textarea.getAttribute('aria-label') || 'Markdown editor',
        spellcheck: options.spellcheck === false ? 'false' : 'true',
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const value = update.state.doc.toString();
        textarea.value = value;
        refresh(value);
        if (!suppressInput) textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }),
      EditorView.domEventHandlers({
        keydown(event) {
          if (!(event.ctrlKey || event.metaKey)) return false;
          const action = {
            b: 'bold', i: 'italic', e: 'code', k: 'link',
            '1': 'h1', '2': 'h2', '3': 'h3',
          }[event.key.toLowerCase()];
          if (!action || (event.shiftKey && /^[123]$/.test(event.key))) return false;
          event.preventDefault();
          api.format(action);
          return true;
        },
      }),
    ],
  });
  const updateColourTheme = (event) => {
    view.dispatch({ effects: colourTheme.reconfigure(editorTheme(event.matches)) });
  };
  const updateSelectedColourTheme = (event) => {
    view.dispatch({ effects: colourTheme.reconfigure(editorTheme(Boolean(event.detail?.dark))) });
  };
  colourScheme.addEventListener('change', updateColourTheme);
  window.addEventListener('crunchy-theme-change', updateSelectedColourTheme);

  function replaceSelection(left, right, fallback) {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const content = selected || fallback;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: left + content + right },
      selection: EditorSelection.range(selection.from + left.length, selection.from + left.length + content.length),
      scrollIntoView: true,
    });
  }

  function prefixLines(prefix, numbered = false) {
    const selection = view.state.selection.main;
    const from = view.state.doc.lineAt(selection.from).from;
    const to = view.state.doc.lineAt(selection.to).to;
    const original = view.state.sliceDoc(from, to);
    const changed = original.split('\n').map((line, index) => `${numbered ? `${index + 1}. ` : prefix}${line}`).join('\n');
    view.dispatch({
      changes: { from, to, insert: changed },
      selection: EditorSelection.range(from, from + changed.length),
      scrollIntoView: true,
    });
  }

  const api = {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      const next = String(value ?? '');
      if (next === view.state.doc.toString()) return;
      suppressInput = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      suppressInput = false;
    },
    hasFocus: () => view.hasFocus,
    focus: () => view.focus(),
    setMode(mode) {
      if (!['write', 'split', 'preview'].includes(mode)) return;
      shell.dataset.mode = mode;
      toolbar?.querySelectorAll('[data-editor-mode]').forEach((button) => {
        const active = button.dataset.editorMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      refresh(view.state.doc.toString());
      requestAnimationFrame(() => view.requestMeasure());
    },
    format(action) {
      if (action === 'h1') prefixLines('# ');
      else if (action === 'h2') prefixLines('## ');
      else if (action === 'h3') prefixLines('### ');
      else if (action === 'bold') replaceSelection('**', '**', 'bold text');
      else if (action === 'italic') replaceSelection('*', '*', 'italic text');
      else if (action === 'strike') replaceSelection('~~', '~~', 'strikethrough');
      else if (action === 'code') replaceSelection('`', '`', 'code');
      else if (action === 'bullet') prefixLines('- ');
      else if (action === 'numbered') prefixLines('', true);
      else if (action === 'todo') prefixLines('- [ ] ');
      else if (action === 'quote') prefixLines('> ');
      else if (action === 'link') {
        const selection = view.state.selection.main;
        const selected = view.state.sliceDoc(selection.from, selection.to);
        const url = window.prompt('URL:', /^https?:\/\//i.test(selected) ? selected : 'https://');
        if (url) replaceSelection('[', `](${url})`, selected || 'link');
      } else if (action === 'hr') {
        const selection = view.state.selection.main;
        view.dispatch({ changes: { from: selection.from, to: selection.to, insert: '\n---\n' } });
      }
      view.focus();
    },
    destroy() {
      colourScheme.removeEventListener('change', updateColourTheme);
      window.removeEventListener('crunchy-theme-change', updateSelectedColourTheme);
      view.destroy();
      shell.remove();
      textarea.hidden = false;
      delete textarea.__crunchyEditor;
    },
    view,
    shell,
  };

  toolbar?.querySelectorAll('[data-editor-action]').forEach((button) => {
    button.addEventListener('click', () => api.format(button.dataset.editorAction));
  });
  toolbar?.querySelectorAll('[data-editor-mode]').forEach((button) => {
    button.addEventListener('click', () => api.setMode(button.dataset.editorMode));
  });

  textarea.__crunchyEditor = api;
  refresh(textarea.value || '');
  api.setMode(options.defaultMode || 'write');
  return api;
}

window.CrunchyEditor = { mount, formatStats, wordCount };
