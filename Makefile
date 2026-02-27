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
	docker run --rm -v "$$PWD:/pwd" trufflesecurity/trufflehog:latest git file:///pwd --fail

ai-checks:  ## Single command: format → lint → security → secret-scan → test
	@set -e; \
	echo "🔍 format → lint (eslint + stylelint) → security → secret-scan → test"; \
	$(MAKE) format && echo "  ✓ format" || (echo "  ✗ format"; exit 1); \
	$(MAKE) lint && echo "  ✓ lint" || (echo "  ✗ lint"; exit 1); \
	$(MAKE) security && echo "  ✓ security" || (echo "  ✗ security"; exit 1); \
	$(MAKE) secret-scan && echo "  ✓ secret-scan" || (echo "  ✗ secret-scan"; exit 1); \
	$(MAKE) test && echo "  ✓ test" || (echo "  ✗ test"; exit 1); \
	echo "✅ Ready to commit."

clean:  ## Clean up generated files
	rm -rf .next
	rm -rf node_modules
	rm -rf coverage
