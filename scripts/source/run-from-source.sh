#!/bin/sh
# CrunchyMurmur source bootstrap for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/scripts/source/run-from-source.sh | sh
#
# Downloads an exact commit archive from GitHub, installs locked dependencies,
# validates the checkout, and launches CrunchyMurmur. Git is not required.

set -eu

REPOSITORY="${CRUNCHYMURMUR_REPOSITORY:-a-streetcoder/CrunchyMurmur}"
REF="${CRUNCHYMURMUR_REF:-main}"
DESTINATION="${CRUNCHYMURMUR_SOURCE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/crunchymurmur-source}"
LAUNCH=1
CHECKS=1

usage() {
  cat <<'EOF'
Usage: run-from-source.sh [options]

  --ref REF          Git branch, tag, or commit to build (default: main)
  --directory PATH   Persistent source directory
  --no-launch        Build and validate without opening the app
  --skip-checks      Skip npm run check
  --help             Show this help

When piping the script, pass options with: sh -s -- --no-launch
EOF
}

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
note() { printf '  %s\n' "$*"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ref) [ "$#" -ge 2 ] || die '--ref requires a value'; REF="$2"; shift 2 ;;
    --directory) [ "$#" -ge 2 ] || die '--directory requires a value'; DESTINATION="$2"; shift 2 ;;
    --no-launch) LAUNCH=0; shift ;;
    --skip-checks) CHECKS=0; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

command -v curl >/dev/null 2>&1 || die 'curl is required.'
command -v tar >/dev/null 2>&1 || die 'tar is required.'
command -v node >/dev/null 2>&1 || die 'Node.js 22.12 or newer is required: https://nodejs.org/'
command -v npm >/dev/null 2>&1 || die 'npm is required.'

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' \
  || die "Node.js 22.12 or newer is required (found $(node --version))."

PARENT_INPUT=$(dirname "$DESTINATION")
NAME=$(basename "$DESTINATION")
mkdir -p "$PARENT_INPUT"
PARENT=$(cd "$PARENT_INPUT" && pwd -P)
DESTINATION="$PARENT/$NAME"
HOME_REAL=$(cd "$HOME" && pwd -P)
case "$DESTINATION" in
  /|"$HOME_REAL") die "Refusing unsafe source directory: $DESTINATION" ;;
esac

WORK=$(mktemp -d "${TMPDIR:-/tmp}/crunchymurmur-source.XXXXXX")
STAGE=$(mktemp -d "$PARENT/.crunchymurmur-source.new.XXXXXX")
BACKUP="$PARENT/.crunchymurmur-source.backup.$$"
cleanup() {
  rm -rf "$WORK" "$STAGE"
  if [ -d "$BACKUP" ] && [ ! -e "$DESTINATION" ]; then mv "$BACKUP" "$DESTINATION"; fi
}
trap cleanup EXIT HUP INT TERM

printf 'CrunchyMurmur source bootstrap\n'
note "Resolving $REPOSITORY@$REF"
ENCODED_REF=$(node -p 'encodeURIComponent(process.argv[1])' "$REF")
curl -fsSL --retry 3 \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: CrunchyMurmur-Source-Bootstrap' \
  "https://api.github.com/repos/$REPOSITORY/commits/$ENCODED_REF" \
  -o "$WORK/commit.json"
COMMIT=$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1], "utf8")).sha; if (!/^[a-f0-9]{40}$/.test(value || "")) process.exit(1); process.stdout.write(value)' "$WORK/commit.json") \
  || die "Could not resolve $REF to a commit."
note "Downloading commit $COMMIT"
curl -fL --retry 3 \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: CrunchyMurmur-Source-Bootstrap' \
  "https://api.github.com/repos/$REPOSITORY/tarball/$COMMIT" \
  -o "$WORK/source.tar.gz"
tar -xzf "$WORK/source.tar.gz" --strip-components=1 -C "$STAGE"
[ -f "$STAGE/package-lock.json" ] || die 'Downloaded archive is not a CrunchyMurmur source tree.'

note 'Installing locked dependencies'
(cd "$STAGE" && npm ci)
if [ "$CHECKS" = 1 ]; then
  note 'Running project validation'
  (cd "$STAGE" && npm run check && npm run release:check)
fi
printf '%s\n' "$COMMIT" > "$STAGE/.source-commit"

if [ -e "$DESTINATION" ]; then mv "$DESTINATION" "$BACKUP"; fi
mv "$STAGE" "$DESTINATION"
STAGE="$PARENT/.crunchymurmur-source.installed"
rm -rf "$BACKUP"
rm -rf "$WORK"
WORK="${TMPDIR:-/tmp}/crunchymurmur-source.installed"

printf '\nSource build ready.\n'
note "Commit: $COMMIT"
note "Directory: $DESTINATION"
if [ "$LAUNCH" = 1 ]; then
  note 'Launching CrunchyMurmur'
  cd "$DESTINATION"
  exec npm start
else
  note "Launch later with: cd \"$DESTINATION\" && npm start"
fi
