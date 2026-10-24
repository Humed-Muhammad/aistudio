#!/usr/bin/env bash
# Humed’s AI Studio: one-step install for Ubuntu 22.04 / 24.04 (also used inside Windows WSL).
# Installs what is missing (build tools, Python 3.12, Node.js 22, Chrome, emoji font, Claude Code), then all three tools.
# Safe to run again: finished steps are skipped. Makes no paid API calls. Asks for your sudo password once.
#   bash install-ubuntu.sh
set -euo pipefail
cd "$(dirname "$0")"
step(){ printf '\n\033[1;33m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mStopped:\033[0m %s\n' "$*"; exit 1; }
node_ok(){ command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)'; }

[ "$(uname -s)" = Linux ] || fail "This installer is for Ubuntu. On a Mac run: bash install-mac.sh"
command -v apt-get >/dev/null || fail "apt-get not found: this installer supports Ubuntu (and Debian-based systems)."
# Files copied from Windows can carry CRLF line endings, which break bash and make.
sed -i 's/\r$//' ./*.sh Makefile start.command 2>/dev/null || true

step "System packages (build tools, git, curl, emoji and Ethiopic fonts)"
sudo apt-get update -y
sudo apt-get install -y build-essential git curl ca-certificates software-properties-common \
  fonts-noto-color-emoji fonts-noto-core

step "Python 3.12"
if ! command -v python3.12 >/dev/null; then
  sudo add-apt-repository -y ppa:deadsnakes/ppa
  sudo apt-get update -y
fi
sudo apt-get install -y python3.12 python3.12-venv python3.12-dev
PY="$(command -v python3.12)"

step "Node.js 22 or newer"
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node_ok || fail "Node.js 22+ is still missing (found $(node -v 2>/dev/null || echo none))."

step "Google Chrome"
if [ "$(dpkg --print-architecture)" = amd64 ]; then
  if ! command -v google-chrome >/dev/null; then
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt-get install -y "$tmp/chrome.deb"
    rm -rf "$tmp"
  fi
else
  echo "Google Chrome has no ARM build for Linux: rendering uses Remotion's bundled browser instead."
fi

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

printf '\n\033[1;32mDone.\033[0m Start the studio with \033[1mmake run\033[0m, then open http://127.0.0.1:8770\n'
grep -qi microsoft /proc/version 2>/dev/null && printf 'On Windows, open that address in your normal Windows browser.\n'
printf 'Optional keys go in .env: ANTHROPIC_API_KEY (one-click edits), ELEVENLABS_API_KEY (Amharic transcripts).\n'
