# DEV Community Dashboard

![DEV Community Dashboard Banner](public/dev-weekend-challenge-banner-community-dashboard.png)

A signal-surfacing tool for [Forem](https://forem.com/) communities (dev.to and self-hosted instances). It ingests the latest posts via the public Forem API, classifies each one into attention categories (Awaiting Collaboration, Anomalous Signal, Trending Signal, Rapid Discussion, Steady Signal), and persists the results in Supabase so community helpers can see where conversations need a human eye.

This is **not** a moderation tool or a scorecard. It is designed to help helpers know where to look.

**Production:** [https://dev-signal.checkmarkdevtools.dev](https://dev-signal.checkmarkdevtools.dev) _(Cloud Run — deployed post-initial-release)_

---

## Architecture

### System Overview

```mermaid
graph TB
  subgraph External
    FOREM["Forem API\n(dev.to)"]
    GHA["GitHub Actions\ncron.yml"]
  end

  subgraph CloudRun["Cloud Run"]
    APP["Next.js App\ndev-signal.checkmarkdevtools.dev"]
  end

  subgraph Supabase
    DB[("PostgreSQL\narticles · users · commenters")]
  end

  Browser((Browser)) -->|"GET /api/posts\nGET /api/posts/:id"| APP
  GHA -->|"POST /api/cron\n(Bearer token)"| APP
  APP -->|"getLatestArticles · getUserByUsername · getComments · getArticle\n(exponential-backoff retry on 429)"| FOREM
  APP -->|"upsert / SELECT / DELETE"| DB
```

### Background Sync Flow

Triggered by the GitHub Actions cron or `workflow_dispatch`. Each run fetches articles page-by-page (100/page) until the oldest article on a page exceeds the 5-day (120 h) sync window, filters to the 2 h – 120 h age range, deep-scores every valid article, backfills any articles with empty metrics, upserts results, and purges articles older than 5 days.

```mermaid
sequenceDiagram
  participant GHA as GitHub Actions
  participant Cron as POST /api/cron
  participant Sync as syncArticles
  participant FC as ForemClient
  participant SB as Supabase

  GHA->>Cron: POST (Authorization: Bearer)
  Cron->>Sync: syncArticles()
  Sync->>FC: getLatestArticles(page N, 100) [loop until age > 120h]
  FC-->>Sync: ForemArticle[] (all valid articles in 5-day window)
  Note over Sync: Filter 2h–120h window, deep-process all

  loop For each article in window
    Sync->>FC: getUserByUsername(author) [cached]
    FC-->>Sync: ForemUser | null
    Sync->>FC: getComments(articleId)
    FC-->>Sync: ForemComment[]
    Note over Sync: Compute metrics → classify category
    Sync->>SB: upsert users row (once per unique author)
    Sync->>SB: upsert articles row (score, category, metrics, explanations)
    Sync->>SB: upsert commenters rows
  end

  Note over Sync,SB: Backfill — find articles with empty metrics
  Sync->>SB: SELECT articles WHERE metrics = '{}'
  SB-->>Sync: stale article IDs

  loop For each stale article
    Sync->>FC: getArticle(id) [fetch by ID]
    FC-->>Sync: ForemArticle
    Note over Sync: Re-run deep scoring pipeline
    Sync->>SB: upsert article with computed metrics
  end

  Note over Sync,SB: Purge — remove articles older than 5 days
  Sync->>SB: DELETE articles WHERE published_at < now - 120h
  SB-->>Sync: purged count

  Sync-->>Cron: {synced, failed, errors[]}
  Cron-->>GHA: {success, synced, failed, errors[]}
```

### User Interaction Flow

The dashboard is a read-only Next.js client that fetches pre-scored data from Supabase via the API layer. Post titles link directly to dev.to (or the canonical Forem URL) so helpers can jump straight into the conversation.

```mermaid
sequenceDiagram
  participant U as User
  participant D as Dashboard (React)
  participant Posts as GET /api/posts
  participant Detail as GET /api/posts/:id
  participant SB as Supabase
  participant F as dev.to / Forem

  U->>D: Open dashboard
  D->>Posts: fetch()
  Posts->>SB: SELECT articles WHERE published_at >= now-120h ORDER BY (non-NORMAL first, score DESC) LIMIT 50
  SB-->>Posts: scored article rows
  Posts-->>D: article list
  D-->>U: Ranked list — actionable categories first (Awaiting Collaboration, Anomalous Signal, etc.), then Steady Signal

  U->>D: Click a post
  D->>Detail: fetch(/api/posts/42)
  Detail->>SB: SELECT article by id
  Detail->>SB: SELECT 5 most recent posts by same author
  SB-->>Detail: article + recent_posts[]
  Detail-->>D: PostDetails
  D-->>U: Detail panel (signals, discussion state, thread momentum, post analytics, recent posts by author)

  U->>F: Click post title to open on dev.to / Forem
  Note over U,F: Helper reads the thread and decides how to engage
```

---

## Scoring Engine

Each article is classified at sync time (not at read time) into one of four attention categories, or `NORMAL` if no thresholds are met. The pipeline first computes common metrics, then applies category-specific IF logic.

### Common Metrics

| Metric               | Formula                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `word_count`         | Exact word count of the article body                                   |
| `comments_per_hour`  | `comment_count / max(1, time_since_post / 60)`                         |
| `avg_comment_length` | `total_comment_words / max(1, comment_count)`                          |
| `reply_ratio`        | `replies_with_parent / max(1, comment_count)`                          |
| `author_post_freq`   | Posts by the same author in the last 24 h                              |
| `effort`             | `log2(word_count + 1) + unique_commenters + (avg_comment_length / 40)` |
| `exposure`           | `max(1, reactions + comments)`                                         |
| `attention_delta`    | `effort - log2(exposure + 1)`                                          |

### Categories

| Category                 | Dashboard Label        | Key Conditions                                                                                                                  |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **NEEDS_RESPONSE**       | Awaiting Collaboration | `time_since_post >= 30 min` AND `support_score >= 3` (first post, no reactions, no comments, help words)                        |
| **POSSIBLY_LOW_QUALITY** | Anomalous Signal       | `risk_score >= 4` (high post freq, short body, no engagement, author promo keywords, repeated links, minus engagement credit)   |
| **NEEDS_REVIEW**         | Rapid Discussion       | `comments >= 6` AND `heat_score >= 5` AND `reactions / comments < 1.2`                                                          |
| **BOOST_VISIBILITY**     | Trending Signal        | `word_count >= 600` AND `unique_commenters >= 2` AND `avg_comment_length >= 18` AND `reactions <= 5` AND `attention_delta >= 3` |
| **NORMAL**               | Steady Signal          | Default when no category thresholds are met; also forced for `devteam` org posts (weekly threads, challenges)                   |

### Sub-Scores

| Sub-Score       | Components                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `heat_score`    | `comments_per_hour + reply_ratio * 3 + alternating_pairs + sentiment_flips`                                                                |
| `risk_score`    | `max(0, freq_penalty + (word_count < 120 ? 2 : 0) + (no engagement ? 2 : 0) + author_promo_keywords + repeated_links - engagement_credit)` |
| `freq_penalty`  | `max(0, author_post_freq - 2) * 2` (only penalizes > 2 posts/day)                                                                          |
| `engage_credit` | `(reactions >= 10 ? 2 : 0) + (unique_commenters >= 5 ? 1 : 0)` (offsets risk for high-traction posts)                                      |
| `support_score` | `(first_post ? 2 : 0) + (no reactions ? 1 : 0) + (no comments ? 2 : 0) + help_keywords`                                                    |

### Dashboard Signal Display

The detail panel groups information into three sections. These are display-level labels, not scoring inputs.

| Section                  | Shows                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Conversation Signals** | Per-thread metrics: Word Count, Participants, Effort Level, Attention Shift (values rounded to integers)   |
| **Discussion State**     | Activity Level, Signal Divergence (with risk markers), and Constructiveness with qualitative labels        |
| **Thread Momentum**      | A one-line observation about the current pace of the conversation                                          |
| **Post Analytics**       | Per-post visualizations always rendered; charts show empty states when metrics are unavailable (see below) |

### Post Analytics Visualizations

The detail panel renders five chart types for each post. These show motion and trajectory for a single post against its own baselines — never comparing posts to each other.

| Chart                          | Component            | Data Source                     | What It Shows                                                                             |
| ------------------------------ | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| **Reply Velocity**             | `LineChart`          | `velocity_buckets`              | Hourly comment arrivals with a dashed baseline (average)                                  |
| **Participation Distribution** | `HorizontalBarChart` | `commenter_shares`              | Top 5 commenters by share of total comments                                               |
| **Sentiment Spread**           | `DivergingBar`       | `positive/neutral/negative_pct` | 3-segment bar showing sentiment balance                                                   |
| **Constructiveness Trend**     | `LineChart`          | `constructiveness_buckets`      | Average reply depth per hour (higher = more threaded discussion)                          |
| **Contributing Signals**       | `MarkerTimeline`     | `risk_components`               | The specific risk factors detected; each marker shows a signal that raised the risk score |

All charts are custom SVG components with zero external chart dependencies. They use the CSS custom property theme (`--chart-grid`, `--chart-axis`, `--chart-series-primary/secondary/tertiary`) for automatic light/dark mode support.

---

## Running Locally

### Prerequisites

- Node.js ≥ 20
- pnpm
- A [Supabase](https://supabase.com/) project with RLS migrations applied

```bash
# Apply the RLS policy migration to your Supabase project
supabase db push
# or run supabase/migrations/0001_rls_policies.sql manually in the SQL editor
```

### Environment Variables

Create a `.env` file in the project root with the following:

| Variable                   | Required | Description                                        |
| -------------------------- | -------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes      | Supabase project URL                               |
| `SUPABASE_SECRET_KEY`      | Yes      | Server-only key; bypasses RLS for sync writes      |
| `CRON_SECRET`              | Yes      | Bearer token for `/api/cron` and `/api/admin/seed` |
| `DEV_API_KEY`              | No       | Optional; raises Forem API rate limits             |

> `SUPABASE_SECRET_KEY` is intentionally **not** prefixed with `NEXT_PUBLIC_` — it is never sent to the browser.

### Commands

```bash
pnpm install          # install dependencies
pnpm dev              # development server → http://localhost:3000
pnpm test             # run full Vitest test suite
pnpm build            # type-check + Next.js production build
```

### Guardrails

| Guardrail             | Where                                | What it does                                                                                             |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Bearer auth           | `/api/cron`, `/api/admin/seed`       | Extracts and trims token from `Authorization: Bearer <CRON_SECRET>`; returns 401 if absent/wrong         |
| Row-level security    | Supabase (`0001_rls_policies.sql`)   | Anon role: `articles` and `commenters` are SELECT-only; `users` has no anon policy (deny-all by default) |
| Input validation      | `/api/posts/[id]`, `/api/admin/seed` | `Number()` + `Number.isInteger()` — floats (`"1.5"`) and alpha strings (`"1abc"`) return 400             |
| Rate-limit resilience | `ForemClient`                        | Exponential-backoff retry on HTTP 429, honours `Retry-After` header                                      |
| Server-only secrets   | `src/lib/supabase.ts`                | Validates both env vars are set at request time; `SUPABASE_SECRET_KEY` never exposed in client bundles   |

---

## API Reference

| Method | Path              | Auth   | Description                                                       |
| ------ | ----------------- | ------ | ----------------------------------------------------------------- |
| `GET`  | `/api/posts`      | none   | Top 50 articles (5-day window), non-NORMAL first, then score desc |
| `GET`  | `/api/posts/:id`  | none   | Article detail + 5 most recent posts by same author               |
| `POST` | `/api/cron`       | Bearer | Sync all articles in the 5-day window from Forem                  |
| `POST` | `/api/admin/seed` | Bearer | Same as cron — populate the database on first deploy              |

---

## Deployment (Cloud Run)

The app is deployed to Google Cloud Run via `deploy.sh`. Set the environment variables listed above as Cloud Run secrets or environment variables:

```bash
gcloud run deploy dev-community-dashboard \
  --set-secrets SUPABASE_SECRET_KEY=...,CRON_SECRET=... \
  --set-env-vars NEXT_PUBLIC_SUPABASE_URL=...,DEV_API_KEY=...
```

Once deployed, set `APP_URL` as a **GitHub repository variable** (not a secret — it is a public URL) and `CRON_SECRET` as a **GitHub secret** so the cron workflow (`.github/workflows/cron.yml`) can reach the live endpoint. By default, this workflow uses a `schedule` trigger to run every 2 hours; to change or disable this cadence, edit or remove the `schedule` block in that file.

---

## GitHub Actions Workflows

Three workflows live in `.github/workflows/`. All CI checks run in `ci.yml`; do not create additional workflow files for individual checks.

| Workflow           | File                 | Trigger                          | What it does                                                                                                                                                                                                         |
| ------------------ | -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI**             | `ci.yml`             | Push to `main`, Pull Request     | Format (Prettier), ESLint, Stylelint, actionlint, Hadolint (Docker), Vitest with coverage (artifact uploaded for SonarCloud), SonarCloud scan, Lighthouse CI (desktop — results written to `.lighthouseci/` locally) |
| **2-Hour Sync**    | `cron.yml`           | Schedule (`0 */2 * * *`), manual | POSTs to `$APP_URL/api/cron` with `Authorization: Bearer $CRON_SECRET`; skips silently if either variable is unset; cancels in-progress runs to avoid overlap                                                        |
| **Release Please** | `release-please.yml` | Push to `main`                   | Opens and updates automated release PRs (Conventional Commits → CHANGELOG + version bump); merging the release PR creates the GitHub Release                                                                         |

### Required repository configuration

| Name           | Type     | Used by           | Notes                                                                                           |
| -------------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `APP_URL`      | Variable | `cron.yml`        | Public Cloud Run URL — not a secret, safe to log                                                |
| `CRON_SECRET`  | Secret   | `cron.yml`        | Bearer token; must match the `CRON_SECRET` env var on the deployed service                      |
| `SONAR_TOKEN`  | Secret   | `ci.yml`          | SonarCloud token for the `ChecKMarKDevTools_forem-community-dashboard` project                  |
| `GITHUB_TOKEN` | Built-in | `ci.yml`, release | Provided automatically; `release-please.yml` needs `contents: write` and `pull-requests: write` |

### Lighthouse CI

Lighthouse runs as the last step in `ci.yml` (`pnpm lhci:desktop`). Results are written to `.lighthouseci/` (filesystem target — no external upload service or status-check callback). Minimum thresholds: performance ≥ 0.90 (desktop), accessibility ≥ 0.90, best-practices ≥ 0.90, SEO ≥ 0.90. The `.lighthouseci/` directory is git-ignored.

---

## Contributing

This project is built for community helpers — people who want to know where to look, not what to do. The dashboard surfaces conversations that may need a human eye; it does not assign blame, issue warnings, or score individuals.

If you are contributing, here is where things live:

| Area                                                    | Where to look                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Scoring & classification logic                          | `src/lib/sync.ts`                                              |
| Sync pipeline (Forem → Supabase)                        | `src/lib/sync.ts`                                              |
| Dashboard UI components                                 | `src/components/Dashboard.tsx` and `src/components/ui/`        |
| Chart components (SVG)                                  | `src/components/ui/charts/`                                    |
| Chart data transformation helpers                       | `src/lib/metrics-helpers.ts`                                   |
| Display helpers (labels, narratives, signal formatting) | `src/lib/dashboard-helpers.ts`                                 |
| API routes                                              | `src/app/api/`                                                 |
| Tests                                                   | Co-located `*.test.ts` / `*.test.tsx` files next to the source |
| CI checks                                               | `.github/workflows/ci.yml` (single workflow for all checks)    |
| Project conventions                                     | `AGENTS.md`                                                    |

---

## License

This project is licensed under the **[Polyform Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0/)**.

Copyright (c) 2026 ChecKMarK DevTools & Ashley Childress

**In brief:**

- **You CAN** use, copy, fork, or adapt this for your own workflows, inside your company, for client projects, demos, education, or anything else—as long as you are not selling the code, charging for it, or making money from the project itself.
- **You CANNOT** resell, offer as a paid service, or monetize this project or its derivatives without prior written approval from Ashley Childress.
- Any public fork, copy, or substantial reuse must include the `LICENSE` file and a clear attribution statement in your documentation or README:
  > "Based on original work by ChecKMarK DevTools & Ashley Childress – see [https://github.com/checkmarkdevtools/dev-community-dashboard](https://github.com/checkmarkdevtools/dev-community-dashboard)."

For exceptions or monetization/commercialization questions, contact Ashley Childress at [human@checkmarkdevtools.dev](mailto:human@checkmarkdevtools.dev).

See the full [LICENSE](./LICENSE) file for details.
