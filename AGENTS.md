# AI Rules for forem-community-dashboard

- **Inline Overrides**: All inline overrides MUST require a comment explaining why the override exists.
- **Preference**: Prefer proper configuration files (e.g., `.hadolint.yaml`, `.stylelintrc`) to inline overrides when feasible.
- **Deployment**: This project uses Google Cloud Run for deployment (`deploy.sh`). Always consider Cloud Run specs for environment variables and build steps.
- **Supabase Keys**: This project adheres to the new Supabase API key conventions (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`). Do not use the legacy `anon` and `service_role` keys.
- **Testing**: You MUST implement positive/negative/error/exception/edge case testing for all new features. If you cannot implement a test for a new feature, you MUST explain why and ask for guidance. You are also expected to implement integration tests and performance tests. Lighthouse must be configured for the UI with min 90% accessibility.
- **Security**: You MUST implement security best practices for all new features. If you cannot implement a security best practice for a new feature, you MUST explain why and ask for guidance.
- **Documentation**: You MUST update all relevant documentation for all new features. If you cannot update a documentation for a new feature, you MUST explain why and ask for guidance.
- **Performance**: You MUST implement performance best practices for all new features. If you cannot implement a performance best practice for a new feature, you MUST explain why and ask for guidance.
- **CI**: All checks (format, lint, secret scan, security audit, actionlint, hadolint, tests, build, SonarCloud) MUST live in `.github/workflows/ci.yml`. Do not create separate workflow files for individual checks. Test coverage artifacts MUST be uploaded in CI using `actions/upload-artifact` so SonarCloud and future tooling can consume them.
- **Short-term fixes**: Strictly prohibited at all times in this repo. Your goal is always a long-term maintainable, secure, reliable solution that passes all automated checks and tests.
