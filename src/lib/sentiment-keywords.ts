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
