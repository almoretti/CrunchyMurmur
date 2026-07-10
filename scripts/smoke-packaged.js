const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const executable = process.argv[2];
if (!executable || !fs.existsSync(executable)) {
  console.error('Usage: node scripts/smoke-packaged.js <packaged executable>');
  process.exit(2);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-packaged-smoke-'));
const port = 9400 + (process.pid % 400);
const child = spawn(path.resolve(executable), [
  '--show',
  `--user-data-dir=${userData}`,
  `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*',
], { stdio: 'ignore', windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
  return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
}

async function findMainTarget() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Packaged app exited during startup with code ${child.exitCode}.`);
    try {
      const target = (await targets()).find((item) => item.type === 'page' && item.url.endsWith('/ui/main.html'));
      if (target) return target;
    } catch {}
    await delay(250);
  }
  throw new Error('Packaged app did not expose its main renderer within 10 seconds.');
}

async function command(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Renderer debugging connection timed out.')), 5_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Renderer debugging connection failed.')); };
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Renderer evaluation timed out.')), 5_000);
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.send(JSON.stringify({
      id: 1,
      method,
      params,
    }));
  });
  socket.close();
  return result;
}

async function evaluate(target, expression) {
  const result = await command(target, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result.value;
}

(async () => {
  try {
    const target = await findMainTarget();
    await delay(500);
    const state = await evaluate(target, '({title:document.title,htmlLength:document.documentElement.outerHTML.length,bodyText:document.body?.innerText||"",styleSheets:document.styleSheets.length,scripts:document.scripts.length})');
    if (state.title !== 'CrunchyMurmur' || state.htmlLength < 1_000 || !state.bodyText.includes('CrunchyMurmur') || state.styleSheets < 1 || state.scripts < 1) {
      throw new Error(`Packaged renderer is blank or incomplete: ${JSON.stringify(state)}`);
    }
    console.log(`Packaged renderer loaded correctly (${state.htmlLength} HTML characters).`);

    await command(target, 'Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    const regression = await evaluate(target, `(() => {
      const keyText = () => document.getElementById('hotkeyDisplay').innerText;
      document.querySelector('[data-tab="general"]').click();
      document.getElementById('recordHotkey').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'Control', code:'ControlLeft', ctrlKey:true, bubbles:true, cancelable:true }));
      const liveModifier = keyText();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', bubbles:true, cancelable:true }));
      const incompleteKey = keyText();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', ctrlKey:true, altKey:true, bubbles:true, cancelable:true }));
      const completedChord = keyText();

      const realPlatform = window.__lastSettings.platform;
      window.__lastSettings.platform = 'darwin';
      document.getElementById('recordHotkey').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', altKey:true, bubbles:true, cancelable:true }));
      const macChord = keyText();
      window.__lastSettings.platform = realPlatform;

      document.querySelector('[data-tab="engine"]').click();
      const tab = document.getElementById('tab-engine');
      const visible = (element) => element.getClientRects().length > 0;
      const cards = [...tab.querySelectorAll('.card')].filter(visible);
      const modules = [...tab.querySelectorAll('.engine-radio .radio')].filter(visible);
      const controls = [...tab.querySelectorAll('.card input[type="text"], .card input[type="password"], .card select')].filter(visible);
      const contained = cards.every((card) => {
        const box = card.getBoundingClientRect();
        return [...card.querySelectorAll('label, input, select, button, p')].filter(visible).every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= box.left - 1 && rect.right <= box.right + 1;
        });
      });
      return {
        liveModifier, incompleteKey, completedChord, macChord, contained,
        cardsClip: cards.some((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1),
        minimumModuleHeight: Math.min(...modules.map((module) => module.getBoundingClientRect().height)),
        modulesCentered: modules.every((module) => getComputedStyle(module).alignItems === 'center'),
        minimumControlHeight: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
      };
    })()`);
    if (!/Ctrl/.test(regression.liveModifier) || !/K/.test(regression.incompleteKey)
        || !/Ctrl.*Alt.*K/.test(regression.completedChord) || !/Option.*K/.test(regression.macChord)) {
      throw new Error(`Packaged shortcut recorder regression: ${JSON.stringify(regression)}`);
    }
    if (!regression.contained || regression.cardsClip || regression.minimumModuleHeight < 34
        || !regression.modulesCentered || regression.minimumControlHeight < 36) {
      throw new Error(`Packaged card layout regression: ${JSON.stringify(regression)}`);
    }
    console.log('Packaged shortcut recorder and minimum-width card layout passed.');
    if (process.platform === 'win32') {
      const { uIOhook, UiohookKey } = require('uiohook-napi');
      try {
        uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
        uIOhook.keyToggle(UiohookKey.Meta, 'down');
        await delay(500);
        const floating = (await targets()).find((item) => item.type === 'page' && item.url.endsWith('/ui/floating.html'));
        if (!floating) throw new Error('Packaged floating overlay target is missing.');
        const overlayClass = await evaluate(floating, 'document.body.className');
        if (!String(overlayClass).includes('state-recording')) {
          throw new Error(`Packaged Ctrl + Win hook did not activate the overlay: ${overlayClass}`);
        }
        console.log('Packaged Ctrl + Win hook activated the recording overlay.');
      } finally {
        uIOhook.keyToggle(UiohookKey.Meta, 'up');
        uIOhook.keyToggle(UiohookKey.Ctrl, 'up');
      }
    }
  } finally {
    child.kill();
    await delay(500);
    fs.rmSync(userData, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
