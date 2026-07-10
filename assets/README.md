# Brand assets

This directory contains only the canonical assets consumed by the application and packaging:

- `brand-mark.svg` and `brand-mark.png` for the application and README;
- `icon-palette.ico` for Windows packages;
- `tray-palette.png` for the tray and window chrome.

Regenerate platform derivatives with `scripts/build-brand-assets.py`, `scripts/prepare-macos-icon.sh`, and `scripts/prepare-linux-icons.sh`. Do not commit exploratory or full-resolution design exports here.
