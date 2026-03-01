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
  /** Percentage of comments with positive sentiment words. */
  positive_pct: number;
  /** Percentage of comments with neutral sentiment (neither positive nor negative). */
  neutral_pct: number;
  /** Percentage of comments with negative sentiment words. */
  negative_pct: number;
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
  /** Absolute difference between positive and negative comment counts (sentiment imbalance). */
  sentiment_flips: number;
  /** Per-comment sentiment float scores from LLM analysis (-1.0 to 1.0). */
  sentiment_scores?: ReadonlyArray<{ index: number; score: number }>;
  /** LLM-computed volatility across all comments (0.0 = uniform tone, 1.0 = extreme variation). */
  sentiment_volatility?: number;
  /** Which analysis method produced the sentiment data. */
  sentiment_method?: "llm" | "keyword";
  /** Average sentiment score across all comments (-1.0 to 1.0). */
  sentiment_mean?: number;
  /** Whether this is the author's first post (joined < 30 days, 1 post in 24h). */
  is_first_post: boolean;
  /** Count of help-seeking keywords detected in comments. */
  help_keywords: number;
}
