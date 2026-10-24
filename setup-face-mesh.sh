#!/usr/bin/env bash
# Separate Python for local tracking (MediaPipe hands/face, person cutout). Run by `make shorts`.
set -euo pipefail
cd "$(dirname "$0")"
TRACK_PY="${FACE_PYTHON:-python3.12}"
[ -x .venv-face/bin/python ] || "$TRACK_PY" -m venv .venv-face
.venv-face/bin/python -m pip install -q mediapipe==1.1.0 av==19.0.1 pillow==12.3.0 numpy==2.5.3
