import type { ArticleMetrics } from "@/types/metrics";

/**
 * Null-safe accessor for metrics fields.
 * The DB JSONB default is '{}', so individual fields may be absent even when
 * the metrics object is truthy. Every getter below uses this or guards
 * with `?? []` / `?? 0` so the UI can always render (empty state or real data).
 */

/** Default risk components when metrics are absent or incomplete. */
const EMPTY_RISK_COMPONENTS: ArticleMetrics["risk_components"] = {
  frequency_penalty: 0,
  short_content: false,
  no_engagement: false,
  promo_keywords: 0,
  repeated_links: 0,
  engagement_credit: 0,
};

/** Transform velocity buckets into {x, y} points for LineChart. */
export function getVelocityChartData(
  metrics?: ArticleMetrics | null,
): ReadonlyArray<{ x: number; y: number }> {
  return (metrics?.velocity_buckets ?? []).map((b) => ({
    x: b.hour,
    y: b.count,
  }));
}

/** Compute baseline (average comments per bucket) for velocity chart. */
export function getVelocityBaseline(metrics?: ArticleMetrics | null): number {
  const buckets = metrics?.velocity_buckets ?? [];
  if (buckets.length === 0) return 0;
  const total = buckets.reduce((s, b) => s + b.count, 0);
  return total / buckets.length;
}

/** Transform commenter shares into bar chart data. */
export function getParticipationData(
  metrics?: ArticleMetrics | null,
): ReadonlyArray<{ label: string; value: number }> {
  return (metrics?.commenter_shares ?? []).map((s) => ({
    label: s.username,
    value: s.share,
  }));
}

/** Extract sentiment percentages for diverging bar. */
export function getSentimentData(metrics?: ArticleMetrics | null): {
  positive: number;
  neutral: number;
  negative: number;
} {
  return {
    positive: metrics?.positive_pct ?? 0,
    neutral: metrics?.neutral_pct ?? 100,
    negative: metrics?.negative_pct ?? 0,
  };
}

/** Transform constructiveness buckets into {x, y} points for LineChart. */
export function getConstructivenessData(
  metrics?: ArticleMetrics | null,
): ReadonlyArray<{ x: number; y: number }> {
  return (metrics?.constructiveness_buckets ?? []).map((b) => ({
    x: b.hour,
    y: b.depth_index,
  }));
}

/** Return which sentiment analysis method produced the data. */
export function getSentimentMethod(
  metrics?: ArticleMetrics | null,
): "llm" | "keyword" | "unknown" {
  return metrics?.sentiment_method ?? "unknown";
}

/** Return the average sentiment score (-1.0 to 1.0), defaulting to 0. */
export function getSentimentMean(metrics?: ArticleMetrics | null): number {
  return metrics?.sentiment_mean ?? 0;
}

/** Return the sentiment volatility (0.0 to 1.0), defaulting to 0. */
export function getSentimentVolatility(
  metrics?: ArticleMetrics | null,
): number {
  return metrics?.sentiment_volatility ?? 0;
}

/** Return per-comment sentiment scores from LLM analysis. */
export function getSentimentScores(
  metrics?: ArticleMetrics | null,
): ReadonlyArray<{ index: number; score: number }> {
  return metrics?.sentiment_scores ?? [];
}

type RiskMarker = Readonly<{ label: string; active: boolean }>;

/** Build risk signal markers for MarkerTimeline. */
export function getRiskMarkers(metrics?: ArticleMetrics | null): RiskMarker[] {
  const rc = metrics?.risk_components ?? EMPTY_RISK_COMPONENTS;
  return [
    { label: "Frequency Penalty", active: rc.frequency_penalty > 0 },
    { label: "Short Content", active: rc.short_content },
    { label: "No Engagement", active: rc.no_engagement },
    { label: "Promotional Keywords", active: rc.promo_keywords > 0 },
    { label: "Repeated Links", active: rc.repeated_links > 0 },
  ];
}
