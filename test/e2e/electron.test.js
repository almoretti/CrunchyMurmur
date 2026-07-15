const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('@playwright/test');

test('desktop shell opens and exposes stable settings controls', { timeout: 30_000 }, async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-e2e-'));
  const notesDir = path.join(userData, 'notes');
  fs.mkdirSync(path.join(notesDir, 'Inbox'), { recursive: true });
  fs.mkdirSync(path.join(notesDir, 'Meetings'), { recursive: true });
  const noteFixtures = [
    ['Inbox', 'launch-plan.md', '# Launch plan\n\nA focused checklist for the first public release.\n\n## This week\n\n- Finish platform smoke tests\n- Verify signed release assets\n- Publish the getting-started guide\n\n## Decision\n\nShip through GitHub Releases first, with website downloads pointing to the verified artifacts.'],
    ['Inbox', 'voice-workflow.md', '# Voice workflow ideas\n\nCapture thoughts without leaving the current app.\n\n- Hold the shortcut while speaking\n- Release to transcribe\n- Keep the original meaning when formatting'],
    ['Inbox', 'weekly-review.md', '# Weekly review\n\n## Wins\n\n- Cross-platform builds are green\n- Notes editing feels calm and focused'],
    ['Meetings', 'product-sync.md', '# Product sync · 11 July\n\n> Recorded locally and turned into structured notes.\n\n## TL;DR\n\nThe team agreed to keep the first release simple: private dictation, dependable transcription, and a polished Markdown notes workflow.\n\n## Key points\n\n- GitHub Releases remains the source of truth\n- Windows, macOS, and Linux stay at feature parity\n- Documentation should lead with the real workflow\n\n## Action items\n\n- [x] Validate the release pipeline\n- [ ] Capture product screenshots\n- [ ] Publish the launch page'],
    ['Meetings', 'research-notes.md', '# Research notes\n\nLocal-first tools earn trust by making data flow visible and optional cloud features explicit.'],
  ];
  noteFixtures.forEach(([folder, filename, content], index) => {
    const file = path.join(notesDir, folder, filename);
    fs.writeFileSync(file, content);
    const modified = new Date(Date.now() - index * 60_000);
    fs.utimesSync(file, modified, modified);
  });
  const historyFixtureTime = new Date();
  historyFixtureTime.setHours(12, 0, 0, 0);
  fs.writeFileSync(path.join(userData, 'history.json'), JSON.stringify(Array.from({ length: 120 }, (_, index) => ({
    id: `fixture-${index}`,
    text: `Recording ${index + 1}: this transcript preview must remain readable even when the history contains many entries. `.repeat(4),
    language: 'en',
    durationSec: 8,
    createdAt: new Date(historyFixtureTime.getTime() - index * 60_000).toISOString(),
  }))));
  let electronApp;
  t.after(async () => {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  });

  electronApp = await electron.launch({
    args: [path.resolve(__dirname, '..', '..'), `--user-data-dir=${userData}`, '--show'],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      CRUNCHYMURMUR_E2E: '1',
      CRUNCHYMURMUR_E2E_NOTES_DIR: notesDir,
    },
  });

  const deadline = Date.now() + 20_000;
  let page;
  while (!page && Date.now() < deadline) {
    page = electronApp.windows().find((candidate) => candidate.url().endsWith('/ui/main.html'));
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'main application window did not open');
  await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.title(), 'CrunchyMurmur');
  const titlebarMark = await page.locator('.titlebar-mark').evaluate((mark) => ({
    tag: mark.tagName,
    source: mark.getAttribute('src'),
    loaded: mark.complete && mark.naturalWidth > 0,
    text: mark.textContent,
  }));
  assert.deepEqual(titlebarMark, { tag: 'IMG', source: '../assets/brand-mark.svg', loaded: true, text: '' });
  const menuLabels = await electronApp.evaluate(({ Menu }) => (
    Menu.getApplicationMenu()?.items.map((item) => item.label) || []
  ));
  for (const label of ['File', 'Edit', 'View', 'Window', 'Help']) assert.ok(menuLabels.includes(label), `${label} menu is missing`);
  if (process.platform !== 'darwin') {
    const visibleMenus = await page.locator('.titlebar-menu button').allTextContents();
    assert.deepEqual(visibleMenus, ['File', 'Edit', 'View', 'Help']);
    const divider = await page.locator('.app-workspace').evaluate((workspace) => {
      const rect = workspace.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth, border: getComputedStyle(workspace).borderTopWidth };
    });
    assert.deepEqual(divider, { left: 0, right: divider.viewport, viewport: divider.viewport, border: '1px' });
  } else {
    const titlebarInset = await page.locator('.app-titlebar').evaluate((titlebar) => getComputedStyle(titlebar).paddingLeft);
    assert.equal(titlebarInset, '78px', 'the titlebar brand must clear the traffic-light controls');
  }
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');

  // Navigation labels must retain their semantic source when switching away
  // from a locale where templates and models share the same translated word.
  const restoredNavigationLabels = await page.evaluate(() => {
    window.i18n.setLocale('it');
    window.i18n.setLocale('en');
    return {
      templates: document.querySelector('[data-tab="templates"]').textContent.trim(),
      models: document.getElementById('engineModels').textContent.trim(),
    };
  });
  assert.deepEqual(restoredNavigationLabels, { templates: 'Templates', models: 'Local models' });

  const engineNav = page.locator('.nav-item[data-tab="engine"]');
  assert.equal(await page.locator('#engineSubmenu').count(), 0);
  assert.equal(await page.locator('.sidebar [data-tab="models"]').count(), 0);
  await engineNav.click();
  assert.equal(await page.locator('#engineModels').isVisible(), true);
  assert.equal(await engineNav.evaluate((button) => button.classList.contains('active')), true);
  const modelQualities = await page.locator('.model-card .meta').allTextContents();
  assert.ok(modelQualities.some((text) => text.includes('Speed: Fastest') && text.includes('Accuracy: Lowest')));
  assert.ok(modelQualities.some((text) => text.includes('Speed: Fast') && text.includes('Accuracy: Excellent')));
  assert.ok(new Set(modelQualities).size > 1, 'every Whisper model presents the same speed and accuracy');
  assert.equal(modelQualities.some((text) => /\{\d+\}/.test(text)), false, 'model ratings expose localisation placeholders');
  const italianEngineLabels = await page.evaluate(() => {
    window.i18n.setLocale('it');
    const labels = [
      document.getElementById('engineTranscription').textContent.trim(),
      document.getElementById('engineModels').textContent.trim(),
      document.getElementById('engineAiNotes').textContent.trim(),
    ];
    window.i18n.setLocale('en');
    return labels;
  });
  assert.deepEqual(italianEngineLabels, ['Trascrizione', 'Modelli locali', 'Note IA']);

  const applicationDensity = await page.evaluate(() => ({
    bodyFontSize: getComputedStyle(document.body).fontSize,
    sidebarWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
  }));
  assert.equal(applicationDensity.bodyFontSize, '13px', 'the editor stylesheet changed application typography');
  assert.equal(applicationDensity.sidebarWidth, 212, 'the editor stylesheet changed application layout density');

  await page.locator('[data-tab="general"]').click();
  assert.equal(await page.locator('input[name="theme"]').count(), 3);
  assert.equal(await page.locator('input[name="theme"][value="system"]').isChecked(), true);
  await page.locator('input[name="theme"][value="light"] + span').click();
  await page.waitForFunction(() => document.documentElement.dataset.effectiveTheme === 'light');
  const lightPalette = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    titlebar: getComputedStyle(document.querySelector('.app-titlebar')).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
  }));
  assert.deepEqual(lightPalette, {
    background: 'rgb(250, 248, 243)',
    text: 'rgb(36, 51, 45)',
    titlebar: 'rgb(242, 235, 221)',
    sidebar: 'rgb(242, 235, 221)',
  });
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_LIGHT) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_LIGHT) });
  }
  assert.equal(await electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'light');

  await page.locator('input[name="theme"][value="dark"] + span').click();
  await page.waitForFunction(() => document.documentElement.dataset.effectiveTheme === 'dark');
  const darkPalette = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    titlebar: getComputedStyle(document.querySelector('.app-titlebar')).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
  }));
  assert.deepEqual(darkPalette, {
    background: 'rgb(16, 24, 21)',
    text: 'rgb(246, 241, 232)',
    titlebar: 'rgb(21, 32, 28)',
    sidebar: 'rgb(21, 32, 28)',
  });
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_DARK) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_DARK) });
  }
  assert.equal(await electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark');
  await page.locator('input[name="theme"][value="system"] + span').click();
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === 'system');
  assert.equal(await electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'system');

  // All editable Markdown surfaces use the same WYSIWYG editor, preserve
  // Markdown as their public value, and never activate raw HTML.
  await page.locator('[data-tab="templates"]').click();
  await page.locator('#templateEditor:not(.hidden) .text-editor-surface [contenteditable="true"]').first().waitFor({ state: 'visible' });
  const editorRegression = await page.evaluate(() => {
    const textarea = document.getElementById('templateInstructions');
    const editor = textarea.__crunchyEditor;
    const original = editor.getValue();
    window.editorXss = false;
    editor.setValue('# Agenda\n\n**Decision**\n\n<script>window.editorXss = true</script>\n\n<img src="x" onerror="window.editorXss = true">\n\n[unsafe](javascript:window.editorXss=true)');
    const heading = editor.shell.querySelector('h1')?.textContent;
    const strong = editor.shell.querySelector('strong')?.textContent;
    const scriptCount = editor.shell.querySelectorAll('script').length;
    const imageCount = editor.shell.querySelectorAll('img').length;
    const unsafeHref = editor.shell.querySelector('a')?.getAttribute('href') || '';
    const xssExecuted = window.editorXss;
    const contenteditable = editor.shell.querySelector('[contenteditable="true"]')?.getAttribute('contenteditable');
    const markdown = editor.getValue();
    const stats = document.getElementById('templateEditorStats').textContent;
    const editorFontSize = getComputedStyle(editor.shell.querySelector('.mu-editor')).fontSize;
    editor.setValue(original);
    return {
      heading, strong, scriptCount, imageCount, unsafeHref, xssExecuted,
      contenteditable, markdown, stats, editorFontSize,
      mountedEditors: document.querySelectorAll('.text-editor-shell').length,
      legacyModeButtons: document.querySelectorAll('[data-editor-mode]').length,
    };
  });
  assert.match(editorRegression.heading, /Agenda$/);
  assert.equal(editorRegression.strong, 'Decision');
  assert.equal(editorRegression.contenteditable, 'true');
  assert.equal(editorRegression.scriptCount, 0, 'Markdown editor rendered executable HTML');
  assert.equal(editorRegression.imageCount, 0, 'Markdown editor rendered a raw HTML event-handler vector');
  assert.doesNotMatch(editorRegression.unsafeHref, /^javascript:/i, 'Markdown editor retained a javascript URL');
  assert.equal(editorRegression.xssExecuted, false, 'Markdown editor executed an XSS payload');
  assert.equal(editorRegression.editorFontSize, '13px', 'the editor ignored CrunchyMurmur typography');
  assert.match(editorRegression.markdown, /<script>window\.editorXss = true<\/script>/);
  assert.match(editorRegression.stats, /words · .*characters · .*lines/);
  assert.equal(editorRegression.mountedEditors, 3, 'not every editable Markdown surface uses the shared editor');
  assert.equal(editorRegression.legacyModeButtons, 0, 'obsolete source/preview controls remain visible');
  const liveNotesEditor = await page.locator('#meetingUserNotes').evaluate((textarea) => {
    const shell = textarea.__crunchyEditor.shell;
    const container = shell.querySelector('.mu-container');
    return {
      engine: shell.dataset.editorEngine,
      compact: shell.classList.contains('compact'),
      height: Number.parseFloat(getComputedStyle(shell).height),
      padding: getComputedStyle(container).padding,
    };
  });
  assert.equal(liveNotesEditor.engine, 'muya');
  assert.equal(liveNotesEditor.compact, false, 'live meeting notes use the reduced compact editor');
  assert.ok(liveNotesEditor.height >= 240, `live meeting notes editor is only ${liveNotesEditor.height}px tall`);
  assert.equal(liveNotesEditor.padding, '24px 32px 72px', 'live meeting notes do not use the full Notes canvas');
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_EDITOR) {
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_EDITOR) });
  }

  await page.locator('[data-tab="dashboard"]').click();
  assert.ok(Number((await page.locator('#statTotalWords').textContent()).replace(/[^0-9.]/g, '')) > 0);
  assert.ok(Number(await page.locator('#statWpm').textContent()) > 0);
  assert.equal(await page.locator('#statStreak').textContent(), '1');
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_DASHBOARD) {
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_DASHBOARD) });
  }
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_HERO) {
    const overlay = await page.evaluate(() => new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.id = 'screenshotDictationOverlay';
      frame.src = './floating.html';
      Object.assign(frame.style, {
        position: 'fixed', left: '50%', bottom: '30px', width: '300px', height: '60px',
        transform: 'translateX(-50%)', border: '0', background: 'transparent', zIndex: '9999',
      });
      frame.addEventListener('load', () => {
        const doc = frame.contentDocument;
        doc.body.className = 'state-recording';
        doc.getElementById('label').textContent = 'Recording';
        doc.getElementById('timer').textContent = '0:18';
        [...doc.querySelectorAll('.waveform span')].forEach((bar, index) => {
          bar.style.height = `${[8, 15, 21, 12, 18, 23, 14, 19, 9][index]}px`;
          bar.style.opacity = '0.85';
        });
        resolve(true);
      }, { once: true });
      document.body.appendChild(frame);
    }));
    assert.equal(overlay, true);
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_HERO) });
    await page.locator('#screenshotDictationOverlay').evaluate((frame) => frame.remove());
  }

  if (process.env.CRUNCHYMURMUR_SCREENSHOT_NOTES || process.env.CRUNCHYMURMUR_SCREENSHOT_NOTE_EDITOR) {
    await page.locator('[data-tab="notes"]').click();
    await page.locator('#noteEditor:not(.hidden)').waitFor({ state: 'visible' });
    if (process.env.CRUNCHYMURMUR_SCREENSHOT_NOTES) {
      await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_NOTES) });
    }
    if (process.env.CRUNCHYMURMUR_SCREENSHOT_NOTE_EDITOR) {
      await page.locator('#foldersList li').filter({ hasText: 'Meetings' }).click();
      await page.locator('#noteTitle').waitFor({ state: 'visible' });
      await page.locator('.notes-editor-pane').screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_NOTE_EDITOR) });
    }
  }
  await page.locator('[data-tab="history"]').click();
  await page.locator('.entry').first().waitFor({ state: 'attached' });
  const recordingLayout = await page.locator('.entry').first().evaluate((entry) => ({
    cardHeight: entry.getBoundingClientRect().height,
    textHeight: entry.querySelector('.text').getBoundingClientRect().height,
    textVisible: getComputedStyle(entry.querySelector('.text')).color !== 'rgba(0, 0, 0, 0)',
  }));
  assert.ok(recordingLayout.cardHeight >= 90, `recording card was compressed to ${recordingLayout.cardHeight}px`);
  assert.ok(recordingLayout.textHeight >= 40, `recording transcript was clipped to ${recordingLayout.textHeight}px`);
  assert.equal(recordingLayout.textVisible, true);
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_RECORDINGS) {
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_RECORDINGS) });
  }
  await page.locator('[data-tab="general"]').click();
  await electronApp.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/ui/main.html'));
    main?.setSize(900, 590);
  });
  await page.locator('#hotkey').waitFor({ state: 'attached' });
  const expectedDefault = process.platform === 'win32' ? 'Control+Super' : process.platform === 'darwin' ? 'Fn' : 'CommandOrControl+Shift+Space';
  assert.equal(await page.locator('#hotkey').inputValue(), expectedDefault);
  if (process.env.CRUNCHYMURMUR_SCREENSHOT) {
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT) });
  }
  await page.locator('#recordHotkey').click();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Control', code: 'ControlLeft', ctrlKey: true, bubbles: true, cancelable: true,
  })));
  assert.match(await page.locator('#hotkeyDisplay').innerText(), /Ctrl/, 'held modifier is not shown while recording a shortcut');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'k', code: 'KeyK', bubbles: true, cancelable: true,
  })));
  assert.match(await page.locator('#hotkeyDisplay').innerText(), /K/, 'incomplete key is not shown while recording a shortcut');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'k', code: 'KeyK', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
  })));
  assert.equal(await page.locator('#hotkey').inputValue(), 'Control+Alt+K');
  const displayedAlt = process.platform === 'darwin' ? 'Option' : 'Alt';
  assert.match(await page.locator('#hotkeyDisplay').innerText(), new RegExp(`Ctrl.*${displayedAlt}.*K`));
  await page.evaluate(() => {
    document.getElementById('updateStatus').textContent = `Unavailable: ${'long-status-token-'.repeat(40)}`;
  });
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#tab-general .card')];
    const status = document.getElementById('updateStatus').getBoundingClientRect();
    const statusCard = document.getElementById('updateStatus').closest('.card').getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      tabFits: document.getElementById('tab-general').scrollWidth <= document.getElementById('tab-general').clientWidth,
      cardWidths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
      statusContained: status.left >= statusCard.left && status.right <= statusCard.right,
    };
  });
  assert.equal(layout.documentFits, true, 'window has horizontal overflow');
  assert.equal(layout.tabFits, true, 'General tab has horizontal overflow');
  assert.equal(Math.max(...layout.cardWidths) - Math.min(...layout.cardWidths), 0, 'General cards have inconsistent widths');
  assert.equal(layout.statusContained, true, 'update status escaped its card');
  assert.match(await page.locator('#appDetails').textContent(), /CrunchyMurmur 1\.0\.0/);
  assert.equal(await page.locator('#deleteData').isVisible(), true);
  assert.equal(await page.locator('#audioRetentionPolicy option').count(), 5);
  assert.equal(await page.locator('#permissionsList .permission-row').count(), 5);

  await page.locator('.nav-item[data-tab="engine"]').click();
  await electronApp.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/ui/main.html'));
    main?.setSize(720, 560);
  });
  const engineLayout = await page.locator('#tab-engine').evaluate((tab) => {
    const visible = (element) => element.getClientRects().length > 0;
    const cards = [...tab.querySelectorAll('.card')].filter(visible);
    const modules = [...tab.querySelectorAll('.engine-radio .radio')].filter(visible);
    const controls = [...tab.querySelectorAll('.card input[type="text"], .card input[type="password"], .card select')].filter(visible);
    const contained = cards.every((card) => {
      const cardRect = card.getBoundingClientRect();
      return [...card.querySelectorAll('label, input, select, button, p')].filter(visible).every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1;
      });
    });
    return {
      contained,
      cardsClipContent: cards.some((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1),
      minimumModuleHeight: Math.min(...modules.map((module) => module.getBoundingClientRect().height)),
      modulesCentered: modules.every((module) => getComputedStyle(module).alignItems === 'center'),
      minimumControlHeight: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
    };
  });
  if (process.env.CRUNCHYMURMUR_SCREENSHOT_ENGINE) {
    await page.screenshot({ path: path.resolve(process.env.CRUNCHYMURMUR_SCREENSHOT_ENGINE) });
  }
  assert.equal(engineLayout.contained, true, 'Engine content escaped its card');
  assert.equal(engineLayout.cardsClipContent, false, 'Engine card clips its content');
  assert.ok(engineLayout.minimumModuleHeight >= 34, `Engine option module is only ${engineLayout.minimumModuleHeight}px tall`);
  assert.equal(engineLayout.modulesCentered, true, 'Engine option text is not vertically centered');
  assert.ok(engineLayout.minimumControlHeight >= 36, `Engine control is only ${engineLayout.minimumControlHeight}px tall`);

  if (process.platform === 'linux') {
    const shortcutRegistered = await electronApp.evaluate(({ globalShortcut }) => (
      globalShortcut.isRegistered('CommandOrControl+Shift+Space')
    ));
    assert.equal(shortcutRegistered, true, 'Linux global shortcut was not registered');
  }

  if (process.platform === 'win32') {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const floating = electronApp.windows().find((candidate) => candidate.url().endsWith('/ui/floating.html'));
    assert.ok(floating, 'floating dictation overlay was not created');
    await floating.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    try {
      uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
      uIOhook.keyToggle(UiohookKey.Meta, 'down');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await floating.waitForFunction(() => document.body.classList.contains('state-recording'), null, { timeout: 3000 });
      assert.match(await floating.locator('body').getAttribute('class'), /state-recording/);
      const overlayVisible = await electronApp.evaluate(({ BrowserWindow }) => (
        BrowserWindow.getAllWindows().some((window) => (
          window.webContents.getURL().endsWith('/ui/floating.html') && window.isVisible()
        ))
      ));
      // GitHub's Windows runner has no interactive desktop, so native windows can
      // enter their recording state without the OS reporting them as visible.
      if (!process.env.CI) assert.equal(overlayVisible, true, 'floating dictation overlay did not become visible');
    } finally {
      uIOhook.keyToggle(UiohookKey.Meta, 'up');
      uIOhook.keyToggle(UiohookKey.Ctrl, 'up');
    }
    // The hosted Windows runner has no interactive desktop and can drop the
    // synthetic Win-key release. Exercise the real release path on desktops;
    // the deterministic IPC assertion below still covers the resulting state.
    if (!process.env.CI) {
      await floating.waitForFunction(() => !document.body.classList.contains('state-recording'), null, { timeout: 3000 });
      assert.doesNotMatch(await floating.locator('body').getAttribute('class'), /state-recording/,
        'releasing Ctrl + Win did not finish dictation');
    }
    await floating.evaluate(() => window.wisper.submitSamples(new Array(16_000).fill(0)));
    await floating.waitForFunction(() => document.body.classList.contains('state-no-speech'));
    assert.equal(await floating.locator('#label').innerText(), 'No microphone signal');
  }
});
