/**
 * Keyword lists for keyword-based detection.
 *
 * Shared between the server-side sync pipeline (`sync.ts`) and client-side
 * UI components (e.g. `Dashboard.tsx`). Extracted into its own module so
 * client components do not need to import the server-only sync pipeline.
 */

export const POSITIVE_WORDS: ReadonlySet<string> = new Set([
  "awesome",
  "great",
  "excellent",
  "love",
  "good",
  "amazing",
  "thanks",
  "helpful",
]);

export const NEGATIVE_WORDS: ReadonlySet<string> = new Set([
  "terrible",
  "bad",
  "awful",
  "hate",
  "unhelpful",
  "wrong",
  "broken",
  "issue",
  "bug",
]);

/**
 * Phrases that indicate a commenter or author is asking for help.
 * Used by the sync pipeline to compute `help_keywords` (a component of
 * `support_score`), which in turn contributes to the NEEDS_RESPONSE category.
 * Exported so the UI can surface these phrases in tooltips (metric transparency).
 */
export const HELP_WORDS: ReadonlyArray<string> = [
  "stuck",
  "confused",
  "need help",
  "why doesn't",
  "how do i",
  "what am i missing",
  "beginner question",
];

/**
 * Phrases indicating emotional distress, burnout, or help-seeking in post bodies.
 * Used as a keyword safety net when both LLM tiers fail (heuristic fallback).
 * The sync pipeline scans the lowercased post body for phrase matches; >= 2
 * matches triggers `needs_support: true`. Exported for UI tooltip transparency.
 */
export const SUPPORT_SIGNAL_PHRASES: ReadonlyArray<string> = [
  "i'm struggling",
  "feeling overwhelmed",
  "burned out",
  "burnout",
  "mental health",
  "feeling alone",
  "i can't cope",
  "considering quitting",
  "imposter syndrome",
  "i'm lost",
  "don't know what to do",
  "need someone to talk to",
  "feeling isolated",
  "i'm failing",
  "can't keep up",
];

/** Count how many SUPPORT_SIGNAL_PHRASES appear in the given text (lowercased). */
export function countSupportPhrases(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of SUPPORT_SIGNAL_PHRASES) {
    if (lower.includes(phrase)) count++;
  }
  return count;
}
