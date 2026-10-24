#!/usr/bin/env bash
# One-time base install: Python environment, packages and an empty .env. Tools are added with make shorts / make graphics.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null || { echo "Python 3.12 or newer is needed: https://www.python.org/downloads/"; exit 1; }
"$PY" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else "Python 3.12 or newer is needed (set PYTHON=/path/to/python3.12).")'
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt
if [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; echo "Created .env: add your own keys there (all optional)."; fi
.venv/bin/python doctor.py
echo
echo "Next: make shorts (Shorts editor), make graphics (Motion graphics), then make run"
