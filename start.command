#!/usr/bin/env bash
# Double-click (or `make run`) to open Humed’s AI Studio at http://127.0.0.1:8770. It listens on this Mac only.
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "${PORT:-8770}"
