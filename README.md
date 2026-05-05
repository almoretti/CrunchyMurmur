# CrunchyMurmur — Windows (Electron)

Local-Whisper push-to-talk dictation, meeting recording, and AI note
generation for Windows. Hold **Ctrl + Win**, speak, release. The
transcription is pasted into whatever app has focus and stored in a
searchable Recordings list.

CrunchyMurmur on Windows is a port of the
[macOS app](https://github.com/almoretti/CrunchyMurmur). Mac parity is
mostly reached — see [`STATUS.md`](./STATUS.md) for what's shipped vs.
deferred (the main remaining gap is system-audio capture for Meetings,
which needs WASAPI loopback).

## Prerequisites

You will need **Node.js 20+** and **npm** (https://nodejs.org), plus one of
two transcription-engine setups:

### Option A — Groq (cloud, fastest path)
- A free API key from [console.groq.com](https://console.groq.com/keys).
- No model download. Faster on most laptops than local CPU inference.
- Requires internet on every dictation.
- The key is stored encrypted via Windows DPAPI (only your Windows user
  account can decrypt it).

### Option B — Local (offline, private)
- **`whisper-cli.exe`** — download a release build from
  [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases).
  Use the `whisper-blas-bin-x64.zip` (CPU-only) or `whisper-cublas-12.x.x-bin-x64.zip`
  (NVIDIA GPU) build. Put it somewhere stable like `C:\Tools\whisper.cpp\`.
- **A ggml model** — easiest path is the **Models** tab in the app, which
  downloads bundled options straight from Hugging Face. Otherwise you can
  point the model picker at any external `.bin`.

You pick which engine to use on the **Engine** tab the first time you launch.

## Run in dev mode

```cmd
cd CrunchyMurmur-Windows
npm install
npm start
```

On first run, the main window opens to **Engine**. Pick a transcription
engine, hit **Save**, then close the window — the app keeps running in the
system tray.

Hold **Ctrl + Win** anywhere on Windows to dictate. Release to transcribe and
paste into the focused app.

### Optional: AI Notes

Open the **Engine** tab → AI Notes section. Pick a provider:
- **Anthropic** or **OpenAI** — paste an API key.
- **Claude Code** or **Codex** — uses your installed CLI subscription;
  no API key needed (the app shows a green "installed" badge if it
  finds the CLI on PATH).

Then right-click any recording → **Generate AI note…** to summarise it
with a template (manage templates on the **Templates** tab).

### Optional: Calendar feeds

Open the **Meetings** tab → **Feeds** → paste the public ICS URL of a
calendar (Google / iCloud / Outlook all expose one). Today's events
appear in the sidebar.

### Optional: Meetings (mic-only)

**Meetings** tab → **Start**. Records your microphone (system audio
capture isn't ported yet — see STATUS.md). Stop the recording, click
**Transcribe**, then **Generate** an AI summary. **Send to Notes** saves
the result as a Markdown file in your Notes folder.

## Build a Windows installer

```cmd
npm run build:win
```

Output goes to `dist/`. The installer is unsigned — fine for personal
use; for distribution see the release packaging note in `STATUS.md`.

## Defender exclusion

The global key listener (`node-global-key-listener`) ships a small helper
binary `WinKeyServer.exe` that Windows Defender flags as a generic
keylogger. Without an exclusion, Defender quarantines the .exe right
after `npm install` and the app fails at startup with `spawn ENOENT`.

Add an exclusion (admin PowerShell):

```powershell
Add-MpPreference -ExclusionPath "<path-to-repo>\node_modules\node-global-key-listener\bin"
```

For a packaged release the proper fix is code-signing the helper binary;
that's a release-time concern.

## Where data lives

- `%APPDATA%\CrunchyMurmur\settings.json` — engine + AI provider config
  (API keys encrypted via DPAPI).
- `%APPDATA%\CrunchyMurmur\history.json` — Recordings list.
- `%APPDATA%\CrunchyMurmur\Models\` — downloaded Whisper models.
- `%APPDATA%\CrunchyMurmur\Meetings\<id>\` — per-meeting WAV + meta.
- `%APPDATA%\CrunchyMurmur\Templates\<id>.json` — AI note template overrides.
- `%USERPROFILE%\Documents\CrunchyMurmur Notes\` — Notes app folders + .md files.

If you upgrade from the previous "WisperHelp" name, the app migrates
those folders for you on first launch.

## Hotkey caveat

Windows reserves several `Win+*` chords (Win+L, Win+E, Win+D, Win+1..9).
Holding **both** Ctrl and Win without an additional key is not bound to
a system action on a default Windows install, so it works as a
push-to-talk modifier. If you ever change the hotkey, avoid pure
`Win`-only or pure `Ctrl`-only — both fire in too many unrelated places.

## Cross-platform note

The macOS app at https://github.com/almoretti/CrunchyMurmur is the
parity reference. Some features deliberately don't translate (Mac uses
ScreenCaptureKit for system audio, EventKit for calendars, etc.); see
STATUS.md for the deferred items.
