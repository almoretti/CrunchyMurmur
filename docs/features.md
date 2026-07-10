# Features and providers

## Dictation

CrunchyMurmur captures microphone audio while the global shortcut is active, transcribes it through the selected engine, stores a searchable local recording entry, and pastes the result into the previously focused application. The shortcut recorder listens to physical key presses; it is not a text field.

Optional AI formatting removes fillers and improves punctuation before paste. If formatting fails, the original transcript is preserved.

## Meetings

Meeting recording starts only after explicit confirmation. Windows and supported macOS versions can keep microphone and system/call audio as separate tracks, enabling speaker-labelled chunked transcription. Linux currently records microphone audio only.

Tell participants and obtain any consent required by law, workplace policy, or the meeting service. Audio retention can remove old WAV files without deleting transcripts or notes.

## Notes and templates

Notes, live meeting notes, and AI prompt templates share the same Markdown editor. It provides:

- write, split, and preview modes;
- Markdown syntax support and safe rendered previews;
- undo, search, and common formatting shortcuts;
- document word and character statistics;
- the same light, dark, and system-aware theme on every platform.

Data remains compatible with the existing plain Markdown storage format.

## Dashboard

The local dashboard reports total dictated words, weighted words per minute, and consecutive active days. These statistics are calculated from local recording metadata and are not sent to a project-operated service.

## Providers

| Provider | Purpose | Runs where | Data sent |
|---|---|---|---|
| whisper.cpp | Transcription | On device | Nothing |
| Groq Whisper API | Transcription | Groq cloud | Recorded audio clip |
| Anthropic, OpenAI, Groq | Formatting and notes | Provider cloud | Selected transcript and prompt |
| Claude Code, Codex | Formatting and notes | Local authenticated CLI | Selected transcript and prompt through that CLI |

Cloud and CLI providers are used only when configured and invoked.

## Data controls

General settings can export app-owned data, permanently delete it, open diagnostic logs, copy masked diagnostics, inspect permissions, and configure audio-only retention. API keys use Electron safe storage when the operating system supports it.
