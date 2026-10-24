PY := .venv/bin/python
PORT ?= 8770

.PHONY: help setup shorts graphics run doctor test check

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  make %-8s %s\n",$$1,$$2}'

setup: ## One-time setup: .venv, Python packages, .env
	bash setup.sh

shorts: ## Optional: enable the shorts editor (tracking env, Remotion, local whisper.cpp)
	@test -x .venv-face/bin/python || FACE_PYTHON=$${FACE_PYTHON:-$$(command -v python3.12 || command -v python3)} bash setup-face-mesh.sh
	.venv-face/bin/python -m pip install -q onnxruntime==1.31.0
	@command -v node >/dev/null || { echo "Install Node.js 18+ first (https://nodejs.org)"; exit 1; }
	cd motion && npm ci && node transcribe.mjs && npm run studio:build
	$(PY) -m pip install -q -r requirements.txt
	$(PY) doctor.py --shorts

graphics: ## Optional: enable motion graphics (HyperFrames, GSAP, fonts, local FFmpeg; ~200 MB inside graphics-kit/)
	@node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)' 2>/dev/null || { echo "Install Node.js 22+ first (https://nodejs.org)"; exit 1; }
	cd graphics-kit && npm ci
	HYPERFRAMES_NO_TELEMETRY=1 graphics-kit/node_modules/.bin/hyperframes telemetry disable
	npx --yes skills@1.7.4 add heygen-com/hyperframes -a claude-code -s '*' -y --copy
	$(PY) doctor.py --graphics

run: ## Start the app at http://127.0.0.1:8770 (other port: make run PORT=8771)
	PORT=$(PORT) bash start.command

doctor: ## Check what is installed and which optional keys are set (never prints key values)
	$(PY) doctor.py --all

test: ## Run the offline test suite (no paid calls)
	$(PY) -m unittest discover -s tests

check: test doctor ## Run tests and the readiness check
