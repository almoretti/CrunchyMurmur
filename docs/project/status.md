# CrunchyMurmur production status

Updated 10 July 2026.

## Stable release scope

The 1.0 release supports Windows x64/ARM64, macOS Intel/Apple Silicon through a universal package, and Linux x64/ARM64 through AppImage and Debian packages.

Shipped capabilities:

- key-captured cross-platform global shortcut, with Ctrl + Win hold-to-dictate by default on Windows;
- local whisper.cpp or Groq transcription;
- automatic paste with a clipboard fallback;
- searchable dictation history;
- separate microphone and system-audio meeting tracks on supported Windows/macOS versions, with microphone-only fallback and crash recovery;
- meeting transcription, AI summaries, templates, and Markdown notes;
- ICS calendar feeds;
- model download integrity/size validation;
- encrypted credential storage when the OS facility is available;
- data export, complete local-data deletion, diagnostics, logs, and retention controls;
- GitHub Release updates; and
- signed/notarized release automation, checksums, SPDX SBOM, and provenance attestations.

Automated gates include JavaScript syntax validation, store/security unit tests, a real Electron UI smoke test on all three operating systems, dependency audit, release-configuration validation, and Windows packaging.

## Deliberate limitations

- Linux meetings currently record the selected microphone only. Windows and macOS request system-audio capture when a meeting starts and continue microphone-only if it is unavailable or declined.
- Linux automatic paste needs `wtype` on Wayland or `xdotool` on X11. The transcript remains on the clipboard if neither is available.
- macOS automatic paste may require Accessibility or Automation permission.
- Local transcription requires a separately installed whisper.cpp CLI and GGML model.
- Cloud and CLI integrations remain subject to their providers' availability, terms, and pricing.
- Uninstallers preserve app data. Users can export or delete it from General settings before uninstalling.

## Remaining release blockers outside source control

The source and workflow are release-ready, but a public stable release must not be created until all of these external conditions are met:

- trusted Windows code-signing credentials are configured in GitHub Actions;
- Apple Developer ID signing and notarization credentials are configured;
- signed packages pass the clean-device matrix in the [release guide](../releasing.md).

The repository is public, private vulnerability reporting is enabled, and `main` is protected by cross-platform CI, packaged Windows, and CodeQL checks.

Local developer builds are intentionally unsigned and are not release artifacts.
