# Forem Community Observability Dashboard

A moderation intelligence dashboard for [Forem](https://forem.com/) communities (dev.to and self-hosted instances). It ingests the latest posts via the public Forem API, scores each one against behavioral, audience, and pattern heuristics, and persists the results in Supabase so community managers can surface high-attention content at a glance.

**Production:** https://forem-signal.checkmarkdevtools.dev _(Cloud Run — deployed post-initial-release)_

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
    APP["Next.js App\nforem-signal.checkmarkdevtools.dev"]
  end

  subgraph Supabase
    DB[("PostgreSQL\narticles · users · commenters")]
  end

  Browser((Browser)) -->|"GET /api/posts\nGET /api/posts/:id"| APP
  GHA -->|"POST /api/cron\n(Bearer token)"| APP
  APP -->|"getLatestArticles · getUserByUsername · getComments\n(exponential-backoff retry on 429)"| FOREM
  APP -->|"upsert / SELECT"| DB
```

### Background Sync Flow

Triggered by the GitHub Actions cron or `workflow_dispatch`. Each run fetches up to 100 articles, scores them, and upserts results.

```mermaid
sequenceDiagram
  participant GHA as GitHub Actions
  participant Cron as POST /api/cron
  participant FC as ForemClient
  participant Score as evaluatePriority
  participant SB as Supabase

  GHA->>Cron: POST (Authorization: Bearer)
  Cron->>FC: getLatestArticles(page=1, per_page=100)
  FC-->>Cron: ForemArticle[]

  loop For each article
    Cron->>FC: getUserByUsername(author) [user cache]
    FC-->>Cron: ForemUser | null
    Cron->>FC: getComments(articleId)
    FC-->>Cron: ForemComment[]
    Cron->>Score: evaluatePriority(article, user, comments, recentPosts)
    Score-->>Cron: ScoreBreakdown {total, behavior, audience, pattern, attention_level}
    Cron->>SB: upsert users row (once per unique author per run)
    Cron->>SB: upsert articles row (score, attention_level, explanations)
    Cron->>SB: upsert commenters rows
  end

  Cron-->>GHA: {success, synced, failed, errors[]}
```

### User Interaction Flow

The dashboard is a read-only Next.js client that fetches pre-scored data from Supabase via the API layer.

```mermaid
sequenceDiagram
  participant U as User
  participant D as Dashboard (React)
  participant Posts as GET /api/posts
  participant Detail as GET /api/posts/:id
  participant SB as Supabase

  U->>D: Open dashboard
  D->>Posts: fetch()
  Posts->>SB: SELECT articles ORDER BY score DESC LIMIT 100
  SB-->>Posts: scored article rows
  Posts-->>D: article list
  D-->>U: Ranked list with attention badges (low / medium / high)

  U->>D: Click a post
  D->>Detail: fetch(/api/posts/42)
  Detail->>SB: SELECT article by id
  Detail->>SB: SELECT 5 most recent posts by same author
  SB-->>Detail: article + recent_posts[]
  Detail-->>D: PostDetails
  D-->>U: Detail panel (score, explanations, recent posts by author)
```

---

## Scoring Engine

Each article is scored at sync time (not at read time) across three independent dimensions. The total is capped at 100 and persisted alongside the article.

| Dimension    | Signal                                                        | Points |
| ------------ | ------------------------------------------------------------- | ------ |
| **Behavior** | Account age < 7 days                                          | +15    |
|              | Off-site canonical URL                                        | +10    |
|              | > 2 posts within 24 h by same author                          | +9     |
| **Audience** | ≤ 2 unique commenters with > 3 total comments                 | +15    |
|              | Any comment engagement (baseline)                             | +5     |
|              | > 20 reactions with zero comments                             | +15    |
| **Pattern**  | Repeated tag combination across author's recent posts         | +15    |
|              | Uniform publish intervals (< 5 min variance across ≥ 3 posts) | +18    |

**Attention level thresholds:** `low` < 40 · `medium` 40–69 · `high` ≥ 70

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
| `FOREM_API_KEY`            | No       | Optional; raises Forem API rate limits             |

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
| Bearer auth           | `/api/cron`, `/api/admin/seed`       | Returns 401 if `Authorization: Bearer <CRON_SECRET>` header is absent or wrong                           |
| Row-level security    | Supabase (`0001_rls_policies.sql`)   | Anon role: `articles` and `commenters` are SELECT-only; `users` has no anon policy (deny-all by default) |
| Input validation      | `/api/posts/[id]`, `/api/admin/seed` | `Number()` + `Number.isInteger()` — floats (`"1.5"`) and alpha strings (`"1abc"`) return 400             |
| Rate-limit resilience | `ForemClient`                        | Exponential-backoff retry on HTTP 429, honours `Retry-After` header                                      |
| Server-only secrets   | `src/lib/supabase.ts`                | `SUPABASE_SECRET_KEY` only used server-side; never exposed in client bundles                             |

---

## API Reference

| Method | Path              | Auth   | Description                                                        |
| ------ | ----------------- | ------ | ------------------------------------------------------------------ |
| `GET`  | `/api/posts`      | none   | Scored article list, ordered by score desc, limit 100              |
| `GET`  | `/api/posts/:id`  | none   | Article detail + 5 most recent posts by same author                |
| `POST` | `/api/cron`       | Bearer | Sync latest 100 articles from Forem (page 1)                       |
| `POST` | `/api/admin/seed` | Bearer | Back-fill articles; body `{ "days": N }` (integer 1–90, default 3) |

---

## Deployment (Cloud Run)

The app is deployed to Google Cloud Run via `deploy.sh`. Set the environment variables listed above as Cloud Run secrets or environment variables:

```bash
gcloud run deploy forem-community-dashboard \
  --set-secrets SUPABASE_SECRET_KEY=...,CRON_SECRET=... \
  --set-env-vars NEXT_PUBLIC_SUPABASE_URL=...,FOREM_API_KEY=...
```

Once deployed, set `APP_URL` as a **GitHub repository variable** (not a secret — it is a public URL) and `CRON_SECRET` as a **GitHub secret** so the cron workflow (`.github/workflows/cron.yml`) can reach the live endpoint. Uncomment the `schedule` trigger in that file to enable the 15-minute cadence.

---

## License

This project is licensed under the **[Polyform Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0/)**.

Copyright (c) 2026 ChecKMarK DevTools & Ashley Childress

**In brief:**

- **You CAN** use, copy, fork, or adapt this for your own workflows, inside your company, for client projects, demos, education, or anything else—as long as you are not selling the code, charging for it, or making money from the project itself.
- **You CANNOT** resell, offer as a paid service, or monetize this project or its derivatives without prior written approval from Ashley Childress.
- Any public fork, copy, or substantial reuse must include the `LICENSE` file and a clear attribution statement in your documentation or README:
  > "Based on original work by ChecKMarK DevTools & Ashley Childress – see [https://github.com/checkmarkdevtools/forem-community-dashboard](https://github.com/checkmarkdevtools/forem-community-dashboard)."

For exceptions or monetization/commercialization questions, contact Ashley Childress at [human@checkmarkdevtools.dev](mailto:human@checkmarkdevtools.dev).

See the full [LICENSE](./LICENSE) file for details.
