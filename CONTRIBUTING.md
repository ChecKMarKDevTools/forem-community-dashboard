# Contributing to DEV Community Dashboard

So you want to contribute. That's great — genuinely. This project started as a weekend challenge sprint and has grown into something I'm maintaining based on real use patterns and cost impact. That means the bar for what gets merged is directly tied to what's actually being used — not what's theoretically useful.

Read this fully before opening a PR. Not because I'm trying to discourage you, but because it will save us both a lot of time.

---

## On AI-Generated Code

This project uses AI tooling to generate code — and that is exactly why the guardrails are as strict as they are. AI writes plausible-looking code that is sometimes subtly wrong. The pre-commit hooks, Sonar analysis, coverage requirements, and CI gates all exist to catch what AI misses.

If you're using AI to contribute: good. So am I. Use it with the safety net on, not as a substitute for it.

---

## Who Can Contribute

This project is licensed under [Polyform Shield 1.0.0](./LICENSE). You can fork it, adapt it, use it for your own workflows, inside your company, for client projects, demos, or education — as long as you're not selling it, charging for it, or making money from the project itself.

That applies to contributions too. If you open a PR, you're agreeing your contribution falls under the same terms.

If you're contributing as part of a monetized product, stop here and [reach out first](mailto:human@checkmarkdevtools.dev).

---

## Setup

**Requirements:** Node.js 20+, pnpm, Docker (for Hadolint), a Supabase project, a DEV.to API key.

```bash
pnpm install
cp .env.example .env.local   # then fill it in — yes, all of it
```

Environment variables you'll need:

| Variable                               | What it is                                          |
| -------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | New-style publishable key — not the legacy anon key |
| `SUPABASE_SECRET_KEY`                  | New-style secret key — not service_role             |
| `DEV_API_KEY`                          | Your DEV.to API key                                 |
| `CRON_SECRET`                          | Any random string; authenticates the cron endpoint  |

**Development server:**

```bash
make dev
```

When you need to stop it: kill the `next-server` process specifically.

```bash
ps aux | grep '[n]ext'
kill <pid>
```

Do not kill by port. You will take out unrelated processes and you'll spend ten minutes wondering why Spotify stopped working.

---

## Before You Write Any Code

Read [AGENTS.md](./AGENTS.md). It's the authoritative rule set for how this codebase is maintained. What's in there isn't optional guidance — it's how PRs get reviewed.

The short version of what will get a PR closed immediately:

- Short-term fixes. The goal is always a maintainable, secure, reliable solution.
- Missing tests. Every new feature needs positive, negative, error, exception, and edge case coverage. Integration tests and performance tests too.
- Hidden metrics. Every signal the pipeline computes must be visible somewhere in the UI — with enough context that users understand why a value is what it is.

---

## Pre-Commit Checklist

Lefthook will catch most of this automatically on commit. Run it yourself first anyway so you're not surprised mid-commit:

```bash
make ai-checks
```

Or step by step:

```bash
make format
make lint
make test
make security
```

Before committing, also run SonarQube analysis on **all** source files — not just the files you changed. Fix everything it flags before you push. SonarCloud is a required CI gate.

---

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). GPG signed. `Signed-off-by`. Co-authored attribution if AI tooling helped write any of it.

Each commit addresses **one concern** — not five things bundled together because it was convenient.

```
type(scope): short imperative description

Longer explanation if the why isn't obvious from the diff.

Co-Authored-By: Your Name <email@example.com>
Signed-off-by: Your Name <email@example.com>
```

Valid types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

To sign:

```bash
git commit -S -s -m "feat(sync): your message"
```

---

## CI

All checks live in `.github/workflows/ci.yml`. That's the rule — don't add separate workflow files for individual checks. If CI fails, fix the underlying issue. Don't skip hooks, don't bypass signing, don't add `--no-verify` and hope nobody notices.

---

## Pull Requests

- Branch off `main`. Pull latest before you start.
- Small, focused PRs get reviewed. A PR that touches 12 files and says "misc improvements" does not — at least not quickly.
- Respond to review comments inline, in the thread. A top-level comment that says "addressed all feedback" with no inline replies is not a response.
- If you're not sure whether your change is in scope, open a discussion or an issue first. It's genuinely faster than writing code that won't merge.

---

## Code Style

Prettier handles formatting. ESLint handles everything else. If you're fighting the linter, the linter is probably right.

TypeScript strict mode is on. `any` requires justification. Inline overrides (`eslint-disable`, `@ts-ignore`, etc.) require a comment explaining why the override exists — not just what it overrides.

---

## Tests

Coverage targets aren't vanity metrics here — they're load-bearing. Current coverage is ~97% statements. Don't crater it.

New tests go next to the code they test. Integration tests go in `src/app/api/__tests__/integration.test.ts`. Performance tests live in `performance.test.ts` and are gated behind `PERF_TESTS=true`.

Lighthouse accessibility is configured at ≥90%. If your UI changes bring that score down, they won't merge.

---

## Questions

Open an issue. Or reach out at [human@checkmarkdevtools.dev](mailto:human@checkmarkdevtools.dev) if it's something that doesn't belong in a public thread.

---

Thanks for reading this far. It means you're probably the kind of contributor who doesn't need most of this — but it had to be written down somewhere.
