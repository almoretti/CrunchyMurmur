# Platform support

CrunchyMurmur shares its data model and most product features across Windows, macOS, and Linux. Native operating-system integrations intentionally differ where no reliable portable API exists.

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| Dashboard, word count, WPM, streak | Supported | Supported | Supported |
| Local whisper.cpp and Groq transcription | Supported | Supported | Supported |
| AI formatting and AI Notes providers | Supported | Supported | Supported |
| Notes, templates, recordings, retention | Supported | Supported | Supported |
| Meeting microphone capture | Supported | Supported | Supported |
| Meeting system/call audio | Supported | Supported on macOS 13+ | Not currently supported |
| Speaker-labelled chunked transcription | Supported when both tracks exist | Supported when both tracks exist | User microphone is labelled `YOU` |
| Default global shortcut | Hold Ctrl + Win | Hold Fn (🌐) | Configurable toggle shortcut |
| Calendar | ICS feeds | Native EventKit and ICS feeds | ICS feeds |
| Automatic paste | Native input simulation | Requires Accessibility/Automation | Requires `wtype` on Wayland or `xdotool` on X11 |
| Packages | NSIS x64/ARM64 | Signed/notarized universal DMG and ZIP | AppImage and Debian x64/ARM64 |

## Linux desktop requirements

The Debian package declares its Electron runtime dependencies. AppImage users may need their distribution's FUSE compatibility package. Automatic paste requires `wtype` or `xdotool`; the transcription remains on the clipboard when neither is installed.

System-audio meeting capture is deliberately disabled on Linux for now. PipeWire and XDG desktop portal behavior varies by compositor, distribution, and session type. It should be enabled only after a portal-backed implementation has automated coverage on both Wayland and X11.

Linux release CI runs unit tests, Electron UI tests under Xvfb, builds x64 and ARM64 packages, and launches the packaged x64 renderer.
