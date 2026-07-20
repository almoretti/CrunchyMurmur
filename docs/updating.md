# Updating CrunchyMurmur

GitHub Releases is the only update source. CrunchyMurmur does not use an app store or a separate update server.

## Automatic updates

Packaged Windows, macOS, and Linux AppImage builds use the channel selected under **General → Update channel**. Stable is the default. Nightly is an opt-in stream of signed prerelease builds for testing work before it reaches Stable. When a newer compatible version exists, the app downloads it in the background and asks before restarting to install it.

- Stable ignores prereleases and rejects downgrades by default.
- Nightly follows prereleases whose version uses the `nightly` identifier.
- Returning from Nightly to Stable requires confirmation and authorises the Stable replacement download. Downgrades are disabled again after that download completes.
- Choosing **Later** keeps the downloaded update ready for a later restart.
- Development builds do not check for updates.
- Debian packages use manual updates because they do not run from an AppImage update context.

Use **General → Automatic updates → Check now** to request a check and read the current status. Changing channels also checks immediately.

## Manual updates

Run the same terminal installer again. It resolves the latest Stable release and verifies the downloaded package against `SHA256SUMS` before installing it. Terminal installers do not install Nightly builds.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/install.ps1 | iex
```

macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/install.sh | sh
```

This is also the supported update path for Debian packages. App data is preserved across normal upgrades.

## Trust and verification

Each release includes signed packages where supported, `SHA256SUMS`, an SPDX SBOM, GitHub build-provenance attestations, and updater manifests checked against the uploaded files before publication. Until 10 July 2027, Windows packages use a temporary self-signed publisher certificate and may trigger SmartScreen warnings; verify the checksum and provenance before installing. Release assets are immutable by policy: a bad release is corrected with a newer patch release rather than silently replacing files.
