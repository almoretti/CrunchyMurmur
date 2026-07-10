# Getting started

## 1. Install

Use a package from the latest GitHub Release or the verified terminal installer shown in the [README](../README.md#install).

- Windows: run the x64 or ARM64 NSIS installer.
- macOS: open the universal DMG and copy CrunchyMurmur to Applications.
- Linux: use the x64 or ARM64 AppImage, or install the matching Debian package.

Production Windows and macOS artifacts are signed; macOS artifacts are notarized. Every release includes `SHA256SUMS`, an SPDX SBOM, and GitHub provenance attestations.

## 2. Choose a transcription engine

Open **Engine** in the sidebar.

### Local whisper.cpp

1. Install or download `whisper-cli` from a compatible whisper.cpp release.
2. Select the executable in CrunchyMurmur.
3. Download a model from the Models page or select an existing GGML `.bin` model.
4. Save the engine settings.

This mode runs offline and requires no API key. Model size affects speed, memory use, and accuracy.

### Groq cloud transcription

1. Select Groq.
2. Add an API key from your Groq account.
3. Select a supported Whisper model and save.

Audio clips are sent to Groq when this engine is used. Review the provider's terms and retention settings before enabling it.

## 3. Check the microphone

Open **General**, choose the intended input device, and use **Test**. An empty transcript is usually caused by the wrong microphone, missing operating-system permission, or a local model/executable mismatch.

## 4. Make the first dictation

- Windows defaults to holding `Ctrl + Win`; release either key to transcribe.
- macOS defaults to holding `Fn`; grant Accessibility and Input Monitoring when prompted.
- Linux uses a configurable toggle shortcut by default.

Change the combination from **General → Dictation shortcut** by selecting **Record shortcut** and physically pressing the desired supported keys. A recording overlay confirms that capture is active.

The completed transcript is copied and pasted into the app that had focus. If automatic paste is unavailable, the text remains on the clipboard.

## 5. Optional features

- Add AI providers in **Engine** for transcript cleanup or AI notes.
- Create reusable Markdown prompts under **Templates**.
- Start consent-aware recordings under **Meetings**.
- Review dictated words, WPM, and streaks on **Dashboard**.

Continue with [Features](features.md), [Platform support](platform-support.md), or [Troubleshooting](troubleshooting.md).
