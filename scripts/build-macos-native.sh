#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/native
SDK="$(xcrun --sdk macosx --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun swiftc -O -parse-as-library -sdk "$SDK" -target "$ARCH-apple-macos13.0" \
    -framework AppKit -framework CoreGraphics -framework EventKit \
    native/macos/CrunchyMurmurNative.swift \
    -o "build/native/CrunchyMurmurNative-$ARCH"
done
xcrun lipo -create \
  build/native/CrunchyMurmurNative-arm64 \
  build/native/CrunchyMurmurNative-x86_64 \
  -output build/native/CrunchyMurmurNative
rm build/native/CrunchyMurmurNative-arm64 build/native/CrunchyMurmurNative-x86_64
chmod +x build/native/CrunchyMurmurNative
