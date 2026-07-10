# Building from source

CrunchyMurmur provides source bootstraps for people who want to run the protected GitHub source without installing a release package or using Git manually.

## One-command build

Windows PowerShell:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/almoretti/CrunchyMurmur/main/scripts/source/run-from-source.ps1)))
```

macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/almoretti/CrunchyMurmur/main/scripts/source/run-from-source.sh | sh
```

Read [`run-from-source.ps1`](../scripts/source/run-from-source.ps1) or [`run-from-source.sh`](../scripts/source/run-from-source.sh), including their history, before piping either script to a shell.

## What the scripts do

1. Require Node.js 22.12 or newer, npm, and the platform archive tools.
2. Resolve the requested GitHub branch, tag, or commit to an exact 40-character commit SHA.
3. Download that immutable commit archive over HTTPS. Git is not required.
4. Extract into a new staging directory beside the persistent source directory.
5. Run `npm ci`, `npm run check`, and `npm run release:check` against the staging tree.
6. Record the built SHA in `.source-commit`.
7. Replace the previous source tree only after validation succeeds, then launch with `npm start`.

Application data lives outside the source directory and is preserved when the source is rebuilt.

## Options

PowerShell:

```powershell
./scripts/source/run-from-source.ps1 -Ref v1.0.0 -NoLaunch
./scripts/source/run-from-source.ps1 -Directory 'D:\Apps\CrunchyMurmurSource' -NoLaunch
```

macOS or Linux:

```sh
./scripts/source/run-from-source.sh --ref v1.0.0 --no-launch
./scripts/source/run-from-source.sh --directory "$HOME/Applications/CrunchyMurmurSource" --no-launch
```

When using a pipe, pass shell options after `sh -s --`:

```sh
curl -fsSL https://raw.githubusercontent.com/almoretti/CrunchyMurmur/main/scripts/source/run-from-source.sh | sh -s -- --no-launch
```

`--skip-checks` / `-SkipChecks` exists for diagnostics but is not recommended. Environment variables `CRUNCHYMURMUR_REF`, `CRUNCHYMURMUR_SOURCE_DIR`, and `CRUNCHYMURMUR_REPOSITORY` can set defaults.

## Manual development checkout

Use a normal clone when contributing so Git can track your work:

```sh
git clone https://github.com/almoretti/CrunchyMurmur.git
cd CrunchyMurmur
npm ci
npm run check
npm start
```

The bootstrap is for running an exact upstream snapshot; it deliberately replaces its managed source directory during an update and is not a contributor checkout.
