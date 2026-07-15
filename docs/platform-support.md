# Platform support

CrunchyMurmur shares its data model and most product features across Windows, macOS, and Linux. Native operating-system integrations intentionally differ where no reliable portable API exists.

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| Dashboard, word count, WPM, streak | Supported | Supported | Supported |
| Local whisper.cpp and Groq transcription | Supported | Supported | Supported |
| Bundled persistent local model session | Supported | Supported | Supported |
| Parakeet V3 CPU transcription | Supported | Supported | Supported |
| Whisper broad-language fallback | Supported | Supported | Supported |

Windows ARM64 packages use the tested x64 Parakeet and Whisper helpers through Windows' built-in x64 emulation. macOS universal and Linux ARM64 packages contain native helpers.
| AI formatting and AI Notes providers | Supported | Supported | Supported |
| Notes, templates, recordings, retention | Supported | Supported | Supported |
| Localised interface (12 languages) | Supported | Supported | Supported |
| Meeting microphone capture | Supported | Supported | Supported |
| Meeting system/call audio | Supported | Supported on macOS 13+ | Not currently supported |
| Speaker-labelled chunked transcription | Supported when both tracks exist | Supported when both tracks exist | User microphone is labelled `YOU` |
| Default global shortcut | Hold Ctrl + Win | Hold Fn | Configurable toggle shortcut |
| Calendar | ICS feeds | Native EventKit and ICS feeds | ICS feeds |
| Automatic paste | Native input simulation | Requires Accessibility/Automation | Requires `wtype` on Wayland or `xdotool` on X11 |
| Packages | NSIS x64/ARM64 | Signed/notarized universal DMG and ZIP | AppImage and Debian x64/ARM64 |
| Updates | Automatic | Automatic | Automatic for AppImage; reinstall for Debian |

## Linux desktop requirements

The Debian package declares its Electron runtime dependencies. AppImage users may need their distribution's FUSE compatibility package. Automatic paste requires `wtype` or `xdotool`; the transcription remains on the clipboard when neither is installed.

System-audio meeting capture is deliberately disabled on Linux for now. PipeWire and XDG desktop portal behavior varies by compositor, distribution, and session type. It should be enabled only after a portal-backed implementation has automated coverage on both Wayland and X11.

Linux release CI runs unit tests, Electron UI tests under Xvfb, builds x64 and ARM64 packages, and launches the packaged x64 renderer.

## Local acceleration

Release builds pin whisper.cpp v1.8.6 to commit `23ee03506a91ac3d3f0071b40e66a430eebdfa1d`. Windows includes the checksum-verified official x64 CPU runtime; the ARM64 package uses Windows' x64 emulation for this runtime. macOS builds one universal runtime with Metal enabled. Linux builds portable CPU runtimes for x64 and ARM64. Advanced users can choose a different compatible `whisper-cli` build in Engine settings, including hardware-specific Vulkan, CUDA, or ROCm builds.
