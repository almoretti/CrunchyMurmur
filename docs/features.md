# Features and providers

## Dictation

CrunchyMurmur captures microphone audio while the global shortcut is active, transcribes it through the selected engine, stores a searchable local recording entry, and pastes the result into the previously focused application. The shortcut recorder listens to physical key presses; it is not a text field.

For local transcription, CrunchyMurmur offers two complementary engines. Parakeet V3 is the recommended fast default for its 25 supported European languages and runs through a bundled Rust `transcribe-rs` helper. Whisper supports 99+ languages, explicit language selection, translation, and custom GGML models through bundled `whisper-server` and `whisper-cli`. Both engines retain the selected model between recordings and are shared with meeting transcription. Whisper safely falls back to the bundled one-shot CLI if its persistent server fails.

The recorder rejects clips that are too short or contain no meaningful speech energy before inference. This prevents common silence hallucinations such as “Thank you.”

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

## Interface languages

The interface is available in 12 languages: English, Italiano, Español, Português, Français, Deutsch, Dansk, Norsk, Svenska, 中文, 한국어, and 日本語. It follows the system language by default, or a specific language can be selected in General settings; changes apply immediately and are saved for the next launch.

## Providers

| Provider | Purpose | Runs where | Data sent |
|---|---|---|---|
| whisper.cpp (`whisper-server`, with CLI fallback) | Transcription | On device | Nothing |
| Groq Whisper API | Transcription | Groq cloud | Recorded audio clip |
| NVIDIA Parakeet V3 | Local transcription | This device | Nothing |
| Anthropic, OpenAI, Groq | Formatting and notes | Provider cloud | Selected transcript and prompt |
| Claude Code, Codex | Formatting and notes | Local authenticated CLI | Selected transcript and prompt through that CLI |

Cloud and CLI providers are used only when configured and invoked.

## Data controls

General settings can export app-owned data, permanently delete it, open diagnostic logs, copy masked diagnostics, inspect permissions, and configure audio-only retention. API keys use Electron safe storage when the operating system supports it.
