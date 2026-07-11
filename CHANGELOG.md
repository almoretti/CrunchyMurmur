# Changelog

All notable changes are documented here. This project follows Semantic
Versioning and the Keep a Changelog structure.

## [Unreleased]

### Added

- Safe one-command Windows, macOS, and Linux source bootstraps that build an exact GitHub commit without requiring Git.
- Open-source project documentation, branded README feature icons, support policy, roadmap, getting-started guide, and update/troubleshooting guides.
- Release-time validation that every platform updater manifest references artifacts that were actually built.
- Shared offline WYSIWYG Markdown editor for notes, AI-note templates, and live meeting notes, powered by MarkText's Muya editor.
- Markdown formatting, contextual editing tools, slash-command block insertion, search, undo, HTML-safe rendering, and document statistics.
- System-aware light and dark themes based on the ivory, Mediterranean green, pistachio, ceramic blue, butter, apricot, and bougainvillea palette.

### Changed

- Reorganized community, legal, and project documentation into conventional `.github/` and `docs/` sections and removed unused legacy branding exports.
- Stable automatic updates now explicitly reject prereleases and downgrades.
- Text-editing surfaces now render Markdown directly while preserving the existing Markdown and autosave storage formats.
- Window chrome, scrollbars, cards, controls, editor surfaces, and the recording overlay now follow the saved appearance preference across Windows, macOS, and Linux.
- Replaced the placeholder in-app waveform glyph and legacy orange/blue package variants with one palette-aligned five-bar app mark across title bar, tray, Windows, macOS, and Linux artifacts.

## [1.0.0] - 2026-07-10

### Added

- Automated syntax and store/security tests.
- Cross-platform CI, Electron smoke tests, and open-source contribution and security policies.
- Streaming meeting audio persistence with bounded renderer memory.
- Windows x64/ARM64, macOS universal, Linux x64/ARM64 release targets.
- GitHub Release updates, verified terminal installers, checksums, SPDX SBOM, and provenance attestations.
- Configurable global shortcut, support diagnostics, logs, data export/deletion, meeting retention, privacy notice, and terms.
- Key-press shortcut recorder and Windows Ctrl + Win hold-to-dictate default.
- Dashboard totals for dictated words, weighted WPM, and daily streak.
- macOS Fn push-to-talk and native EventKit calendar integration.
- Separate microphone/system meeting tracks on supported Windows and macOS versions.
- Speaker-labelled, timestamped, chunked meeting transcription with progress and cancellation.
- Groq AI Notes and optional AI formatting for dictation.
- Permission status and audio-only meeting retention controls.
- Linux Electron UI coverage and stable x64 AppImage/Debian artifact names.

### Changed

- Hardened IPC, navigation, permissions, AI CLI isolation, secret handling,
  file persistence, calendar fetching, and model download validation.
- Replaced the archived platform-specific keyboard hook with Electron global shortcuts.
- Added cross-platform paste and CLI discovery.
- Refined the desktop shell with integrated title-bar chrome, compact contained cards, responsive panes, and bounded scroll regions.
- Restored the standard application menu and redesigned recording history as non-shrinking transcript preview cards.
- Meeting retention now removes WAV files only and always preserves transcripts and notes.
- Linux desktop metadata now keeps packaged windows associated with the installed application entry.

### Fixed

- Microphone leak after a fast push-to-talk release.
- Orphaned meeting state when the main window is closed.
- Duplicate meeting recording starts and note autosave selection races.
- Temporary dictation WAV accumulation and filesystem path traversal.
- Blank packaged windows caused by disabling Electron's required file-protocol fuse.
- General-page horizontal overflow and unbounded GitHub updater error text.
- Recording cards collapsing to timestamp-only rows in large histories.
- Shortcut capture hiding held or incomplete keys behind generic instructions.
- Engine/provider modules and form-control text clipping or misaligning at narrow widths and with Linux font metrics.
