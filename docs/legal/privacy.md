# CrunchyMurmur Privacy Notice

Effective: 10 July 2026

CrunchyMurmur is a desktop application. It has no CrunchyMurmur account, advertising SDK, analytics SDK, or operator-hosted telemetry service. The project maintainers do not receive your recordings, transcripts, notes, settings, or API keys merely because you use the app.

## Data stored on your device

The app can store settings, encrypted API credentials, dictation history, downloaded speech models, calendar-feed configuration, meeting microphone recordings, transcripts, templates, notes, update logs, and diagnostic logs. Notes are stored in `CrunchyMurmur Notes` under your Documents folder; other app-owned data is stored in Electron's per-user application-data folder.

You can export or delete all app-owned local data from General settings. Meeting audio retention can delete WAV files after transcription or after 1, 7, or 30 days, while preserving transcripts and notes. Removing the application does not automatically delete user data or notes.

API credentials are protected using the operating system facility exposed by Electron `safeStorage` when available. The app warns in its log and may fall back to plaintext storage when that facility is unavailable. A data export may contain credential material and should be protected accordingly.

## Data sent to services you choose

CrunchyMurmur makes network requests only for features you configure or invoke:

- Groq speech transcription sends the selected audio recording and configured language/model information to Groq.
- Anthropic or OpenAI AI Notes sends the transcript, notes, template instructions, and model configuration to that provider.
- Claude Code or Codex CLI integrations pass note-generation content to the locally installed CLI. That CLI may contact its own provider under its separate configuration and terms.
- Calendar feeds send a request to the HTTPS ICS URL you configure. The calendar host sees normal request metadata such as your IP address.
- Model downloads contact Hugging Face.
- Update checks contact GitHub Releases and may download a signed release package.

Those third parties process data under their own privacy notices. Do not configure a cloud feature for content you are not permitted to send to that provider. Local Whisper transcription does not send audio to a transcription provider.

## Microphone and clipboard

The microphone is accessed only while you explicitly start dictation, a microphone test, or a meeting recording. On supported Windows and macOS versions, starting a meeting can also capture system or call audio as a separate track; the app asks for confirmation first and continues microphone-only if capture is declined or unavailable. No video is saved. Completed dictation is placed on the clipboard and the app attempts to paste it into the focused application. If automatic paste succeeds, the previous text clipboard value is restored shortly afterward.

On macOS, optional Calendar access reads upcoming event titles, times, locations, and calendar names through EventKit. These values are displayed locally and can be used to name a meeting. They are not uploaded by the calendar integration.

If AI formatting is enabled, the raw transcript is sent to Groq or Anthropic to remove fillers and clean formatting before paste. The original transcript is used if that request fails. The provider receives the transcript and processes it under its own terms and privacy policy.

On Windows, the default modifier-only Ctrl + Win shortcut uses a local operating-system keyboard hook because native global-shortcut APIs require a non-modifier key. The hook checks key-down and key-up state only to detect the configured shortcut. CrunchyMurmur does not store, log, or transmit captured key events.

## Recording consent

Before recording other people, tell them and obtain any consent required by the laws, employment rules, contracts, or policies that apply to you. CrunchyMurmur cannot determine whether a recording is lawful.

## Diagnostics and support

Diagnostic logs remain local unless you choose to share them. The Copy diagnostics action masks configured API-key values, but you should review any material before publishing it in a GitHub issue.

Questions or privacy reports may be filed through the repository's private security-reporting channel or issue tracker described in the [security policy](../../.github/SECURITY.md).
