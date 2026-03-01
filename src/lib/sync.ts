import {
  ForemArticle,
  ForemUser,
  ForemComment,
  ForemClient,
} from "@/lib/forem";
import { supabase } from "@/lib/supabase";
import type { AttentionCategory } from "@/types/dashboard";
import type { ArticleMetrics } from "@/types/metrics";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Maximum age of articles to consider for scoring.
 * 5 days matches the purge horizon — anything older is deleted after sync.
 */
export const SYNC_WINDOW_HOURS = 120; // 5 days

/** Articles older than this are purged after each sync run. */
export const PURGE_AGE_HOURS = 120; // 5 days

/**
 * Forem API hard limit: 30 requests per 30 seconds.
 * The RequestQueue in forem.ts already enforces ≤5 parallel with a 1s
 * cooldown between batches. Fetching pages sequentially stays well within
 * the budget even for full 7-day bacfkill runs (typically 4–7 pages).
 */
export const MAX_PER_PAGE = 100;

/** Resolves User from API, caching them logically (but ForemClient handles underlying caching too) */
async function resolveUser(
  username: string,
  userCache: Map<string, ForemUser | null>,
): Promise<ForemUser | null> {
  if (userCache.has(username)) return userCache.get(username) ?? null;
  const user = await ForemClient.getUserByUsername(username);
  userCache.set(username, user);
  return user;
}

// Math Helpers for Pipeline
function getAgeHours(published_at: string): number {
  return (Date.now() - new Date(published_at).getTime()) / (1000 * 60 * 60);
}

function stripHtmlTags(html: string): string {
  // Character-walking approach: O(n) with no regex backtracking risk (Sonar S5852).
  // Skips everything between '<' and '>' in a single pass, which also handles
  // nested/malformed fragments that a single-pass regex could miss
  // (CodeQL: incomplete-multi-character-sanitization).
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") {
      inTag = true;
    } else if (ch === ">") {
      inTag = false;
    } else if (!inTag) {
      out += ch;
    }
  }
  return out;
}

function countWords(textHtml?: string): number {
  if (!textHtml) return 0;
  return stripHtmlTags(textHtml)
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// Sentiment keyword lists — exported so the UI can surface them as helper text
// (Metric Transparency: every signal must be visible in the UI).
// Sets for O(1) lookups (S7776).
export const POSITIVE_WORDS = new Set([
  "awesome",
  "great",
  "excellent",
  "love",
  "good",
  "amazing",
  "thanks",
  "helpful",
]);
export const NEGATIVE_WORDS = new Set([
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

const PROMO_WORDS = [
  "subscribe",
  "follow",
  "check out",
  "buy",
  "sale",
  "link in bio",
];
const HELP_WORDS = [
  "stuck",
  "confused",
  "need help",
  "why doesn't",
  "how do i",
  "what am i missing",
  "beginner question",
];

/** Accumulated metrics from comment tree traversal */
interface CommentMetrics {
  uniqueCommenters: Set<string>;
  totalCommentWords: number;
  pos_comments: number;
  neg_comments: number;
  alternating_pairs: number;
  replies_with_parent: number;
  promo_keywords: number;
  help_keywords: number;
  externalDomainCounts: Map<string, number>;
  comment_timestamps: Date[];
  commenter_comment_counts: Map<string, number>;
  comment_depths: Array<{ timestamp: Date; depth: number }>;
}

function createEmptyMetrics(): CommentMetrics {
  return {
    uniqueCommenters: new Set<string>(),
    totalCommentWords: 0,
    pos_comments: 0,
    neg_comments: 0,
    alternating_pairs: 0,
    replies_with_parent: 0,
    promo_keywords: 0,
    help_keywords: 0,
    externalDomainCounts: new Map<string, number>(),
    comment_timestamps: [],
    commenter_comment_counts: new Map<string, number>(),
    comment_depths: [],
  };
}

/** Analyze sentiment of a single comment's text */
function analyzeSentiment(words: string[], metrics: CommentMetrics): void {
  if (words.some((w) => POSITIVE_WORDS.has(w))) metrics.pos_comments++;
  if (words.some((w) => NEGATIVE_WORDS.has(w))) metrics.neg_comments++;
}

/** Count keyword matches for a single comment */
function detectKeywords(
  txt: string,
  commenter: string,
  articleAuthor: string,
  metrics: CommentMetrics,
): void {
  // Only count promo words from the article author
  if (commenter === articleAuthor) {
    for (const pw of PROMO_WORDS) {
      if (txt.includes(pw)) metrics.promo_keywords++;
    }
  }
  for (const hw of HELP_WORDS) {
    if (txt.includes(hw)) metrics.help_keywords++;
  }
}

/** Track external link domains from a comment's HTML */
function trackExternalLinks(bodyHtml: string, metrics: CommentMetrics): void {
  const hrefMatches = bodyHtml.match(/href="https?:\/\/([^"/?#]+)/gi);
  if (!hrefMatches) return;
  for (const m of hrefMatches) {
    const domain = m.replace(/href="https?:\/\//i, "").toLowerCase();
    metrics.externalDomainCounts.set(
      domain,
      (metrics.externalDomainCounts.get(domain) ?? 0) + 1,
    );
  }
}

/** Process a single comment node (non-recursive part) */
function processOneComment(
  c: ForemComment,
  articleAuthor: string,
  metrics: CommentMetrics,
  parentAuthor?: string,
  depth: number = 0,
): void {
  // Deleted Forem accounts return null usernames — skip identity-dependent
  // tracking but still count the comment's text, timestamps, and keywords.
  const commenter = c.user?.username ?? null;

  if (commenter) {
    metrics.uniqueCommenters.add(commenter);
    metrics.commenter_comment_counts.set(
      commenter,
      (metrics.commenter_comment_counts.get(commenter) ?? 0) + 1,
    );
  }

  const txt = c.body_html.toLowerCase();
  metrics.totalCommentWords += countWords(c.body_html);

  // Track timestamp and depth for velocity/constructiveness buckets
  const commentDate = new Date(c.created_at);
  metrics.comment_timestamps.push(commentDate);
  metrics.comment_depths.push({ timestamp: commentDate, depth });

  if (parentAuthor) {
    metrics.replies_with_parent++;
    if (c.children && c.children.length > 0) {
      const replyAuthor = c.children[0].user?.username ?? null;
      if (replyAuthor && replyAuthor === parentAuthor)
        metrics.alternating_pairs++;
    }
  }

  analyzeSentiment(txt.split(/\W+/), metrics);
  detectKeywords(txt, commenter ?? "", articleAuthor, metrics);
  trackExternalLinks(c.body_html, metrics);
}

/** Recursively walk comment tree and accumulate metrics */
function processCommentTree(
  thread: ForemComment[],
  articleAuthor: string,
  metrics: CommentMetrics,
  parentAuthor?: string,
  depth: number = 0,
): void {
  for (const c of thread) {
    processOneComment(c, articleAuthor, metrics, parentAuthor, depth);
    if (c.children && c.children.length > 0) {
      processCommentTree(
        c.children,
        articleAuthor,
        metrics,
        c.user?.username ?? undefined,
        depth + 1,
      );
    }
  }
}

/** Compute risk score with frequency penalty and engagement credit */
function computeRiskScore(
  author_post_frequency: number,
  word_count: number,
  reaction_count: number,
  comment_count: number,
  promo_keywords: number,
  repeated_links: number,
  distinct_commenters: number,
): {
  risk_score: number;
  frequency_penalty: number;
  engagement_credit: number;
} {
  // Only penalize posting frequency above 2/day (normal for staff/active users)
  const frequency_penalty = Math.max(0, author_post_frequency - 2) * 2;
  // Engagement credit: high-traction posts are unlikely to be low quality
  const engagement_credit =
    (reaction_count >= 10 ? 2 : 0) + (distinct_commenters >= 5 ? 1 : 0);
  const risk_score = Math.max(
    0,
    frequency_penalty +
      (word_count < 120 ? 2 : 0) +
      (reaction_count === 0 && comment_count === 0 ? 2 : 0) +
      promo_keywords +
      repeated_links -
      engagement_credit,
  );
  return { risk_score, frequency_penalty, engagement_credit };
}

/** Bundled inputs for the classification function (S107: max 7 params) */
interface ClassificationInput {
  readonly article: ForemArticle;
  readonly time_since_post: number;
  readonly support_score: number;
  readonly risk_score: number;
  readonly comment_count: number;
  readonly reaction_count: number;
  readonly heat_score: number;
  readonly word_count: number;
  readonly distinct_commenters: number;
  readonly avg_comment_length: number;
  readonly attention_delta: number;
}

/** Classify an article into an attention category */
function classifyArticle(
  input: Readonly<ClassificationInput>,
): AttentionCategory {
  // Official devteam org posts (weekly threads, challenges) skip classification
  if (input.article.organization?.slug === "devteam") return "NORMAL";

  if (input.time_since_post >= 30 && input.support_score >= 3)
    return "NEEDS_RESPONSE";
  if (input.risk_score >= 4) return "SIGNAL_AT_RISK";
  if (
    input.comment_count >= 6 &&
    input.heat_score >= 5 &&
    input.comment_count > 0 &&
    input.reaction_count / input.comment_count < 1.2
  ) {
    return "NEEDS_REVIEW";
  }
  if (
    input.word_count >= 600 &&
    input.distinct_commenters >= 2 &&
    input.avg_comment_length >= 18 &&
    input.reaction_count <= 5 &&
    input.attention_delta >= 3
  ) {
    return "BOOST_VISIBILITY";
  }
  return "NORMAL";
}

/** Check if any external domain appears more than 2 times in comments */
function detectRepeatedLinks(domainCounts: Map<string, number>): number {
  for (const count of domainCounts.values()) {
    if (count > 2) return 2;
  }
  return 0;
}

/** Compute derived metrics from raw comment data and article stats */
interface DerivedMetrics {
  distinct_commenters: number;
  avg_comment_length: number;
  heat_score: number;
  attention_delta: number;
  effort: number;
}

function computeDerivedMetrics(
  metrics: CommentMetrics,
  comment_count: number,
  reaction_count: number,
  time_since_post: number,
  word_count: number,
): DerivedMetrics {
  const distinct_commenters = metrics.uniqueCommenters.size;
  const comments_per_hour = comment_count / Math.max(1, time_since_post / 60);
  const avg_comment_length =
    comment_count > 0 ? metrics.totalCommentWords / comment_count : 0;
  const reply_ratio = metrics.replies_with_parent / Math.max(1, comment_count);
  const effort =
    Math.log2(word_count + 1) + distinct_commenters + avg_comment_length / 40;
  const exposure = Math.max(1, reaction_count + comment_count);
  const attention_delta = effort - Math.log2(exposure + 1);
  const sentiment_flips =
    Math.abs(metrics.pos_comments - metrics.neg_comments) /
    Math.max(1, comment_count);
  const heat_score =
    comments_per_hour +
    reply_ratio * 3 +
    metrics.alternating_pairs +
    sentiment_flips;

  return {
    distinct_commenters,
    avg_comment_length,
    heat_score,
    attention_delta,
    effort,
  };
}

// ---------------------------------------------------------------------------
// ArticleMetrics builder helpers
// ---------------------------------------------------------------------------

const MAX_VELOCITY_BUCKETS = 48;

/** Bucket comment timestamps into hourly bins relative to article publication. */
export function buildVelocityBuckets(
  timestamps: ReadonlyArray<Date>,
  publishedAt: string,
): Array<{ hour: number; count: number }> {
  const pubTime = new Date(publishedAt).getTime();
  const bucketMap = new Map<number, number>();
  for (const ts of timestamps) {
    const hoursSincePost = Math.floor(
      (ts.getTime() - pubTime) / (1000 * 60 * 60),
    );
    const hour = Math.max(0, hoursSincePost);
    bucketMap.set(hour, (bucketMap.get(hour) ?? 0) + 1);
  }
  return Array.from(bucketMap.entries())
    .toSorted(([a], [b]) => a - b)
    .slice(0, MAX_VELOCITY_BUCKETS)
    .map(([hour, count]) => ({ hour, count }));
}

/** Build constructiveness buckets: average reply depth per hour. */
export function buildConstructivenessBuckets(
  commentDepths: ReadonlyArray<{ timestamp: Date; depth: number }>,
  publishedAt: string,
): Array<{ hour: number; depth_index: number }> {
  const pubTime = new Date(publishedAt).getTime();
  const bucketMap = new Map<number, { totalDepth: number; count: number }>();
  for (const { timestamp, depth } of commentDepths) {
    const hour = Math.max(
      0,
      Math.floor((timestamp.getTime() - pubTime) / (1000 * 60 * 60)),
    );
    const existing = bucketMap.get(hour) ?? { totalDepth: 0, count: 0 };
    existing.totalDepth += depth;
    existing.count += 1;
    bucketMap.set(hour, existing);
  }
  return Array.from(bucketMap.entries())
    .toSorted(([a], [b]) => a - b)
    .slice(0, MAX_VELOCITY_BUCKETS)
    .map(([hour, { totalDepth, count }]) => ({
      hour,
      depth_index: count > 0 ? totalDepth / count : 0,
    }));
}

/** Build top-5 commenter share distribution. */
export function buildCommenterShares(
  commenterCounts: ReadonlyMap<string, number>,
  totalComments: number,
): Array<{ username: string; share: number }> {
  if (totalComments === 0) return [];
  return Array.from(commenterCounts.entries())
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([username, count]) => ({
      username,
      share: count / totalComments,
    }));
}

/** Compute sentiment percentages from pos/neg counts and total comments. */
export function buildSentimentSpread(
  posComments: number,
  negComments: number,
  totalComments: number,
): { positive_pct: number; neutral_pct: number; negative_pct: number } {
  if (totalComments === 0) {
    return { positive_pct: 0, neutral_pct: 100, negative_pct: 0 };
  }
  const positive_pct = (posComments / totalComments) * 100;
  const negative_pct = (negComments / totalComments) * 100;
  const neutral_pct = Math.max(0, 100 - positive_pct - negative_pct);
  return { positive_pct, neutral_pct, negative_pct };
}

/** Assemble the full ArticleMetrics object from comment tree data. */
interface BuildMetricsInput {
  readonly metrics: CommentMetrics;
  readonly publishedAt: string;
  readonly commentCount: number;
  readonly ageHours: number;
  readonly riskScore: number;
  readonly frequencyPenalty: number;
  readonly engagementCredit: number;
  readonly wordCount: number;
  readonly reactionCount: number;
  readonly repeatedLinks: number;
  readonly isFirstPost: boolean;
}

export function buildArticleMetrics(
  input: Readonly<BuildMetricsInput>,
): ArticleMetrics {
  const { metrics, publishedAt, commentCount, ageHours } = input;

  const velocityBuckets = buildVelocityBuckets(
    metrics.comment_timestamps,
    publishedAt,
  );
  const constructivenessBuckets = buildConstructivenessBuckets(
    metrics.comment_depths,
    publishedAt,
  );
  const commenterShares = buildCommenterShares(
    metrics.commenter_comment_counts,
    commentCount,
  );
  const sentiment = buildSentimentSpread(
    metrics.pos_comments,
    metrics.neg_comments,
    commentCount,
  );

  const commentsPerHour = commentCount / Math.max(1, ageHours);
  const avgCommentLength =
    commentCount > 0 ? metrics.totalCommentWords / commentCount : 0;
  const replyRatio = metrics.replies_with_parent / Math.max(1, commentCount);
  const sentimentFlips = Math.abs(metrics.pos_comments - metrics.neg_comments);

  return {
    velocity_buckets: velocityBuckets,
    comments_per_hour: commentsPerHour,
    commenter_shares: commenterShares,
    positive_pct: sentiment.positive_pct,
    neutral_pct: sentiment.neutral_pct,
    negative_pct: sentiment.negative_pct,
    constructiveness_buckets: constructivenessBuckets,
    avg_comment_length: avgCommentLength,
    reply_ratio: replyRatio,
    alternating_pairs: metrics.alternating_pairs,
    risk_components: {
      frequency_penalty: input.frequencyPenalty,
      short_content: input.wordCount < 120,
      no_engagement: input.reactionCount === 0 && commentCount === 0,
      promo_keywords: metrics.promo_keywords,
      repeated_links: input.repeatedLinks,
      engagement_credit: input.engagementCredit,
    },
    risk_score: input.riskScore,
    sentiment_flips: sentimentFlips,
    is_first_post: input.isFirstPost,
    help_keywords: metrics.help_keywords,
  };
}

/** Bundled inputs for the deep-scoring function (S107: max 7 params) */
interface DeepScoreInput {
  readonly article: ForemArticle;
  readonly username: string;
  readonly word_count: number;
  readonly age_hours: number;
  readonly author_post_frequency: number;
  readonly preliminary_score: number;
  readonly detailedUser: ForemUser | null;
  readonly postsByAuthor24h: Map<string, number>;
}

/** Deep-score a single article: fetch comments, compute metrics, classify, persist */
async function deepScoreAndPersist(
  input: Readonly<DeepScoreInput>,
): Promise<void> {
  const {
    article,
    username,
    word_count: fallback_word_count,
    age_hours,
    author_post_frequency,
    preliminary_score,
    detailedUser,
    postsByAuthor24h,
  } = input;

  let word_count = fallback_word_count;
  try {
    const fullArticle = await ForemClient.getArticle(article.id);
    word_count = countWords(
      fullArticle.body_markdown || fullArticle.body_html || "",
    );
  } catch {
    // Fallback: use the estimate passed from lightScoreAndRank if article fetch fails
    word_count = fallback_word_count;
  }

  const comments = await ForemClient.getComments(article.id);

  const comment_count = article.comments_count;
  const reaction_count = article.public_reactions_count;
  const time_since_post = age_hours * 60; // in minutes

  const metrics = createEmptyMetrics();
  processCommentTree(comments, username, metrics);

  const derived = computeDerivedMetrics(
    metrics,
    comment_count,
    reaction_count,
    time_since_post,
    word_count,
  );

  const repeated_links = detectRepeatedLinks(metrics.externalDomainCounts);

  const { risk_score, frequency_penalty, engagement_credit } = computeRiskScore(
    author_post_frequency,
    word_count,
    reaction_count,
    comment_count,
    metrics.promo_keywords,
    repeated_links,
    derived.distinct_commenters,
  );

  const is_first_post = detailedUser
    ? (Date.now() - new Date(detailedUser.joined_at).getTime()) /
        (1000 * 60 * 60 * 24) <
        30 && postsByAuthor24h.get(username) === 1
    : false;
  const support_score =
    (is_first_post ? 2 : 0) +
    (reaction_count === 0 ? 1 : 0) +
    (comment_count === 0 ? 2 : 0) +
    metrics.help_keywords;

  const category = classifyArticle({
    article,
    time_since_post,
    support_score,
    risk_score,
    comment_count,
    reaction_count,
    heat_score: derived.heat_score,
    word_count,
    distinct_commenters: derived.distinct_commenters,
    avg_comment_length: derived.avg_comment_length,
    attention_delta: derived.attention_delta,
  });

  const final_score = Math.max(0, preliminary_score);

  const explanations = [
    `Word Count: ${word_count}`,
    `Unique Commenters: ${derived.distinct_commenters}`,
    `Effort: ${derived.effort.toFixed(2)}`,
    `Attention Delta: ${derived.attention_delta.toFixed(2)}`,
    `Heat Score: ${derived.heat_score.toFixed(2)}`,
    `Risk Score: ${risk_score} (freq: ${frequency_penalty}, promo: ${metrics.promo_keywords}, engage: -${engagement_credit})`,
    `Support Score: ${support_score}`,
  ];

  const articleMetrics = buildArticleMetrics({
    metrics,
    publishedAt: article.published_at,
    commentCount: comment_count,
    ageHours: age_hours,
    riskScore: risk_score,
    frequencyPenalty: frequency_penalty,
    engagementCredit: engagement_credit,
    wordCount: word_count,
    reactionCount: reaction_count,
    repeatedLinks: repeated_links,
    isFirstPost: is_first_post,
  });

  const { error: articleError } = await supabase.from("articles").upsert({
    id: article.id,
    author: username,
    published_at: article.published_at,
    reactions: reaction_count,
    comments: comment_count,
    tags: article.tag_list,
    canonical_url: article.canonical_url,
    dev_url: article.url,
    score: Math.round(final_score),
    attention_level: category,
    explanations: explanations,
    title: article.title,
    updated_at: new Date().toISOString(),
    metrics: articleMetrics,
  });

  if (articleError) throw new Error(articleError.message);

  // Save commenters for simple integrity tracking mapping.
  // uniqueCommenters only contains non-null usernames (deleted accounts are
  // filtered out in processOneComment), so every entry is safe to upsert.
  for (const commenter of Array.from(metrics.uniqueCommenters)) {
    const { error: commenterError } = await supabase
      .from("commenters")
      .upsert(
        { article_id: article.id, username: commenter },
        { onConflict: "article_id,username" },
      );
    if (commenterError) throw new Error(commenterError.message);
  }
}

/**
 * Fetch pages from Forem until we either run out of articles or the oldest
 * article on the page exceeds the sync window age. Articles are returned
 * newest-first by the API, so the first article older than the window on any
 * page means all subsequent pages are also outside the window.
 *
 * This approach respects the API rate limit naturally: each page is a single
 * request, and the RequestQueue in forem.ts throttles to ≤5 parallel with a
 * 1s cooldown — well under the 30 req/30 s hard cap.
 */
async function fetchAndFilterArticles(): Promise<{
  allArticles: ForemArticle[];
  validArticles: ForemArticle[];
}> {
  const allArticles: ForemArticle[] = [];
  let page = 1;

  while (true) {
    const batch = await ForemClient.getLatestArticles(page, MAX_PER_PAGE);

    // API returned an empty page — we've exhausted all available articles
    if (batch.length === 0) break;

    allArticles.push(...batch);

    // The batch is newest-first; the last item is the oldest on this page.
    // If it's already outside our window, all subsequent pages will be too.
    const oldestOnPage = batch.at(-1)!;
    if (getAgeHours(oldestOnPage.published_at) > SYNC_WINDOW_HOURS) break;

    page++;
  }

  const validArticles = allArticles.filter((a) => {
    const ageHours = getAgeHours(a.published_at);
    // Lower bound: skip articles published in the last 2 hours — they're too
    // fresh for meaningful scoring (low comment/reaction signal).
    return ageHours >= 2 && ageHours <= SYNC_WINDOW_HOURS;
  });

  return { allArticles, validArticles };
}

/** Count posts per author from the last 24 h. */
function buildAuthorFrequencies(
  allArticles: ForemArticle[],
): Map<string, number> {
  const postsByAuthor24h = new Map<string, number>();
  for (const a of allArticles) {
    if (getAgeHours(a.published_at) <= 24) {
      postsByAuthor24h.set(
        a.user.username,
        (postsByAuthor24h.get(a.user.username) || 0) + 1,
      );
    }
  }
  return postsByAuthor24h;
}

/**
 * Light-score all articles to produce a ranked list for deep processing.
 * No cap: every article in the window is scored and persisted. The display
 * limit (top 50, non-NORMAL first) is enforced at query time by the API route.
 */
function lightScoreAndRank(
  validArticles: ForemArticle[],
  postsByAuthor24h: Map<string, number>,
) {
  return validArticles
    .map((article) => {
      const word_count = article.reading_time_minutes * 200;
      const author_post_frequency =
        postsByAuthor24h.get(article.user.username) || 1;
      const age_hours = getAgeHours(article.published_at);
      const preliminary_score =
        article.public_reactions_count +
        article.comments_count * 2 +
        word_count / 100 -
        age_hours -
        author_post_frequency;

      return {
        article,
        preliminary_score,
        word_count,
        age_hours,
        author_post_frequency,
      };
    })
    .sort((a, b) => b.preliminary_score - a.preliminary_score);
}

/** Ensure author row exists in the users table (upsert once per sync run). */
async function ensureAuthorUpserted(
  username: string,
  detailedUser: ForemUser,
  upsertedAuthors: Set<string>,
): Promise<void> {
  if (upsertedAuthors.has(username)) return;
  const { error: userError } = await supabase.from("users").upsert({
    username: detailedUser.username,
    joined_at: detailedUser.joined_at,
    updated_at: new Date().toISOString(),
  });
  if (userError) throw new Error(userError.message);
  upsertedAuthors.add(username);
}

/**
 * Delete articles published more than PURGE_AGE_HOURS ago.
 * The commenters table has ON DELETE CASCADE, so child rows are cleaned up
 * automatically. Returns the count of deleted rows.
 */
async function purgeStaleArticles(): Promise<number> {
  const cutoff = new Date(
    Date.now() - PURGE_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("articles")
    .delete()
    .lt("published_at", cutoff)
    .select("id");

  if (error) {
    console.error("Purge failed:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Backfill articles that were persisted with empty metrics (e.g. because the
 * metrics column did not exist in PostgREST's cached schema at the time of the
 * original sync, or because the paginated API didn't return them).
 *
 * Queries Supabase for articles within the sync window that have empty `{}`
 * metrics, fetches each individually from the Forem API by ID, and re-runs
 * `deepScoreAndPersist` on them.
 */
async function backfillEmptyMetrics(
  allArticles: ForemArticle[],
  userCache: Map<string, ForemUser | null>,
  upsertedAuthors: Set<string>,
): Promise<SyncResult> {
  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  const windowCutoff = new Date(
    Date.now() - SYNC_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: emptyRows, error: queryError } = await supabase
    .from("articles")
    .select("id")
    .eq("metrics", {})
    .gte("published_at", windowCutoff);

  if (queryError || !emptyRows || emptyRows.length === 0)
    return { synced, failed, errors };

  // Build author frequency map from what we already fetched
  const postsByAuthor24h = buildAuthorFrequencies(allArticles);

  for (const row of emptyRows) {
    try {
      const article = await ForemClient.getArticle(row.id, false);
      const username = article.user.username;
      const age_hours = getAgeHours(article.published_at);
      const word_count = article.reading_time_minutes * 200;
      const author_post_frequency = postsByAuthor24h.get(username) || 1;
      const preliminary_score =
        article.public_reactions_count +
        article.comments_count * 2 +
        word_count / 100 -
        age_hours -
        author_post_frequency;

      const detailedUser = await resolveUser(username, userCache);
      if (detailedUser) {
        await ensureAuthorUpserted(username, detailedUser, upsertedAuthors);
      }

      await deepScoreAndPersist({
        article,
        username,
        word_count,
        age_hours,
        author_post_frequency,
        preliminary_score,
        detailedUser,
        postsByAuthor24h,
      });

      synced++;
    } catch (err: unknown) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Backfill article ${row.id}: ${message}`);
    }
  }

  return { synced, failed, errors };
}

/**
 * Main sync entry point.
 *
 * Fetches all articles published within the last SYNC_WINDOW_HOURS (5 days),
 * deep-scores every one of them, upserts results to Supabase, backfills any
 * articles with empty metrics, and purges articles older than PURGE_AGE_HOURS.
 * No article cap is applied — the display limit is handled at query time.
 *
 * The optional `maxToProcess` parameter exists solely for unit tests so they
 * can keep test suites fast without fetching a full week of data.
 */
export async function syncArticles(maxToProcess?: number): Promise<SyncResult> {
  const errors: string[] = [];
  const userCache = new Map<string, ForemUser | null>();
  const upsertedAuthors = new Set<string>();

  try {
    const { allArticles, validArticles } = await fetchAndFilterArticles();
    const postsByAuthor24h = buildAuthorFrequencies(allArticles);
    const shortlist = lightScoreAndRank(validArticles, postsByAuthor24h);

    // In production maxToProcess is undefined → process all valid articles.
    // In tests it is set to a small number to keep suites fast.
    const toProcess =
      maxToProcess === undefined ? shortlist : shortlist.slice(0, maxToProcess);

    let synced = 0;
    let failed = 0;

    for (const candidate of toProcess) {
      try {
        const {
          article,
          preliminary_score,
          word_count,
          age_hours,
          author_post_frequency,
        } = candidate;
        const username = article.user.username;

        const detailedUser = await resolveUser(username, userCache);
        if (detailedUser) {
          await ensureAuthorUpserted(username, detailedUser, upsertedAuthors);
        }

        await deepScoreAndPersist({
          article,
          username,
          word_count,
          age_hours,
          author_post_frequency,
          preliminary_score,
          detailedUser,
          postsByAuthor24h,
        });

        synced++;
      } catch (err: unknown) {
        failed++;
        console.log("SYNC ERROR DETECTED:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Article ${candidate.article.id}: ${message}`);
      }
    }

    // Backfill: re-process articles that have empty metrics (PostgREST schema
    // cache miss during initial sync, or articles the paginated API didn't
    // return). Fetch each individually by ID and deep-score them.
    if (maxToProcess === undefined) {
      const backfillResult = await backfillEmptyMetrics(
        allArticles,
        userCache,
        upsertedAuthors,
      );
      synced += backfillResult.synced;
      failed += backfillResult.failed;
      errors.push(...backfillResult.errors);
    }

    // Purge: remove articles older than PURGE_AGE_HOURS. The commenters
    // table cascades on article delete, so no separate cleanup is needed.
    if (maxToProcess === undefined) {
      const purged = await purgeStaleArticles();
      if (purged > 0) {
        errors.push(
          `Purged ${purged} stale articles (> ${PURGE_AGE_HOURS}h old)`,
        );
      }
    }

    return { synced, failed, errors };
  } catch (err: unknown) {
    throw err instanceof Error ? err : new Error("Fatal Sync Pipeline Error");
  }
}
