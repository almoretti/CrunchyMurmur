#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_png="$root/assets/New assets/app-icon-mac.png"
iconset="$root/build/icon.iconset"
base="$root/build/icon-mac-square.png"

mkdir -p "$root/build"
rm -rf "$iconset"
mkdir -p "$iconset"
sips --cropToHeightWidth 1024 1024 "$source_png" --out "$base" >/dev/null

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$base" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$base" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$root/build/icon.icns"
