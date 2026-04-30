# WisperHelp — Windows (Electron)

Local-Whisper push-to-talk dictation for Windows. Hold **Ctrl + Win**, speak,
release. The transcription is pasted into whatever app has focus and stored
in a searchable history.

This is a **v1 dictation slice** of the macOS WisperHelp app — it does not
yet ship the Meetings, Notes, or Calendar features.

## Prerequisites

You will need **Node.js 20+** and **npm** (https://nodejs.org), plus one of
two engine setups:

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
- **A ggml model** — recommended `ggml-large-v3-turbo-q5_0.bin` (~574 MB,
  multilingual). Download from
  [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
  into the same folder.

You'll pick which engine to use on the Settings tab the first time you launch.

## Run in dev mode

```cmd
cd WisperHelp-Windows
npm install
npm start
```

On first run, the main window opens to **Settings**. Pick the `whisper-cli.exe`
binary and the model `.bin`, hit **Save**, then close the window — the app
keeps running in the system tray.

Hold **Ctrl + Win** anywhere on Windows to dictate. Release to transcribe and
paste into the focused app.

## Build a Windows installer

```cmd
npm run build:win
```

Output goes to `dist/`. The installer is unsigned — fine for personal use.

## How it works

| Layer        | File                       | Notes                                                    |
|:-------------|:---------------------------|:---------------------------------------------------------|
| Entry / IPC  | `src/main.js`              | Tray, windows, recording lifecycle                       |
| Hotkey       | `src/hotkey.js`            | `node-global-key-listener` watches Ctrl + Win hold/release |
| Audio        | `ui/floating.js`           | `getUserMedia` → 4 KB chunks → linear-interp downsample to 16 kHz mono Float32 |
| Inference    | `src/transcriber.js`       | Local: spawns `whisper-cli.exe -m model.bin -f input.wav -nt` |
| Inference    | `src/groq.js`              | Groq: POSTs WAV to `api.groq.com/openai/v1/audio/transcriptions` |
| Paste        | `src/paste.js`             | Clipboard write + synthetic Ctrl+V via `nut-js`; restores prior clipboard |
| History      | `src/history.js`           | JSON file in `%APPDATA%\WisperHelp\history.json`         |
| Settings     | `src/settings.js`          | JSON file in `%APPDATA%\WisperHelp\settings.json`        |
| Floating bar | `ui/floating.html/css/js`  | Frameless transparent always-on-top BrowserWindow        |
| Main window  | `ui/main.html/css/js`      | History list + Settings tab                              |

## Hotkey caveat

Windows reserves several `Win+*` chords (Win+L, Win+E, Win+D, Win+1..9). Holding
**both** Ctrl and Win without an additional key is not bound to a system action
on a default Windows install, so it works as a push-to-talk modifier. If you
ever change the hotkey, avoid pure `Win`-only or pure `Ctrl`-only — both fire
in too many unrelated places.

## Caveats

- **Tray icon** in `assets/tray.png` is currently empty. Drop a 16×16 or 32×32
  PNG/ICO in `assets/tray.png` (or wire it to `assets/icon.ico`) to get a
  visible tray icon.
- **Cross-compiling from macOS** works for `electron-builder --win`, but you
  cannot runtime-test the global hotkey, paste, or audio capture from macOS —
  you have to launch on actual Windows.
- **No system-audio capture, no Outlook calendar, no AI notes.** Those are the
  expensive Windows-specific features that intentionally stayed out of v1.
