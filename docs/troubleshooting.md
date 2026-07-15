# Troubleshooting

## The shortcut does not start recording

- Open **General**, choose **Record shortcut**, and press the physical combination again.
- Use at least one modifier and a supported non-modifier key. Windows also supports the `Ctrl + Win` hold combination.
- On macOS, grant Accessibility and Input Monitoring, then restart the app.
- Check whether another application or desktop environment already owns the combination.
- On Linux, global shortcut availability depends on the desktop session and compositor.

## The overlay appears but the transcript is empty

- Use **General → Microphone → Test** and confirm the intended device is selected.
- Check operating-system microphone permission.
- For Parakeet, download Parakeet V3 under **Engine → Local models** and select **Use this**. For Whisper, verify the GGML model path and clear the custom `whisper-cli` field to return to the bundled runtime.
- In **Engine**, check the bundled-runtime and local-acceleration status lines. If persistent startup fails, the bundled CLI fallback remains functional and the diagnostic log records the server error.
- For Groq, verify the API key and network connection.
- Speak long enough for the selected model to detect speech, then inspect masked diagnostics.

## Text is copied but not pasted

The transcript remains on the clipboard when automatic paste is unavailable.

- macOS: grant Accessibility/Automation permission.
- Wayland Linux: install `wtype`.
- X11 Linux: install `xdotool`.
- Focus the target text field before using the dictation shortcut.

## Linux AppImage does not launch

Some distributions require a FUSE compatibility package. You can also use the Debian package on Debian-derived systems. Launching the AppImage from a terminal can reveal a missing shared library or desktop dependency.

## The first local transcription is slower than later ones

The first request loads the selected model into memory. Parakeet normally loads in a few seconds and remains in the bundled Rust helper. Whisper is heavier and remains in `whisper-server` until the app has been idle for 15 minutes. Changing the model or local executable causes one new load. If every Whisper request is slow, check the Engine status and logs for a CLI fallback or a `whisper-server` startup failure.

## A short recording produces no transcription

CrunchyMurmur rejects recordings shorter than half a second and clips whose signal is effectively silent. Check the selected microphone and input level in **General**; this guard intentionally prevents silence from becoming fabricated text.

## An update check fails

- Confirm that a public stable release exists and GitHub is reachable.
- Prereleases are intentionally ignored.
- Debian packages update by rerunning the terminal installer.
- Check **General → Automatic updates** for the bounded status message.

## Collect safe diagnostics

Open **General** to copy masked diagnostics or open the app log directory. Review the output before sharing it. Never attach API keys, private calendar URLs, recordings, transcripts, notes, or other personal content to a public issue.

If the problem remains, follow [Support](project/support.md).
