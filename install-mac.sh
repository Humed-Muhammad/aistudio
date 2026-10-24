#!/usr/bin/env bash
# Humed’s AI Studio: one-step install for macOS (Apple Silicon or Intel).
# Installs what is missing (Homebrew, Python 3.12, Node.js, Chrome, Claude Code), then all three tools.
# Safe to run again: finished steps are skipped. Makes no paid API calls.
#   bash install-mac.sh
set -euo pipefail
cd "$(dirname "$0")"
step(){ printf '\n\033[1;33m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mStopped:\033[0m %s\n' "$*"; exit 1; }
node_ok(){ command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)'; }

[ "$(uname -s)" = Darwin ] || fail "This installer is for macOS. On Ubuntu run: bash install-ubuntu.sh"

if ! xcode-select -p >/dev/null 2>&1; then
  step "Installing Apple's command line tools"
  xcode-select --install || true
  fail "Finish the Apple pop-up window (Install), then run this script again."
fi

if ! command -v brew >/dev/null; then
  step "Installing Homebrew (it asks for your Mac password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
command -v brew >/dev/null || fail "Homebrew is not on PATH. Open a new Terminal window and run this script again."

step "Python 3.12"
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
PY="$(brew --prefix python@3.12)/bin/python3.12"
[ -x "$PY" ] || fail "Python 3.12 was not found after installing it."

step "Node.js 22 or newer"
if ! node_ok; then brew list node >/dev/null 2>&1 && brew upgrade node || brew install node; fi
node_ok || fail "Node.js $(node -v 2>/dev/null) is older than 22 and comes from outside Homebrew (nvm?). Switch to Node 22+ and run again."

step "Google Chrome"
[ -d "/Applications/Google Chrome.app" ] || brew install --cask google-chrome

step "Claude Code (for Motion graphics builds and edits by Claude)"
if ! command -v claude >/dev/null && [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash || echo "Claude Code did not install; Motion graphics builds need it later: https://claude.com/claude-code"
fi

step "Python packages and .env"
PYTHON="$PY" bash setup.sh

step "Shorts editor + Audio cleaner (tracking, Remotion, whisper.cpp, studio UI)"
FACE_PYTHON="$PY" make shorts

step "Motion graphics (HyperFrames, local FFmpeg)"
make graphics

step "Checking everything"
.venv/bin/python doctor.py --all || true

printf '\n\033[1;32mDone.\033[0m Start the studio with \033[1mmake run\033[0m (or double-click start.command), then open http://127.0.0.1:8770\n'
printf 'Optional keys go in .env: ANTHROPIC_API_KEY (one-click edits), ELEVENLABS_API_KEY (Amharic transcripts).\n'
