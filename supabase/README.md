# Supabase — Migration History & Schema Notes

All migrations live in `supabase/migrations/` and are applied in order via `supabase db push`.

## Migration History

| Migration           | File                                                               | Description                                                                        |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Initial schema      | `0000_initial_schema.sql`                                          | Creates `articles`, `users`, and `commenters` tables with indexes; enables RLS     |
| RLS policies        | `0001_rls_policies.sql`                                            | Anon SELECT-only on `articles` and `commenters`; `users` deny-all (no anon policy) |
| Add dev_url         | `20260228030900_add_dev_url_and_action.sql`                        | Adds `dev_url TEXT` to `articles`; backfills from `canonical_url`                  |
| Add metrics JSONB   | `20260228235416_add_metrics_jsonb_column_to_articles.sql`          | Adds `metrics JSONB DEFAULT '{}'` to `articles` for per-post analytics             |
| Allow null username | `20260301004053_allow_null_commenter_username.sql`                 | Drops `NOT NULL` on `commenters.username` for deleted Forem accounts               |
| Rename category     | `20260301040126_rename_possibly_low_quality_to_signal_at_risk.sql` | Renames `POSSIBLY_LOW_QUALITY` → `SIGNAL_AT_RISK` in all rows                      |

## Schema Notes

### `articles.metrics` (JSONB)

Per-article analytics computed during sync. The full interface is defined in
[`src/types/metrics.ts`](../src/types/metrics.ts). Key fields:

| Field                      | Type                                                                             | Description                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `velocity_buckets`         | `Array<{hour, count}>`                                                           | Hourly comment arrivals (capped at 48 entries)                                           |
| `commenter_shares`         | `Array<{username, share}>`                                                       | Top 5 commenters by share of total comments                                              |
| `constructiveness_buckets` | `Array<{hour, depth_index}>`                                                     | Average reply depth per hour                                                             |
| `risk_components`          | `object`                                                                         | Breakdown of the six risk signal components                                              |
| `risk_score`               | `number`                                                                         | Computed risk score (0 = no risk)                                                        |
| `interaction_signal`       | `number`                                                                         | Composite interaction signal strength: 0.0 (surface-level) to 1.0 (deeply engaged)       |
| `interaction_method`       | `"llm" \| "heuristic"`                                                           | Which analysis method produced the interaction data                                      |
| `interaction_scores`       | `Array<{index, tone, relevance, depth, constructiveness, id_code?, body_hash?}>` | Per-comment scores; `id_code` and `body_hash` enable incremental re-scoring across syncs |
| `interaction_volatility`   | `number`                                                                         | LLM-computed tone volatility (0.0 = uniform tone, 1.0 = extreme variation)               |
| `signal_strong_pct`        | `number`                                                                         | Percentage of comments with strong signal (composite > 0.6)                              |
| `signal_moderate_pct`      | `number`                                                                         | Percentage of comments with moderate signal (composite 0.3–0.6)                          |
| `signal_faint_pct`         | `number`                                                                         | Percentage of comments with faint signal (composite < 0.3)                               |
| `topic_tags`               | `string[]`                                                                       | 1–3 topic keywords extracted from the post body by LLM                                   |
| `needs_support`            | `boolean`                                                                        | True when the post body contains signals of emotional distress, burnout, or help-seeking |
| `is_first_post`            | `boolean`                                                                        | Author joined < 30 days ago and published 1 post in the last 24 h                        |
| `help_keywords`            | `number`                                                                         | Count of help-seeking keyword matches in comments                                        |

### `commenters.username` (nullable)

`TEXT` — nullable since migration `20260301004053`. Forem returns `null` usernames for
deleted accounts. The sync pipeline skips identity-dependent tracking for null usernames
(unique commenter set, commenter counts) but still processes the comment's text, timestamps,
and keywords.

### RLS Access Model

| Role           | `articles`  | `commenters` | `users`            |
| -------------- | ----------- | ------------ | ------------------ |
| `anon`         | SELECT only | SELECT only  | denied (no policy) |
| `service_role` | full access | full access  | full access        |

The sync pipeline (`/api/cron`, `/api/admin/seed`) uses the `SUPABASE_SECRET_KEY` which
grants `service_role` access. The read API (`/api/posts`, `/api/posts/:id`) uses the
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` which is restricted to anon SELECT.
