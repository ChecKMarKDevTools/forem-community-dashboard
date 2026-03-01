import type { Post } from "@/types/dashboard";

/** Attention-level metadata: badge variant and human-readable label.
 *  No traffic-light grading — each category has a distinct semantic color.
 *  neutral = slate (routine), info = steel-blue (active), teal = teal (waiting),
 *  attention = indigo/blue (high activity), critical = slate/gray (policy risk).
 */
export const ATTENTION_META: Record<
  string,
  {
    variant: "neutral" | "info" | "teal" | "attention" | "critical" | "outline";
    label: string;
  }
> = {
  NORMAL: { variant: "neutral", label: "Steady Signal" },
  BOOST_VISIBILITY: { variant: "info", label: "Trending Signal" },
  NEEDS_RESPONSE: { variant: "teal", label: "Awaiting Collaboration" },
  NEEDS_REVIEW: { variant: "attention", label: "Elevated Signal" },
  POSSIBLY_LOW_QUALITY: { variant: "critical", label: "Anomalous Signal" },
};

const DEFAULT_ATTENTION = {
  variant: "neutral" as const,
  label: "Steady Signal",
};

export function getAttentionVariant(
  level: string,
): "neutral" | "info" | "teal" | "attention" | "critical" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // "outline" only applies in the recent-posts context; main badges fall back to neutral
  return v === "outline" ? "neutral" : v;
}

export function getCategoryLabel(level: string): string {
  return (ATTENTION_META[level] ?? DEFAULT_ATTENTION).label;
}

export function getRecentPostBadgeVariant(
  level: string,
): "neutral" | "info" | "teal" | "attention" | "critical" | "outline" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // neutral (routine) maps to outline for recent-posts context
  return v === "neutral" ? "outline" : v;
}

/** Overall qualitative level for the total score. */
const QUALITATIVE_HIGH = 50;
const QUALITATIVE_MODERATE = 20;

export function getQualitativeLevel(score: number): string {
  if (score >= QUALITATIVE_HIGH) return "Elevated";
  if (score >= QUALITATIVE_MODERATE) return "Notable";
  return "Nominal";
}

/** Score-specific qualitative labels for breakdown bars. */
export function getScoreQualitativeLabel(
  category: string,
  value: number,
): string {
  if (category === "heat") {
    if (value >= 10) return "Elevated";
    if (value >= 5) return "Notable";
    return "Nominal";
  }
  if (category === "risk") {
    if (value >= 4) return "Elevated";
    if (value >= 1) return "Notable";
    return "Nominal";
  }
  if (category === "support") {
    if (value >= 4) return "Elevated";
    if (value >= 2) return "Notable";
    return "Nominal";
  }
  return getQualitativeLevel(value);
}

export function getScoreBarClass(value: number): string {
  if (value > 20) return "bg-state-negative";
  if (value > 10) return "bg-state-warning";
  return "bg-accent-primary";
}

/** Extract word count from explanations array (e.g., "Word Count: 1000") */
export function extractWordCount(explanations?: string[]): number {
  if (!explanations) return 0;
  const wcLine = explanations.find((e) => e.startsWith("Word Count:"));
  if (!wcLine) return 0;
  const match = /\d+/.exec(wcLine);
  return match ? Number(match[0]) : 0;
}

/**
 * Parse the explanations array into a score_breakdown object.
 * The sync pipeline stores scores as strings like "Heat Score: 7.50",
 * "Risk Score: 2 (freq: 0, promo: 1, engage: -2)", "Support Score: 3".
 */
export function parseScoreBreakdown(
  explanations?: string[],
): Record<string, number> {
  if (!explanations) return {};
  const breakdown: Record<string, number> = {};
  for (const exp of explanations) {
    if (exp.startsWith("Heat Score:")) {
      breakdown.heat = Number.parseFloat(exp.split(":")[1]);
    } else if (exp.startsWith("Risk Score:")) {
      // "Risk Score: 2 (freq: ...)" — grab the leading number
      const match = /Risk Score:\s*([\d.]+)/.exec(exp);
      if (match) breakdown.risk = Number.parseFloat(match[1]);
    } else if (exp.startsWith("Support Score:")) {
      breakdown.support = Number.parseFloat(exp.split(":")[1]);
    }
  }
  return breakdown;
}

function getHeatNarrative(value: number): string {
  if (value >= 10)
    return "Reply rate is higher than typical; reactions are mixed.";
  if (value >= 5) return "Replies are arriving faster than usual.";
  return "Normal conversation pace with steady engagement.";
}

function getRiskNarrative(value: number): string {
  if (value >= 6)
    return "Multiple risk signals detected: possible spam or self-promotion.";
  if (value >= 4)
    return "Some risk flags raised — short content or promotional language.";
  if (value >= 1) return "Minor flags present but likely not concerning.";
  return "No rule-risk patterns detected.";
}

function getSupportNarrative(value: number): string {
  if (value >= 4)
    return "Author appears to need community help — new user with little engagement.";
  if (value >= 2)
    return "Some signs the author could use encouragement or a response.";
  return "Replies are frequent but rarely build on each other.";
}

/** Human-readable display names for score categories. */
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  heat: "Activity Level",
  risk: "Signal Divergence",
  support: "Constructiveness",
};

/** Return the display name for a score category key. */
export function getCategoryDisplayName(category: string): string {
  return CATEGORY_DISPLAY_NAMES[category] ?? category;
}

/** Plain-English explanation for each score type so moderators understand what they mean. */
export function getScoreNarrative(category: string, value: number): string {
  if (category === "heat") return getHeatNarrative(value);
  if (category === "risk") return getRiskNarrative(value);
  if (category === "support") return getSupportNarrative(value);
  return "";
}

/** Derive a contextual behavior description from explanation signals for list-view badges. */
export function getBehaviorDescription(post: Post): string {
  return getCategoryLabel(post.attention_level);
}

/** Observational summary of what's happening in the conversation. */
export function getWhatsHappening(explanations?: string[]): string {
  const breakdown = parseScoreBreakdown(explanations);
  const heat = breakdown.heat ?? 0;
  const risk = breakdown.risk ?? 0;
  const support = breakdown.support ?? 0;

  if (risk >= 6) return "Patterns match known problem behaviors.";
  if (risk >= 4) return "Signals suggest the discussion may drift off-topic.";
  if (heat >= 10) return "Replies are arriving faster than typical.";
  if (heat >= 5)
    return "Participants are reacting to each other more than the topic.";
  if (support >= 3) return "People are waiting on feedback.";
  return "Tone is becoming sharper between participants.";
}

/** Hover-text descriptions for each signal in the Conversation Pattern Signals card. */
export const SIGNAL_TOOLTIPS: Record<string, string> = {
  "Word Count":
    "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
  "Unique Commenters":
    "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
  Effort:
    "Rough estimate of how much thinking and replying participants put in; long thoughtful replies raise it, short reactions barely move it.",
  "Attention Delta":
    "Measures how quickly people started paying attention compared to normal; spikes mean the topic suddenly caught eyes.",
  "Heat Score":
    "Emotional intensity of replies; disagreement and passion raise it, calm discussion lowers it.",
  "Risk Score":
    "Probability the thread breaks platform rules; zero means nothing looks unsafe, even if people disagree loudly.",
  "Support Score":
    "Signs of constructive interaction like helping, clarifying, or agreeing; higher means collaborative tone.",
};

/** Display-name overrides for signal prefixes shown in the Conversation Signals card. */
const SIGNAL_DISPLAY_NAMES: Record<string, string> = {
  "Unique Commenters": "Participants",
  Effort: "Effort Score",
  "Attention Delta": "Attention Shift",
};

/** Extract the signal name (text before the colon) from an explanation string. */
export function getSignalName(explanation: string): string {
  const colonIndex = explanation.indexOf(":");
  if (colonIndex === -1) return "";
  return explanation.slice(0, colonIndex).trim();
}

/**
 * Format a raw explanation string for display.
 * Renames known signal prefixes and rounds numeric values to integers.
 */
export function formatSignalDisplay(explanation: string): string {
  const colonIndex = explanation.indexOf(":");
  if (colonIndex === -1) return explanation;

  const rawName = explanation.slice(0, colonIndex).trim();
  const rawValue = explanation.slice(colonIndex + 1).trim();
  const displayName = SIGNAL_DISPLAY_NAMES[rawName] ?? rawName;

  const parsed = Number.parseFloat(rawValue);
  const displayValue = Number.isNaN(parsed)
    ? rawValue
    : String(Math.round(parsed));

  return `${displayName}: ${displayValue}`;
}

/** Signals already shown in the Score Breakdown card — filter them from Activity Signals. */
export const SCORE_BREAKDOWN_SIGNALS = new Set([
  "Heat Score",
  "Risk Score",
  "Support Score",
]);

/** Compute age in hours from published_at timestamp */
export function computeAgeHours(published_at: string): number {
  const ageMs = Date.now() - new Date(published_at).getTime();
  return Math.round(ageMs / (1000 * 60 * 60));
}

/** Priority order for attention levels in the queue list */
export const ATTENTION_PRIORITY: Record<string, number> = {
  NEEDS_RESPONSE: 0,
  BOOST_VISIBILITY: 1,
  NEEDS_REVIEW: 2,
  POSSIBLY_LOW_QUALITY: 3,
  NORMAL: 4,
};

/** Sort posts by attention level priority, then by score descending within each group */
export function sortByAttentionPriority(posts: Post[]): Post[] {
  return posts.toSorted((a, b) => {
    const priorityDiff =
      (ATTENTION_PRIORITY[a.attention_level] ?? 4) -
      (ATTENTION_PRIORITY[b.attention_level] ?? 4);
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });
}
