/**
 * Per-article analytics metrics stored as JSONB in the `articles.metrics` column.
 * Computed during sync by walking the comment tree and aggregating signals.
 */
export interface ArticleMetrics {
  /** Hourly comment arrival buckets (capped at 48 entries). */
  velocity_buckets: ReadonlyArray<{ hour: number; count: number }>;
  /** Average comments per hour since publication. */
  comments_per_hour: number;
  /** Top 5 commenters by share of total comments. */
  commenter_shares: ReadonlyArray<{ username: string; share: number }>;
  /** Hourly depth-index buckets measuring reply depth over time. */
  constructiveness_buckets: ReadonlyArray<{
    hour: number;
    depth_index: number;
  }>;
  /** Average word count across all comments. */
  avg_comment_length: number;
  /** Ratio of replies-with-parent to total comments. */
  reply_ratio: number;
  /** Count of back-and-forth reply pairs between two authors. */
  alternating_pairs: number;
  /** Breakdown of individual risk signal components. */
  risk_components: {
    frequency_penalty: number;
    short_content: boolean;
    no_engagement: boolean;
    promo_keywords: number;
    repeated_links: number;
    engagement_credit: number;
  };
  /** Computed risk score (0 = no risk). */
  risk_score: number;
  /** Whether this is the author's first post (joined < 30 days, 1 post in 24h). */
  is_first_post: boolean;
  /** Count of help-seeking keywords detected in comments. */
  help_keywords: number;
  /** True when the post body contains signals of emotional distress, burnout, or help-seeking. */
  needs_support?: boolean;

  // ── Interaction Signal (headline metric) ───────────────────────────────

  /** Composite interaction signal strength: 0.0 (surface-level) to 1.0 (deeply engaged). */
  interaction_signal?: number;
  /** Which analysis method produced the interaction data. */
  interaction_method?: "llm" | "heuristic";
  /** 1-3 topic keywords extracted from the post body by LLM. */
  topic_tags?: ReadonlyArray<string>;

  /** Per-comment interaction scores from LLM analysis. */
  interaction_scores?: ReadonlyArray<{
    readonly index: number;
    /** Tone: -1.0 (strongly negative) to 1.0 (strongly positive). */
    readonly tone: number;
    /** Relevance: 0.0 (off-topic) to 1.0 (directly on-topic). */
    readonly relevance: number;
    /** Depth: 0.0 (surface-level) to 1.0 (substantive/technical). */
    readonly depth: number;
    /** Constructiveness: 0.0 (noise) to 1.0 (advances the conversation). */
    readonly constructiveness: number;
    /** Forem comment id_code for incremental LLM cache keying across syncs. */
    readonly id_code?: string;
    /** djb2 hash of stripped comment body for edit detection. */
    readonly body_hash?: string;
  }>;

  /** LLM-computed volatility across all comments (0.0 = uniform tone, 1.0 = extreme variation). */
  interaction_volatility?: number;

  /** Percentage of comments with strong signal (composite > 0.6). */
  signal_strong_pct?: number;
  /** Percentage of comments with moderate signal (composite 0.3-0.6). */
  signal_moderate_pct?: number;
  /** Percentage of comments with faint signal (composite < 0.3). */
  signal_faint_pct?: number;
}
