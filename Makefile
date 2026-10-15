PY := .venv/bin/python
PORT ?= 8770

.PHONY: help setup deps mesh run doctor test check

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  make %-8s %s\n",$$1,$$2}'

deps: ## Install system tools (Rubber Band) with Homebrew
	@command -v rubberband >/dev/null || brew install rubberband

setup: deps ## One-time setup: system tools, .venv, dependencies, .env
	bash setup.sh

mesh: ## Optional: enable the face-mesh modes (installs Python 3.12)
	@command -v python3.12 >/dev/null || brew install python@3.12
	bash setup-face-mesh.sh

run: ## Start the app at http://127.0.0.1:8770 (other port: make run PORT=8771)
	PORT=$(PORT) bash start.command

doctor: ## Check dependencies, provider and keys (never prints key values)
	$(PY) doctor.py --require-keys

test: ## Run the offline test suite (no paid calls)
	$(PY) -m unittest discover -s tests
	$(PY) test_composite.py

check: test doctor ## Run tests and the readiness check
