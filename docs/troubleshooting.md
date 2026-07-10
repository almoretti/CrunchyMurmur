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
- For local transcription, verify the `whisper-cli` path and GGML model path.
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

## An update check fails

- Confirm that a public stable release exists and GitHub is reachable.
- Prereleases are intentionally ignored.
- Debian packages update by rerunning the terminal installer.
- Check **General → Automatic updates** for the bounded status message.

## Collect safe diagnostics

Open **General** to copy masked diagnostics or open the app log directory. Review the output before sharing it. Never attach API keys, private calendar URLs, recordings, transcripts, notes, or other personal content to a public issue.

If the problem remains, follow [Support](../SUPPORT.md).
