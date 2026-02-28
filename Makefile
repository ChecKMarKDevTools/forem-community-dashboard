.PHONY: help install test lint format security ai-checks

help:  ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev:  ## Start development server
	pnpm dev

install:  ## Install development dependencies
	pnpm install

test:  ## Run unit and integration tests with coverage
	pnpm run test:coverage

lint:  ## Run linting checks (ESLint & StyleLint)
	pnpm run lint
	pnpm run stylelint

format:  ## Format code with Prettier
	pnpm run format

security:  ## Run package security audit
	pnpm audit

secret-scan:  ## Run secret scanner using TruffleHog in Docker
	docker run --rm -v "$$PWD:/pwd" trufflesecurity/trufflehog:3.93.4 git file:///pwd --fail

actionlint:  ## Run Actionlint in Docker
	docker run --rm -v "$$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.11 -color

hadolint:  ## Run Hadolint in Docker
	docker run --rm -i hadolint/hadolint:v2.14.0 < Dockerfile

ai-checks:  ## Single command: format → lint → security → secret-scan → actionlint → test
	@set -e; \
	echo "🔍 format → lint (eslint + stylelint) → security → secret-scan → actionlint → test"; \
	$(MAKE) format && echo "  ✓ format" || (echo "  ✗ format"; exit 1); \
	$(MAKE) lint && echo "  ✓ lint" || (echo "  ✗ lint"; exit 1); \
	$(MAKE) security && echo "  ✓ security" || (echo "  ✗ security"; exit 1); \
	$(MAKE) secret-scan && echo "  ✓ secret-scan" || (echo "  ✗ secret-scan"; exit 1); \
	$(MAKE) actionlint && echo "  ✓ actionlint" || (echo "  ✗ actionlint"; exit 1); \
	$(MAKE) test && echo "  ✓ test" || (echo "  ✗ test"; exit 1); \
	pnpm run lhci:desktop && echo "  ✓ lhci desktop" || (echo "  ✗ lhci desktop"; exit 1); \
	pnpm run lhci:mobile && echo "  ✓ lhci mobile" || (echo "  ✗ lhci mobile"; exit 1); \
	echo "✅ Ready to commit."

clean:  ## Clean up generated files
	rm -rf .next
	rm -rf node_modules
	rm -rf coverage
