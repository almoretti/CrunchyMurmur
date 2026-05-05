# CrunchyMurmur Windows — Status & TODO

> Snapshot of what's in the v1 scaffold, what's broken/unverified, and what's
> still missing relative to the macOS CrunchyMurmur app. Read this before picking
> up work on a Windows machine.

The macOS app lives at `/Users/alemoretti/Documents/Coding-Projects/CrunchyMurmur/`
(separate Swift codebase, separate git repo). This Windows project is a
**dictation-only v1 in Electron** — Meetings/Notes/Calendar are intentionally
out of scope for now.

---

## ✅ Scaffolded (UNVERIFIED on Windows — needs first smoke test)

These are written in code but the author developed them on macOS and could
not click-test on real Windows. Treat as "probably works" until you've
actually held Ctrl+Win on a Windows desktop.

| Feature | File(s) | Notes |
|---|---|---|
| Tray app + main window | `src/main.js` | Tray icon image is **empty** — see Critical below |
| Hold Ctrl+Win → record | `src/hotkey.js` | Both keys must be held; release of either stops |
| Floating recording pill | `ui/floating.html/css/js` | Frameless transparent always-on-top BrowserWindow at bottom-center of primary display, with pulsing red dot + 5-bar mic level meter + spinner state for transcribing |
| Mic capture + 16 kHz downsample | `ui/floating.js` | `getUserMedia` → `ScriptProcessor` chunks → linear-interp downsample → ship to main via IPC |
| WAV write | `src/transcriber.js` (`writeTempWav`) | PCM16 mono into `%TEMP%\crunchymurmur-<ts>.wav` |
| Local engine | `src/transcriber.js` | Spawns `whisper-cli.exe -m model.bin -f input.wav -nt --no-prints` |
| Groq engine | `src/groq.js` | Multipart POST to `api.groq.com/openai/v1/audio/transcriptions`, `response_format=text` |
| Groq key encryption | `src/settings.js` | `safeStorage` (Windows DPAPI) — encrypted blob persisted as base64 |
| Synthetic Ctrl+V paste | `src/paste.js` | Clipboard write + `nut-js` Ctrl+V → restores prior clipboard after 350 ms |
| History | `src/history.js`, `ui/main.html/js` | JSON in `%APPDATA%\CrunchyMurmur\history.json`; search, copy, delete, clear-all |
| Settings UI | `ui/main.html/css/js` | Engine radio (Local / Groq), conditional fields, language picker |
| First-launch redirect | `src/main.js` (`whenReady`) + `ui/main.js` | Opens main window + jumps to Settings tab if engine isn't configured |

**First smoke test on Windows** (verify each separately):
1. `npm install && npm start`. Tray icon appears (probably blank — fine for now).
2. Settings tab opens. Pick Groq, paste a `gsk_…` key, Save.
3. Close the window. Hold Ctrl+Win for ~2 s, say something, release.
4. Floating pill should appear bottom-center, pulse red, show mic bars.
5. After release, pill switches to spinner ("Transcribing").
6. Text gets pasted into whatever app had focus.
7. Pill disappears. Open the main window — entry shows in History.

If any step fails, the failure mode tells you which subsystem to debug.

---

## 🔴 Critical — required for this to feel like a finished app

### 1. Single-instance lock
Currently nothing prevents launching two copies of the app — you'd end up
with two tray icons, two hotkey listeners (one of which probably crashes),
and racing recording state. Add at the top of `src/main.js`:

```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }
app.on('second-instance', () => { showMainWindow(); });
```

### 2. Permission prompt for the global key listener
On first run, `node-global-key-listener` spawns a small helper binary. On
some Windows configs (corporate-managed, Defender at high paranoia, or
Windows 11 Smart App Control) the helper can be blocked. There is currently
**no error path** if `startHoldListener` fails silently — the user just
won't see the pill appear and won't know why. Wrap the listener init in a
try/catch and surface failures via tray tooltip + a one-time `dialog`
balloon.

### 3. Verify nut-js paste actually fires on Windows
nut-js reliability on Windows depends on the foreground-app's input model
(UWP apps in particular sometimes ignore synthesized keystrokes). If paste
silently fails, add a fallback: leave the text on the clipboard and surface
a tray-balloon notification "Transcription copied — press Ctrl+V to paste"
so the user isn't left wondering where the text went.

---

## 🟡 Polish — small things you'll notice within 5 minutes of using it

| Item | Where | What to do |
|---|---|---|
| Pill flashes from `idle → recording` on first show | `ui/floating.js` | The window opens with no state class, then gets `.state-recording` half a tick later. Default body class to `state-recording` in `floating.html` so there's no visual glitch on first show. |
| First ~100–300 ms of speech is missed | `ui/floating.js` `startCapture` | `getUserMedia` warmup. Either pre-warm the audio context on `app.whenReady()` (idle stream that we discard) or tell the user "wait for the pulse before speaking." Pre-warming is correct. |
| `< 250 ms` recordings are dropped silently | `src/main.js` `submit-samples` handler | Add a tray-balloon: "Too short — try holding longer." |
| No way to cancel an in-flight transcription | `src/main.js` | Add a Ctrl+Esc abort that kills the whisper-cli process / aborts the Groq fetch. |
| Floating pill always at bottom-center | `src/main.js` `createFloatingWindow` | Mac equivalent is also bottom-center, but on Windows people expect it to remember position when dragged. Persist `{x, y}` to settings on `move` event, restore on next show. |
| Tray tooltip is static | `src/main.js` `createTray` | Change tooltip to reflect state ("Recording…", "Transcribing…", "Ready"). |
| Settings: no input device picker | `ui/main.html` | `getUserMedia` always uses the default mic. Add an `<select>` populated from `navigator.mediaDevices.enumerateDevices()` and pass `deviceId` into the `audio` constraint. |
| Settings: no auto-launch toggle | new code | `app.setLoginItemSettings({ openAtLogin: true })` for "Start with Windows." |
| Settings: hotkey is hard-coded | `src/hotkey.js` | Mac app also has it hard-coded so this is parity, but eventually let users pick (e.g. Right Alt hold, Right Ctrl hold). |
| Error UX is `dialog.showMessageBox` | `src/main.js` | Modal dialogs block the app. Replace with a non-modal toast inside the floating pill (it's already showing). |
| History: no per-entry timestamp re-render | `ui/main.js` `relativeTime` | "2 min ago" doesn't update unless you re-render. Acceptable for v1; revisit if it bothers you. |
| Main window has no resizable splits | `ui/main.html/css` | Mac app uses HSplitView. Windows main window is single-column for now (only History + Settings) — fine until you add Notes/Meetings. |

---

## 🟢 Mac-app parity status (post-port)

### ✅ Shipped
- **Models page** — in-app downloader with progress, install/use/delete actions
  (`src/models.js`, Models tab).
- **Notes app** — 3-pane folders/list/editor with autosave + Markdown toolbar
  (`src/notes-store.js`, Notes tab).
- **Templates** — bundled-defaults catalog + per-id JSON overrides
  (`src/templates.js`, Templates tab).
- **AI Notes generation** — Anthropic + OpenAI HTTP, Claude Code + Codex CLI
  shell-out, with subscription-CLI auto-detection (`src/notes-generator.js`,
  `src/providers/*`). Both Recordings and Meetings can generate from a template.
- **Calendar feeds** — ICS-based Today list inside Meetings tab (`src/calendar-store.js`).
  Uses `node-ical` so RRULE expansion works; supports Google / iCloud / Outlook
  published feeds. EventKit (Mac) was not portable.
- **Meetings** — start/stop, mic capture, transcription (reuses Local/Groq engine),
  AI summarization, persistent per-meeting folder under `%APPDATA%\CrunchyMurmur\Meetings\`
  (`src/meetings-store.js`).

### ❗ Remaining gap — system audio capture
The Mac app captures both microphone and **system audio** in parallel via
`ScreenCaptureKit`. Windows has no equivalent and we deferred it:

- **WASAPI loopback** — the right approach, requires either a small native
  Node addon (probably C++/Rust) or a bundled FFmpeg sidecar that captures
  `dshow`/`wasapi` and pipes WAV to disk. Estimated ~1 week of work.
- Until that lands, Meetings record only the user's mic. This is fine for
  in-person meetings or when you're the one talking; it misses the other side
  of remote calls.

### 🟡 Polish gaps still open
- **General settings**: storage-usage line (sums under `%APPDATA%`), audio
  retention slider for meetings (matches Mac AudioRetentionPolicy).
- **Engine page**: provider-card visual treatment (Mac uses big tappable cards
  with subtitles; Windows uses a flat radio).
- **Visual tokens**: Mac shipped a recent refresh (`FormCard` 12 px radius,
  shared `SearchField` / `EmptyState`). Windows uses a different aesthetic.
- **Floating pill states**: Windows shows `recording` / `flushing` /
  `transcribing`; Mac also shows `idle` (with a "Hold Fn" hint) and
  `meeting recording` (red pulse with elapsed timer). Idle hint is the easy add.

---

## 🐛 Known gotchas

- **Running `npm install` on macOS pulls macOS prebuilds** for `nut-js` and
  `node-global-key-listener`. Those won't work if you copy `node_modules/`
  to Windows — always run `npm install` on the target OS, or use
  `electron-builder --win` from macOS which fetches the right prebuilds at
  packaging time.
- **`safeStorage.isEncryptionAvailable()` requires `app.whenReady()`** — it
  returns `false` if called before. The current code only calls it from
  `settings.load()` / `settings.save()` which run after ready, so it's fine,
  but watch out if you move calls earlier.
- **`node-global-key-listener` event names** are `'LEFT CTRL' / 'LEFT META'`
  etc. with spaces, not underscores. Don't be tempted to change them.
- **`Blob`, `FormData`, and `fetch`** in `src/groq.js` rely on Node 20+
  globals. Electron 32 ships Node 20, so this works. If you ever downgrade
  Electron, these will fail.
- **Floating window `focusable: false`** — required so that showing the
  pill doesn't steal focus from the user's app (which would break paste
  destination). Don't change this without a plan.
- **WAV files in `%TEMP%`** are never cleaned up. Not a leak per se (Windows
  cleans `%TEMP%` opportunistically) but a 10 MB WAV per dictation adds up.
  Add `fs.unlink(wavPath, () => {})` at the end of the submit-samples
  handler.

---

## 📂 What lives where

```
CrunchyMurmur-Windows/
├── package.json              # electron, electron-builder, nut-js, node-global-key-listener
├── README.md                 # User-facing setup guide
├── STATUS.md                 # ← you are here
├── assets/
│   ├── tray.png              # 32×32 PNG — used for the system tray icon
│   └── icon.ico              # multi-size .ico (16/24/32/48/64/128/256) — installer + window icon
├── src/
│   ├── main.js               # Electron main: tray, windows, IPC, recording lifecycle
│   ├── hotkey.js             # Hold-Ctrl+Win detection (node-global-key-listener)
│   ├── transcriber.js        # writeTempWav + transcribeWav (local whisper-cli.exe spawn)
│   ├── groq.js               # transcribeWithGroq (HTTP POST to Groq)
│   ├── paste.js              # Clipboard + nut-js Ctrl+V + restore prior clipboard
│   ├── history.js            # JSON history store (load/add/remove/clear)
│   ├── settings.js           # JSON settings + Groq-key encryption via safeStorage
│   ├── preload-floating.js   # contextBridge: submitSamples, onState
│   └── preload-main.js       # contextBridge: settings, history, clipboard, file picker
└── ui/
    ├── floating.html/css/js  # Floating recording pill (mic capture lives here)
    ├── main.html             # Main window markup (sidebar + History tab + Settings tab)
    ├── main.css              # Dark theme; engine radio / sections
    └── main.js               # Tab switching, history rendering, settings save/load
```

---

## 🚀 Picking up on Windows — quickstart

```cmd
git clone https://github.com/almoretti/CrunchyMurmur-Windows.git
cd CrunchyMurmur-Windows
npm install
npm start
```

Configure either Groq (paste `gsk_…` key) or Local (`whisper-cli.exe` +
`.bin` model paths). Save. Close the main window. Hold Ctrl+Win.

If something feels broken, walk down the **Critical** list above. If
something feels rough, walk down **Polish**. If you want to reach Mac-app
feature parity, the **Mac-app parity** section is the long path — do it in
that order (Models page → Notes app → Meetings → AI Notes → Calendar)
because each later item builds on earlier ones.

When you continue this in a new Claude session on Windows: paste a link to
the repo, mention this is the Windows port, and ask Claude to read
`STATUS.md` first. That's enough context to keep going.
