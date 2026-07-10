# Contributing to CrunchyMurmur

Thanks for helping improve CrunchyMurmur. Keep changes focused, explain the
user-visible behavior they change, and include tests for bug fixes where the
logic can be exercised without Windows UI automation.

## Development setup

1. Install Node.js 22.12 or newer on Windows.
2. Run `npm ci`.
3. Run `npm run check`.
4. Start the app with `npm start`.

The global hotkey helper may be quarantined by Windows Defender. See the main
README before changing Defender settings. Never commit API keys, recordings,
calendar feed URLs, model files, or generated installer output.

## Pull requests

- Open an issue first for substantial product or architecture changes.
- Keep privileged operations in the Electron main process.
- Validate IPC senders and all renderer-supplied paths and payload sizes.
- Avoid retaining complete meeting recordings in JavaScript memory.
- Run `npm run check` and `npm run pack:win` before requesting review.
- Update `CHANGELOG.md` under **Unreleased** for user-visible changes.

By participating, you agree to follow the project Code of Conduct.
