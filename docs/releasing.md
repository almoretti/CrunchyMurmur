# Releasing CrunchyMurmur

GitHub Releases is the only supported publication channel. The workflow builds on native GitHub-hosted Windows, macOS, and Linux runners and refuses to publish unsigned Windows or macOS artifacts.

## One-time repository setup

Make the repository public before announcing downloads; GitHub's anonymous `releases/latest/download` URLs and the terminal installers cannot serve assets from a private repository.

Configure these GitHub Actions secrets:

- `WIN_CSC_LINK`: base64-encoded Windows code-signing certificate or a supported secure URL.
- `WIN_CSC_KEY_PASSWORD`: certificate password.
- `MAC_CSC_LINK`: base64-encoded Apple Developer ID Application certificate.
- `MAC_CSC_KEY_PASSWORD`: certificate password.
- `APPLE_ID`: Apple account used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that account.
- `APPLE_TEAM_ID`: Apple Developer team identifier.

Enable GitHub private vulnerability reporting, require pull requests and CI on `main`, enable Dependabot security updates, and restrict who may create `v*` tags. Use a GitHub Environment with required reviewers for the release secrets if the repository's plan supports it.

## Release procedure

1. Update `CHANGELOG.md` and set the same stable version in `package.json` and `package-lock.json`.
2. Run `npm ci`, `npm run check`, `npm audit --audit-level=high`, and `npm run release:check` from a clean checkout.
3. Merge the reviewed release commit to `main`.
4. Create and push the matching annotated tag, for example `v1.0.0`.
5. The Release workflow validates the tag/version pair, builds and signs Windows x64/arm64, signs and notarizes macOS universal, and builds Linux x64/arm64 AppImage and Debian packages.
6. The publish job creates an SPDX SBOM and `SHA256SUMS`, generates GitHub build-provenance attestations, and publishes the immutable GitHub Release.
7. Verify installation and updating on clean Windows x64/arm64, supported macOS Intel/Apple Silicon, Linux X11, and Linux Wayland systems before announcing the release.

Do not manually replace assets on a published release. Fix the source and publish a new patch version.

## Stable download URLs

The release workflow keeps these names stable for a future website:

- `CrunchyMurmur-win-x64.exe`
- `CrunchyMurmur-win-arm64.exe`
- `CrunchyMurmur-mac-universal.dmg`
- `CrunchyMurmur-mac-universal.zip`
- `CrunchyMurmur-linux-x64.AppImage`
- `CrunchyMurmur-linux-arm64.AppImage`
- `CrunchyMurmur-linux-x64.deb`
- `CrunchyMurmur-linux-arm64.deb`
- `SHA256SUMS`
- `sbom.spdx.json`
- `install.ps1`
- `install.sh`

Prefix any name with `https://github.com/almoretti/CrunchyMurmur-Windows/releases/latest/download/` for a website download link.

## Verification

- Windows: inspect Authenticode with `Get-AuthenticodeSignature` and confirm a valid trusted signer.
- macOS: run `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `xcrun stapler validate` against the installed application/package.
- Linux and all platforms: compare the artifact SHA-256 with `SHA256SUMS` and verify the GitHub attestation with GitHub CLI.
- Confirm the app's updater discovers the release and applies it from the previous stable version.
