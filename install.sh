#!/usr/bin/env sh
set -eu

REPO_URL="https://github.com/MeanLesss/opencode-file-browser.git"
TESTED_VERSION="1.19.5"

PROJECT=""
SKIP_DEPS=0
NO_CLONE=0

usage() {
  cat <<'EOF'
opencode-file-browser installer

Usage:
  ./install.sh [options]

Options:
  --project <path>   Install into this project's config instead of the global config.
  --skip-deps        Skip the dependency install (useful for repeated runs).
  --no-clone         Do not clone the repo automatically.
  -h, --help         Show this help.

One-line install:
  curl -fsSL https://raw.githubusercontent.com/MeanLesss/opencode-file-browser/main/install.sh | sh
EOF
}

info() { printf '  %s\n' "$*"; }
good() { printf '  %s\n' "$*"; }
warn() { printf '  %s\n' "$*" >&2; }
fail() { printf 'x %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      [ $# -ge 2 ] || fail "--project needs a path"
      PROJECT=$2
      shift 2
      ;;
    --project=*)
      PROJECT=${1#*=}
      shift
      ;;
    --skip-deps)
      SKIP_DEPS=1
      shift
      ;;
    --no-clone)
      NO_CLONE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1 (try --help)"
      ;;
  esac
done

printf '\nopencode-file-browser installer\n\n'

# 1. Locate the plugin. When piped through sh, $0 is "sh", so clone instead.
case "$0" in
  sh|*/sh|dash|*/dash|bash|*/bash|-*|"")
    SCRIPT_DIR=""
    ;;
  *)
    SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)
    ;;
esac

if [ -z "$SCRIPT_DIR" ] || [ ! -f "$SCRIPT_DIR/package.json" ]; then
  SCRIPT_DIR="${HOME}/opencode-file-browser"
fi

if [ ! -f "$SCRIPT_DIR/package.json" ]; then
  if [ "$NO_CLONE" -eq 1 ]; then
    fail "Could not find the plugin at '$SCRIPT_DIR'. Clone the repo or run this script from inside it."
  fi
  if [ -e "$SCRIPT_DIR" ]; then
    fail "The folder '$SCRIPT_DIR' already exists but does not contain package.json. Move it, or clone the repo elsewhere and run this script from there."
  fi
  command -v git >/dev/null 2>&1 || fail "Git is required for the automatic download. Install Git, or clone the repo manually."
  info "Downloading opencode-file-browser to $SCRIPT_DIR"
  git clone --depth 1 "$REPO_URL" "$SCRIPT_DIR" || fail "git clone failed."
fi

SCRIPT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR" && pwd)

# 2. Detect opencode and check the major version.
command -v opencode >/dev/null 2>&1 || fail "opencode was not found on PATH. Install opencode 1.x first: https://opencode.ai"

RAW=$(opencode --version 2>/dev/null | head -n 1 | tr -d '\r' || true)
[ -n "$RAW" ] || fail "Could not run 'opencode --version'."

VERSION=$(printf '%s' "$RAW" | sed -n 's/.*\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -n 1)
[ -n "$VERSION" ] || fail "Could not parse the opencode version from '$RAW'."

OLD_IFS=$IFS
IFS=.
# shellcheck disable=SC2086
set -- $VERSION
IFS=$OLD_IFS
MAJOR=${1:-0}
MINOR=${2:-0}
PATCH=${3:-0}

if [ "$MAJOR" -ne 1 ]; then
  fail "Detected opencode $VERSION. This plugin supports opencode 1.x only ($TESTED_VERSION or newer recommended)."
fi

good "Detected opencode $VERSION"

if [ "$MINOR" -lt 19 ] || { [ "$MINOR" -eq 19 ] && [ "$PATCH" -lt 5 ]; }; then
  warn "This plugin is tested with opencode $TESTED_VERSION. On $VERSION some actions may fall back to older behavior."
fi

# 3. Install runtime dependencies.
if [ "$SKIP_DEPS" -eq 0 ]; then
  info "Installing plugin dependencies..."
  if command -v npm >/dev/null 2>&1; then
    (cd "$SCRIPT_DIR" && npm install --omit=dev --no-audit --no-fund) || fail "Dependency install failed."
  elif command -v bun >/dev/null 2>&1; then
    (cd "$SCRIPT_DIR" && bun install --production) || fail "Dependency install failed."
  else
    fail "npm or bun is required once to install the plugin dependencies."
  fi
  good "Dependencies installed"
else
  info "Skipping dependency install"
fi

# Windows' opencode expects a Windows path. Git Bash provides cygpath; on
# macOS/Linux this is a no-op.
PLUGIN_SPEC=$SCRIPT_DIR
if command -v cygpath >/dev/null 2>&1; then
  PLUGIN_SPEC=$(cygpath -w "$SCRIPT_DIR")
fi

# 4. Register the plugin. opencode writes the server entry to opencode.jsonc
# and the TUI entry to tui.json for us, preserving existing JSONC content.
info "Registering the plugin with opencode..."
if [ -n "$PROJECT" ]; then
  [ -d "$PROJECT" ] || fail "Project folder not found: $PROJECT"
  PROJECT=$(CDPATH= cd -- "$PROJECT" && pwd)
  (cd "$PROJECT" && opencode plugin "$PLUGIN_SPEC") || fail "opencode could not register the plugin. Add '$PLUGIN_SPEC' to opencode.jsonc and tui.json manually (see README.md)."
  SCOPE=$PROJECT
else
  opencode plugin "$PLUGIN_SPEC" -g || fail "opencode could not register the plugin. Add '$PLUGIN_SPEC' to opencode.jsonc and tui.json manually (see README.md)."
  SCOPE="global"
fi

good "Plugin registered ($SCOPE)"
printf '\n'
good "Done. Restart opencode, then run /files."
printf '\n'
