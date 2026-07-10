# CrunchyMurmur

[![CI](https://github.com/almoretti/CrunchyMurmur-Windows/actions/workflows/ci.yml/badge.svg)](https://github.com/almoretti/CrunchyMurmur-Windows/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Cross-platform voice dictation, microphone meeting recording, and AI-assisted notes for Windows, macOS, and Linux. Press the configurable global shortcut once to record and again to transcribe. The result is pasted into the focused app and kept in searchable local history.

CrunchyMurmur supports local transcription with [whisper.cpp](https://github.com/ggerganov/whisper.cpp) or cloud transcription with Groq. AI notes can use Anthropic, OpenAI, Claude Code, or Codex. Cloud features are optional.

## Install

Stable, signed builds are published only through [GitHub Releases](https://github.com/almoretti/CrunchyMurmur-Windows/releases). Release assets include SHA-256 checksums, an SPDX SBOM, and GitHub artifact attestations.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/almoretti/CrunchyMurmur-Windows/main/install.ps1 | iex
```

macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/almoretti/CrunchyMurmur-Windows/main/install.sh | sh
```

The terminal installers detect architecture, download the latest GitHub Release, and verify its published SHA-256 digest. Windows installs per user. macOS installs to `~/Applications`. Linux installs an AppImage under `~/.local` without requiring root.

Websites can link directly to stable assets using GitHub's `releases/latest/download/` URLs. Current asset names are documented in [the release guide](./docs/releasing.md).

On Linux, automatic paste uses `wtype` on Wayland or `xdotool` on X11. Install the appropriate package for your desktop; transcription remains on the clipboard if simulated paste is unavailable. Some AppImage-based distributions also require their FUSE compatibility package.

## First run

Choose an engine in the Engine tab:

- Local: select the `whisper-cli` executable from a whisper.cpp release and download or select a GGML model.
- Groq: add a Groq API key and choose a model. Audio is sent to Groq for transcription.

The default Windows shortcut is **Ctrl + Win**: hold both keys to dictate and release either to transcribe. macOS defaults to **Fn (🌐)** with the same hold/release behavior. Linux defaults to `CommandOrControl+Shift+Space`, which toggles recording. Change it from General settings. On macOS, Fn capture requires Accessibility and Input Monitoring permission.

Meeting recording captures the selected microphone and, on supported Windows and macOS versions, system/call audio as separate tracks. The app shows an explicit confirmation before recording. Tell participants and obtain any consent required by applicable law or policy. Linux currently records the microphone only.

## Privacy and local data

There is no CrunchyMurmur account, analytics SDK, advertising SDK, or project-operated telemetry service. Local Whisper audio remains on the device. Content is sent to cloud or CLI providers only when you configure and invoke those features. Read [PRIVACY.md](./PRIVACY.md) for the complete data flow.

The Dashboard reports total dictated words, weighted words per minute, and consecutive active days. General settings can export or permanently delete app-owned local data, open diagnostic logs, copy masked diagnostics, inspect permissions, and apply audio-only retention. Retention never deletes meeting transcripts or notes. API keys use Electron's operating-system-backed safe storage when available.

On macOS, the Meetings page can read upcoming events directly from Calendar through EventKit. ICS feeds remain available on every platform. Calendar data stays local and is used only to display and name meetings.

See [Platform support](docs/platform-support.md) for the exact Windows, macOS, and Linux capability matrix and Linux desktop requirements.

Optional AI formatting removes fillers and cleans punctuation before pasting. It uses Groq when a Groq key is configured, otherwise Anthropic, and falls back to the original transcript if formatting fails. Groq can also be selected as the AI Notes provider.

## Development

Requirements: Node.js 22.12 or newer and npm.

```sh
npm ci
npm run check
npm start
```

Packaging commands:

```sh
npm run build:win
npm run build:mac
npm run build:linux
```

Cross-platform installers must be built on their native GitHub runner. Production Windows and macOS packages require signing credentials; macOS is also notarized. See [docs/releasing.md](./docs/releasing.md).

## Contributing and security

Read [CONTRIBUTING.md](./CONTRIBUTING.md), the [Code of Conduct](./CODE_OF_CONDUCT.md), and [SECURITY.md](./SECURITY.md). Never include API keys, private calendar URLs, recordings, transcripts, or notes in a public issue.

CrunchyMurmur is available under the [MIT License](./LICENSE). Use is also subject to the distributed [Terms of Use](./TERMS.md).
