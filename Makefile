PY := .venv/bin/python
PORT ?= 8770

.PHONY: help setup deps mesh shorts graphics run doctor test check

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  make %-8s %s\n",$$1,$$2}'

deps: ## Install system tools (Rubber Band) with Homebrew
	@command -v rubberband >/dev/null || brew install rubberband

setup: deps ## One-time setup: system tools, .venv, dependencies, .env
	bash setup.sh

mesh: ## Optional: enable the face-mesh modes (installs Python 3.12)
	@command -v python3.12 >/dev/null || brew install python@3.12
	bash setup-face-mesh.sh

shorts: ## Optional: enable the shorts editor (tracking env, Remotion, local whisper.cpp)
	@test -x .venv-face/bin/python || FACE_PYTHON=$$(command -v python3.12 || command -v python3) bash setup-face-mesh.sh
	@command -v node >/dev/null || { echo "Install Node.js 18+ first (https://nodejs.org)"; exit 1; }
	cd motion && npm ci && node transcribe.mjs
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

doctor: ## Check dependencies, provider and keys (never prints key values)
	$(PY) doctor.py --require-keys

test: ## Run the offline test suite (no paid calls)
	$(PY) -m unittest discover -s tests
	$(PY) test_composite.py

check: test doctor ## Run tests and the readiness check
