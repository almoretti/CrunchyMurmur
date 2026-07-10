# Architecture

CrunchyMurmur is an Electron tray application with two local renderers.

- `src/main.js` owns windows, IPC, app lifecycle, privileged filesystem work,
  transcription, and authoritative recording state.
- `ui/main.*` provides settings, history, notes, calendar, and meeting UI. It
  captures meeting audio and immediately sends bounded 16 kHz chunks to main.
- `ui/floating.*` owns short push-to-talk capture and never receives secrets.
- `src/*-store.js` modules persist user data. App-owned JSON writes use
  same-directory temporary files followed by atomic rename.
- `src/preload-*.js` exposes narrow, named capabilities through contextBridge.

## Trust boundaries

Renderers use context isolation, have no Node integration, and load local
content under a restrictive CSP. Main checks the sending `webContents` for
every IPC call. Renderer-supplied path components must pass root-containment
checks before filesystem use. External HTTPS links are allowlisted and opened
by the operating system, never loaded into an app window.

API keys are decrypted only in main. Renderer settings snapshots contain a
fixed mask instead of secret values. CLI AI providers run without tools from a
new temporary directory, limiting transcript prompt-injection impact.

## Audio lifecycle

Short dictation is capped at ten minutes, encoded to a unique temporary WAV,
transcribed, and deleted in `finally`. Meetings are streamed to a partial WAV
in main. Finalization patches the header and renames the file. A partial file
left by a crash is recovered on the next meeting-list load.
