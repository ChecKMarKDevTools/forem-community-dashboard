import { describe, it, expect } from "vitest";
import type { ArticleMetrics } from "@/types/metrics";
import {
  getVelocityChartData,
  getVelocityBaseline,
  getParticipationData,
  getSignalSpreadData,
  getInteractionSignal,
  getInteractionMethod,
  getTopicTags,
  getInteractionVolatility,
  getConstructivenessData,
  getRiskMarkers,
} from "./metrics-helpers";

const EMPTY_RISK_COMPONENTS = {
  frequency_penalty: 0,
  short_content: false,
  no_engagement: false,
  promo_keywords: 0,
  repeated_links: 0,
  engagement_credit: 0,
};

function makeMetrics(overrides: Partial<ArticleMetrics> = {}): ArticleMetrics {
  return {
    velocity_buckets: [],
    comments_per_hour: 0,
    commenter_shares: [],
    constructiveness_buckets: [],
    avg_comment_length: 0,
    reply_ratio: 0,
    alternating_pairs: 0,
    risk_components: EMPTY_RISK_COMPONENTS,
    risk_score: 0,
    is_first_post: false,
    help_keywords: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Null-safety: all getters handle null / undefined / empty metrics
// ---------------------------------------------------------------------------

describe("null-safety", () => {
  it("getVelocityChartData returns empty array for null", () => {
    expect(getVelocityChartData(null)).toEqual([]);
  });

  it("getVelocityChartData returns empty array for undefined", () => {
    expect(getVelocityChartData(undefined)).toEqual([]);
  });

  it("getVelocityBaseline returns 0 for null", () => {
    expect(getVelocityBaseline(null)).toBe(0);
  });

  it("getParticipationData returns empty array for null", () => {
    expect(getParticipationData(null)).toEqual([]);
  });

  it("getSignalSpreadData returns 0/0/0 for null (empty state)", () => {
    expect(getSignalSpreadData(null)).toEqual({
      strong: 0,
      moderate: 0,
      faint: 0,
    });
  });

  it("getInteractionSignal returns 0 for null", () => {
    expect(getInteractionSignal(null)).toBe(0);
  });

  it("getInteractionMethod returns 'unknown' for null", () => {
    expect(getInteractionMethod(null)).toBe("unknown");
  });

  it("getTopicTags returns empty array for null", () => {
    expect(getTopicTags(null)).toEqual([]);
  });

  it("getInteractionVolatility returns 0 for null", () => {
    expect(getInteractionVolatility(null)).toBe(0);
  });

  it("getConstructivenessData returns empty array for null", () => {
    expect(getConstructivenessData(null)).toEqual([]);
  });

  it("getRiskMarkers returns all-inactive markers for null", () => {
    const markers = getRiskMarkers(null);
    expect(markers).toHaveLength(5);
    expect(markers.every((m) => !m.active)).toBe(true);
  });

  it("getVelocityChartData handles empty object (DB default '{}')", () => {
    expect(getVelocityChartData({} as ArticleMetrics)).toEqual([]);
  });

  it("getRiskMarkers handles empty object (DB default '{}')", () => {
    const markers = getRiskMarkers({} as ArticleMetrics);
    expect(markers).toHaveLength(5);
    expect(markers.every((m) => !m.active)).toBe(true);
  });

  it("getSignalSpreadData handles empty object (DB default '{}')", () => {
    expect(getSignalSpreadData({} as ArticleMetrics)).toEqual({
      strong: 0,
      moderate: 0,
      faint: 0,
    });
  });

  it("getInteractionSignal handles empty object (DB default '{}')", () => {
    expect(getInteractionSignal({} as ArticleMetrics)).toBe(0);
  });

  it("getInteractionMethod handles empty object (DB default '{}')", () => {
    expect(getInteractionMethod({} as ArticleMetrics)).toBe("unknown");
  });

  it("getTopicTags handles empty object (DB default '{}')", () => {
    expect(getTopicTags({} as ArticleMetrics)).toEqual([]);
  });

  it("getInteractionVolatility handles empty object (DB default '{}')", () => {
    expect(getInteractionVolatility({} as ArticleMetrics)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getVelocityChartData
// ---------------------------------------------------------------------------

describe("getVelocityChartData", () => {
  it("transforms velocity_buckets into x/y points", () => {
    const m = makeMetrics({
      velocity_buckets: [
        { hour: 0, count: 3 },
        { hour: 1, count: 5 },
        { hour: 2, count: 1 },
      ],
    });
    const result = getVelocityChartData(m);
    expect(result).toEqual([
      { x: 0, y: 3 },
      { x: 1, y: 5 },
      { x: 2, y: 1 },
    ]);
  });

  it("returns empty array for no buckets", () => {
    expect(getVelocityChartData(makeMetrics())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getVelocityBaseline
// ---------------------------------------------------------------------------

describe("getVelocityBaseline", () => {
  it("computes average across buckets", () => {
    const m = makeMetrics({
      velocity_buckets: [
        { hour: 0, count: 4 },
        { hour: 1, count: 6 },
      ],
    });
    expect(getVelocityBaseline(m)).toBe(5);
  });

  it("returns 0 for no buckets", () => {
    expect(getVelocityBaseline(makeMetrics())).toBe(0);
  });

  it("handles single bucket", () => {
    const m = makeMetrics({
      velocity_buckets: [{ hour: 0, count: 10 }],
    });
    expect(getVelocityBaseline(m)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getParticipationData
// ---------------------------------------------------------------------------

describe("getParticipationData", () => {
  it("transforms commenter_shares into label/value pairs", () => {
    const m = makeMetrics({
      commenter_shares: [
        { username: "alice", share: 0.4 },
        { username: "bob", share: 0.3 },
      ],
    });
    const result = getParticipationData(m);
    expect(result).toEqual([
      { label: "alice", value: 0.4 },
      { label: "bob", value: 0.3 },
    ]);
  });

  it("returns empty array for no shares", () => {
    expect(getParticipationData(makeMetrics())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSignalSpreadData
// ---------------------------------------------------------------------------

describe("getSignalSpreadData", () => {
  it("extracts signal spread percentages", () => {
    const m = makeMetrics({
      signal_strong_pct: 50,
      signal_moderate_pct: 30,
      signal_faint_pct: 20,
    });
    expect(getSignalSpreadData(m)).toEqual({
      strong: 50,
      moderate: 30,
      faint: 20,
    });
  });

  it("returns zeros when signal fields are absent (empty state)", () => {
    const result = getSignalSpreadData(makeMetrics());
    expect(result.strong).toBe(0);
    expect(result.moderate).toBe(0);
    expect(result.faint).toBe(0);
  });

  it("handles partial signal data (only strong set)", () => {
    const m = makeMetrics({ signal_strong_pct: 80 });
    const result = getSignalSpreadData(m);
    expect(result.strong).toBe(80);
    expect(result.moderate).toBe(0);
    expect(result.faint).toBe(0);
  });

  it("handles zero values explicitly set", () => {
    const m = makeMetrics({
      signal_strong_pct: 0,
      signal_moderate_pct: 0,
      signal_faint_pct: 0,
    });
    expect(getSignalSpreadData(m)).toEqual({
      strong: 0,
      moderate: 0,
      faint: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// getInteractionSignal
// ---------------------------------------------------------------------------

describe("getInteractionSignal", () => {
  it("returns 0 for null metrics", () => {
    expect(getInteractionSignal(null)).toBe(0);
  });

  it("returns 0 for undefined metrics", () => {
    expect(getInteractionSignal(undefined)).toBe(0);
  });

  it("returns the stored interaction signal value", () => {
    expect(
      getInteractionSignal(makeMetrics({ interaction_signal: 0.85 })),
    ).toBe(0.85);
  });

  it("returns 0 when interaction_signal is absent", () => {
    expect(getInteractionSignal(makeMetrics())).toBe(0);
  });

  it("handles boundary value 0.0", () => {
    expect(getInteractionSignal(makeMetrics({ interaction_signal: 0 }))).toBe(
      0,
    );
  });

  it("handles boundary value 1.0", () => {
    expect(getInteractionSignal(makeMetrics({ interaction_signal: 1.0 }))).toBe(
      1.0,
    );
  });
});

// ---------------------------------------------------------------------------
// getInteractionMethod
// ---------------------------------------------------------------------------

describe("getInteractionMethod", () => {
  it("returns 'unknown' for null metrics", () => {
    expect(getInteractionMethod(null)).toBe("unknown");
  });

  it("returns 'unknown' for undefined metrics", () => {
    expect(getInteractionMethod(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for empty object (DB default '{}')", () => {
    expect(getInteractionMethod({} as ArticleMetrics)).toBe("unknown");
  });

  it("returns 'llm' when interaction_method is 'llm'", () => {
    expect(
      getInteractionMethod(makeMetrics({ interaction_method: "llm" })),
    ).toBe("llm");
  });

  it("returns 'heuristic' when interaction_method is 'heuristic'", () => {
    expect(
      getInteractionMethod(makeMetrics({ interaction_method: "heuristic" })),
    ).toBe("heuristic");
  });

  it("returns 'unknown' when interaction_method is absent", () => {
    expect(getInteractionMethod(makeMetrics())).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// getTopicTags
// ---------------------------------------------------------------------------

describe("getTopicTags", () => {
  it("returns empty array for null metrics", () => {
    expect(getTopicTags(null)).toEqual([]);
  });

  it("returns empty array for undefined metrics", () => {
    expect(getTopicTags(undefined)).toEqual([]);
  });

  it("returns empty array for empty object (DB default '{}')", () => {
    expect(getTopicTags({} as ArticleMetrics)).toEqual([]);
  });

  it("returns the stored topic tags", () => {
    const tags = ["react", "performance", "testing"];
    expect(getTopicTags(makeMetrics({ topic_tags: tags }))).toEqual(tags);
  });

  it("returns empty array when topic_tags is absent", () => {
    expect(getTopicTags(makeMetrics())).toEqual([]);
  });

  it("handles single topic tag", () => {
    expect(getTopicTags(makeMetrics({ topic_tags: ["typescript"] }))).toEqual([
      "typescript",
    ]);
  });
});

// ---------------------------------------------------------------------------
// getInteractionVolatility
// ---------------------------------------------------------------------------

describe("getInteractionVolatility", () => {
  it("returns 0 for null metrics", () => {
    expect(getInteractionVolatility(null)).toBe(0);
  });

  it("returns 0 for undefined metrics", () => {
    expect(getInteractionVolatility(undefined)).toBe(0);
  });

  it("returns 0 for empty object (DB default '{}')", () => {
    expect(getInteractionVolatility({} as ArticleMetrics)).toBe(0);
  });

  it("returns the stored volatility value", () => {
    expect(
      getInteractionVolatility(makeMetrics({ interaction_volatility: 0.75 })),
    ).toBe(0.75);
  });

  it("returns 0 when interaction_volatility is absent", () => {
    expect(getInteractionVolatility(makeMetrics())).toBe(0);
  });

  it("handles boundary value 0.0", () => {
    expect(
      getInteractionVolatility(makeMetrics({ interaction_volatility: 0 })),
    ).toBe(0);
  });

  it("handles boundary value 1.0", () => {
    expect(
      getInteractionVolatility(makeMetrics({ interaction_volatility: 1.0 })),
    ).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// getConstructivenessData
// ---------------------------------------------------------------------------

describe("getConstructivenessData", () => {
  it("transforms constructiveness_buckets into x/y points", () => {
    const m = makeMetrics({
      constructiveness_buckets: [
        { hour: 0, depth_index: 0.5 },
        { hour: 1, depth_index: 1.5 },
      ],
    });
    const result = getConstructivenessData(m);
    expect(result).toEqual([
      { x: 0, y: 0.5 },
      { x: 1, y: 1.5 },
    ]);
  });

  it("returns empty array for no buckets", () => {
    expect(getConstructivenessData(makeMetrics())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRiskMarkers
// ---------------------------------------------------------------------------

describe("getRiskMarkers", () => {
  it("returns all markers with correct active states", () => {
    const m = makeMetrics({
      risk_components: {
        frequency_penalty: 2,
        short_content: true,
        no_engagement: false,
        promo_keywords: 1,
        repeated_links: 0,
        engagement_credit: 0,
      },
    });
    const markers = getRiskMarkers(m);

    expect(markers).toHaveLength(5);
    expect(markers[0]).toEqual({ label: "Frequency Penalty", active: true });
    expect(markers[1]).toEqual({ label: "Short Content", active: true });
    expect(markers[2]).toEqual({ label: "No Engagement", active: false });
    expect(markers[3]).toEqual({
      label: "Promotional Keywords",
      active: true,
    });
    expect(markers[4]).toEqual({ label: "Repeated Links", active: false });
  });

  it("returns all inactive for zero risk", () => {
    const markers = getRiskMarkers(makeMetrics());
    expect(markers.every((m) => !m.active)).toBe(true);
  });

  it("activates no_engagement and links when set", () => {
    const m = makeMetrics({
      risk_components: {
        frequency_penalty: 0,
        short_content: false,
        no_engagement: true,
        promo_keywords: 0,
        repeated_links: 2,
        engagement_credit: 0,
      },
    });
    const markers = getRiskMarkers(m);
    expect(markers[2].active).toBe(true);
    expect(markers[4].active).toBe(true);
  });
});
