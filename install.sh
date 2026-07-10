#!/bin/sh
set -eu

repository="${CRUNCHYMURMUR_REPOSITORY:-almoretti/CrunchyMurmur-Windows}"
base="https://github.com/$repository/releases/latest/download"
os="$(uname -s)"
machine="$(uname -m)"

case "$machine" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "Unsupported architecture: $machine" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
curl -fL --retry 3 "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"

verify() {
  asset="$1"
  expected="$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1; exit }' "$tmp/SHA256SUMS")"
  test -n "$expected" || { echo "No checksum published for $asset" >&2; exit 1; }
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
  fi
  test "$actual" = "$expected" || { echo "SHA-256 verification failed for $asset" >&2; exit 1; }
  echo "Verified $asset ($actual)"
}

case "$os" in
  Darwin)
    asset='CrunchyMurmur-mac-universal.dmg'
    curl -fL --retry 3 "$base/$asset" -o "$tmp/$asset"
    verify "$asset"
    mkdir -p "$tmp/mount" "$HOME/Applications"
    hdiutil attach -nobrowse -readonly -mountpoint "$tmp/mount" "$tmp/$asset" >/dev/null
    trap 'hdiutil detach "$tmp/mount" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT HUP INT TERM
    ditto "$tmp/mount/CrunchyMurmur.app" "$HOME/Applications/CrunchyMurmur.app"
    hdiutil detach "$tmp/mount" >/dev/null
    echo 'Installed CrunchyMurmur in ~/Applications.'
    ;;
  Linux)
    asset="CrunchyMurmur-linux-$arch.AppImage"
    curl -fL --retry 3 "$base/$asset" -o "$tmp/$asset"
    verify "$asset"
    mkdir -p "$HOME/.local/lib/crunchymurmur" "$HOME/.local/bin"
    install -m 0755 "$tmp/$asset" "$HOME/.local/lib/crunchymurmur/CrunchyMurmur.AppImage"
    ln -sf "$HOME/.local/lib/crunchymurmur/CrunchyMurmur.AppImage" "$HOME/.local/bin/crunchymurmur"
    echo 'Installed CrunchyMurmur. Ensure ~/.local/bin is on PATH, then run: crunchymurmur'
    ;;
  *) echo "Unsupported operating system: $os" >&2; exit 1 ;;
esac

