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
- **PR Review Responses**: All responses to PR review comments MUST be posted as inline replies to the specific comment thread. Never post a standalone top-level PR comment as a substitute for inline replies.
- **Next.js Dev Server**: When shutting down Next.js, only kill the specific `next dev` / `next-server` processes (e.g., `ps aux | grep '[n]ext'`). NEVER use broad port-range kills (`kill` by port) as they destroy unrelated processes (Spotify, Discord, etc.).
- **SonarQube Analysis**: Run Sonar checks on ALL source files before committing, not just changed files. Use the `mcp__sonarqube-checkmark__analyze_code_snippet` tool with projectKey `ChecKMarKDevTools_forem-community-dashboard`. Fix all issues before proceeding.
- **Commits**: Make small, atomic commits with clear Conventional Commit messages. Each commit should address a single concern (e.g., one for scoring fixes, one for tests, one for docs). Always include the `Signed-off-by` flag (`-s`), the `Co-Authored-By` attribution line, and always use GPG signing (`-S`).
- **Pre-commit Workflow**: Before committing, always: (1) run Sonar on all code, (2) ensure test coverage follows AGENTS.md testing rules, (3) update relevant documentation, (4) run all CI checks (`pnpm format:check`, `pnpm lint`, `pnpm test`, `pnpm build`).
- **UI Verification**: When working on UI changes, you MUST use browser automation tools to navigate to the page and visually verify results from the user's perspective before returning a response. Never assume UI changes are correct without seeing them rendered.
- **Metric Transparency**: Every metric the pipeline computes MUST be visible somewhere in the UI. No hidden metrics. If a score is derived from specific signals (e.g., keyword matches), the contributing signals must be surfaceable (e.g., via hover/tooltip). Users must be able to understand _why_ a value is what it is.

## Database Schema Notes

- **`articles.metrics`**: JSONB column (`DEFAULT '{}'`) storing per-article analytics computed during sync. Contains velocity buckets, commenter shares, interaction signal spread (substantive/mixed/surface-level), per-comment interaction scores (tone, relevance, depth, constructiveness), topic tags, and risk component breakdown. See `src/types/metrics.ts` for the `ArticleMetrics` interface.
- **`commenters.username`**: Nullable (`TEXT`). Forem returns `null` usernames for deleted accounts. The sync pipeline skips identity-dependent tracking (unique commenter set, commenter counts) for null usernames but still processes the comment's text and timestamps.

## Chart Component Patterns

- All chart components live in `src/components/ui/charts/` with a barrel export at `index.ts`.
- Charts are custom SVG — no external chart library. This keeps the dependency count minimal and allows full theme control.
- Theme colors use CSS custom properties: `--chart-grid`, `--chart-axis`, `--chart-series-primary`, `--chart-series-secondary`, `--chart-series-tertiary` (defined in `globals.css`).
- Component prop types must use `Readonly<T>` and array props must use `ReadonlyArray<T>` (Sonar S6759).
- Each chart component handles its own empty state (returns "No data available" or `null`).
- `ChartContainer` wraps every chart — reuses `SectionCard`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`.
- Data transformation from `ArticleMetrics` → chart props happens in `src/lib/metrics-helpers.ts` (not inside components).
- The Post Analytics section in `Dashboard.tsx` is always rendered; when `metrics` is `null` or missing, the individual chart components surface their own empty states in accordance with the rules above.
