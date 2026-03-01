# Metrics Reference

Complete reference for all metrics computed by the DEV Community Dashboard sync pipeline. Every metric listed here is stored in the `articles.metrics` JSONB column and is visible somewhere in the UI. No hidden metrics.

For interaction signal specifics, see [Interaction Signal](./interaction-signal.md). For system architecture, see [Architecture](./architecture.md).

---

## Metric Transparency Rules

Per project conventions (AGENTS.md):

- Every metric the pipeline computes is visible somewhere in the UI.
- If a score is derived from specific signals (e.g., keyword matches), the contributing signals are surfaceable via hover or tooltip.
- Users must be able to understand _why_ a value is what it is.

---

## ArticleMetrics Field Reference

The `ArticleMetrics` interface is defined in `src/types/metrics.ts`. Every field below is stored in the `articles.metrics` JSONB column.

### Velocity and Participation

| Field                      | Type                           | Description                                                                                                    |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `velocity_buckets`         | `Array<{ hour, count }>`       | Hourly comment arrival counts (capped at 48 entries). Rendered as the Reply Velocity line chart.               |
| `comments_per_hour`        | `number`                       | Average comments per hour since publication.                                                                   |
| `commenter_shares`         | `Array<{ username, share }>`   | Top 5 commenters by share of total comments. Rendered as the Participation Distribution bar chart.             |
| `constructiveness_buckets` | `Array<{ hour, depth_index }>` | Hourly depth-index buckets measuring reply depth over time. Rendered as the Constructiveness Trend line chart. |
| `avg_comment_length`       | `number`                       | Average word count across all comments.                                                                        |
| `reply_ratio`              | `number`                       | Ratio of replies-with-parent to total comments (0.0 - 1.0).                                                    |
| `alternating_pairs`        | `number`                       | Count of back-and-forth reply pairs between two authors.                                                       |

### Risk Components

The `risk_components` object contains the breakdown of individual risk signals. Each signal is shown in the Contributing Signals timeline chart, with active/inactive state and hover tooltips.

| Field                               | Type      | Description                                                                                           |
| ----------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `risk_components.frequency_penalty` | `number`  | `max(0, author_post_freq - 2) * 2`. Active when author posted > 2 times in 24h.                       |
| `risk_components.short_content`     | `boolean` | `true` when article body < 120 words.                                                                 |
| `risk_components.no_engagement`     | `boolean` | `true` when zero reactions AND zero comments at sync time.                                            |
| `risk_components.promo_keywords`    | `number`  | Count of promotional keywords ("subscribe", "buy", "follow", "link in bio") in author's own comments. |
| `risk_components.repeated_links`    | `number`  | `2` if any external domain appears > 2 times in comments; `0` otherwise.                              |
| `risk_components.engagement_credit` | `number`  | Offset: `(reactions >= 10 ? 2 : 0) + (distinct_commenters >= 5 ? 1 : 0)`. Subtracted from risk score. |

### Computed Scores

| Field           | Type      | Description                                                                                   |
| --------------- | --------- | --------------------------------------------------------------------------------------------- |
| `risk_score`    | `number`  | Sum of all risk components minus engagement credit (floor 0). >= 4 triggers Anomalous Signal. |
| `is_first_post` | `boolean` | Author joined < 30 days ago AND has 1 post in 24h.                                            |
| `help_keywords` | `number`  | Count of help-seeking keywords detected in comments.                                          |

### Interaction Signal Fields

These fields power the Interaction Signal chart in the detail panel. See [Interaction Signal](./interaction-signal.md) for the scoring formula and pipeline details.

| Field                    | Type                                                                               | Description                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `interaction_signal`     | `number` (0.0 - 1.0)                                                               | Composite interaction signal strength. Mean of per-comment composites (LLM) or heuristic-derived. |
| `interaction_method`     | `"llm"` or `"heuristic"`                                                           | Which analysis path produced the data.                                                            |
| `topic_tags`             | `Array<string>` (1-3 items)                                                        | LLM-extracted topic keywords from the post body. Empty for heuristic.                             |
| `interaction_scores`     | `Array<{ index, tone, relevance, depth, constructiveness, id_code?, body_hash? }>` | Per-comment scores from LLM analysis. Each entry includes cache keys for incremental scoring.     |
| `interaction_volatility` | `number` (0.0 - 1.0)                                                               | Standard deviation of tone scores across comments. Only present in LLM mode.                      |
| `signal_strong_pct`      | `number` (0 - 100)                                                                 | Percentage of comments with composite > 0.6 (substantive).                                        |
| `signal_moderate_pct`    | `number` (0 - 100)                                                                 | Percentage of comments with composite 0.3 - 0.6 (mixed).                                          |
| `signal_faint_pct`       | `number` (0 - 100)                                                                 | Percentage of comments with composite < 0.3 (surface-level).                                      |

---

## Common Metrics (Explanations Array)

These metrics are computed during sync and stored in the `explanations` string array. They appear in the Conversation Signals and Discussion State cards in the detail panel.

| Metric              | Formula                                                                                 | Where in UI                                 |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Word Count`        | Count of words in the article body                                                      | Conversation Signals                        |
| `Unique Commenters` | Count of distinct comment authors (displayed as "Participants")                         | Conversation Signals                        |
| `Effort`            | `log2(word_count + 1) + unique_commenters + (avg_comment_length / 40)`                  | Conversation Signals (as "Effort Level")    |
| `Attention Delta`   | `effort - log2(exposure + 1)` where `exposure = max(1, reactions + comments)`           | Conversation Signals (as "Attention Shift") |
| `Heat Score`        | `comments_per_hour + reply_ratio * 3 + alternating_pairs + volatility_component`        | Discussion State (as "Activity Level")      |
| `Risk Score`        | Sum of risk components minus engagement credit                                          | Discussion State (as "Signal Divergence")   |
| `Support Score`     | `(first_post ? 2 : 0) + (no_reactions ? 1 : 0) + (no_comments ? 2 : 0) + help_keywords` | Discussion State (as "Constructiveness")    |

---

## Attention Categories

Each article is classified into exactly one category at sync time. Categories are assigned by `classifyArticle()` in `src/lib/sync.ts`.

| Dashboard Label            | Category         | Key Conditions                                                                                                                  |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Needs Support**          | NEEDS_SUPPORT    | LLM `needs_support: true` OR `countSupportPhrases(body) >= 2` (heuristic fallback). Checked first in `classifyArticle()`.       |
| **Awaiting Collaboration** | NEEDS_RESPONSE   | `time_since_post >= 30 min` AND `support_score >= 3`                                                                            |
| **Anomalous Signal**       | SIGNAL_AT_RISK   | `risk_score >= 4`                                                                                                               |
| **Rapid Discussion**       | NEEDS_REVIEW     | `comments >= 6` AND `heat_score >= 5` AND `reactions / comments < 1.2`                                                          |
| **Trending Signal**        | BOOST_VISIBILITY | `word_count >= 600` AND `unique_commenters >= 2` AND `avg_comment_length >= 18` AND `reactions <= 5` AND `attention_delta >= 3` |
| **Silent Signal**          | SILENT_SIGNAL    | `reactions >= 5` AND `comments <= 1`                                                                                            |
| **Steady Signal**          | NORMAL           | Default; also forced for `devteam` org posts                                                                                    |

Priority order in the queue list: Needs Support > Awaiting Collaboration > Anomalous Signal > Trending Signal > Rapid Discussion > Silent Signal > Steady Signal.

---

## Sub-Scores

| Sub-score       | Formula                                                                                                      | Interpretation                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `heat_score`    | `comments_per_hour + reply_ratio * 3 + alternating_pairs + volatility_component`                             | Thread activity and engagement intensity.                       |
| `risk_score`    | `max(0, freq_penalty + short_content + no_engagement + promo_keywords + repeated_links - engagement_credit)` | Deviation from typical community patterns. >= 4 flags the post. |
| `freq_penalty`  | `max(0, author_post_freq - 2) * 2`                                                                           | Only penalizes > 2 posts/day.                                   |
| `engage_credit` | `(reactions >= 10 ? 2 : 0) + (unique_commenters >= 5 ? 1 : 0)`                                               | Offsets risk for well-engaged posts.                            |
| `support_score` | `(first_post ? 2 : 0) + (no_reactions ? 1 : 0) + (no_comments ? 2 : 0) + help_keywords`                      | Flags posts from new authors who need community support.        |

---

## Chart Visualizations

Each metric maps to a specific chart component in the detail panel:

| Chart                          | Component            | Data Source                | Metric Fields Used                                             |
| ------------------------------ | -------------------- | -------------------------- | -------------------------------------------------------------- |
| **Reply Velocity**             | `LineChart`          | `velocity_buckets`         | `hour`, `count`                                                |
| **Participation Distribution** | `HorizontalBarChart` | `commenter_shares`         | `username`, `share`                                            |
| **Interaction Signal**         | `SignalBar`          | `signal_*_pct`             | `signal_strong_pct`, `signal_moderate_pct`, `signal_faint_pct` |
| **Constructiveness Trend**     | `LineChart`          | `constructiveness_buckets` | `hour`, `depth_index`                                          |
| **Contributing Signals**       | `MarkerTimeline`     | `risk_components`          | All 6 risk component fields                                    |

All charts are custom SVG components in `src/components/ui/charts/`. Data transformation happens in `src/lib/metrics-helpers.ts`. Charts handle their own empty states when metrics data is absent.

---

## Related Documentation

- [Interaction Signal](./interaction-signal.md) -- composite signal formula, LLM pipeline, heuristic fallback
- [Architecture](./architecture.md) -- system overview, data flow, deployment
