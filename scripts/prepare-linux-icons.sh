#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_png="$root/assets/brand-mark.png"
icons="$root/build/icons"

mkdir -p "$icons"
for size in 16 24 32 48 64 128 256 512; do
  convert "$source_png" -gravity center -crop 1024x1024+0+0 +repage -resize "${size}x${size}" "$icons/${size}x${size}.png"
done
