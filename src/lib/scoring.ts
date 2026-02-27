import { ForemArticle, ForemUser, ForemComment } from "./forem";

export interface ScoreBreakdown {
  total: number;
  behavior: number;
  audience: number;
  pattern: number;
  explanations: string[];
  attention_level: "low" | "medium" | "high";
}

function calculateBehaviorScore(
  article: ForemArticle,
  user: ForemUser | null,
  recentPostsByAuthor: ForemArticle[],
  explanations: string[],
): number {
  let behavior = 0;

  if (user) {
    const ageDays =
      (Date.now() - new Date(user.joined_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 7) {
      behavior += 15;
      explanations.push("Account age is less than 7 days");
    }
  }

  if (article.canonical_url && !article.canonical_url.includes("dev.to")) {
    behavior += 10;
    explanations.push("Uses off-site canonical URL");
  }

  const publishedAt = new Date(article.published_at);
  const recentPosts = recentPostsByAuthor.filter((p) => {
    const hoursDiff =
      Math.abs(publishedAt.getTime() - new Date(p.published_at).getTime()) /
      (1000 * 60 * 60);
    return hoursDiff <= 24;
  });

  if (recentPosts.length > 2) {
    behavior += 9;
    explanations.push("High post frequency (more than 2 posts in 24 hours)");
  }

  return behavior;
}

function calculateAudienceScore(
  article: ForemArticle,
  comments: ForemComment[],
  explanations: string[],
): number {
  let audience = 0;
  const uniqueCommenters = new Set(comments.map((c) => c.user.username));

  if (comments.length > 0) {
    if (uniqueCommenters.size <= 2 && comments.length > 3) {
      audience += 15;
      explanations.push("Low unique participants vs comment count");
    }
    // Baseline for engaging; repeated-commenter cross-post analysis omitted
    // to avoid per-render Forem API calls for every author post
    audience += 5;
  } else if (article.public_reactions_count > 20) {
    audience += 15;
    explanations.push("High reactions with zero comments");
  }

  return audience;
}

function sortedTagKey(tagList: string[]): string {
  return tagList.toSorted((a, b) => a.localeCompare(b)).join(",");
}

function calculatePatternScore(
  article: ForemArticle,
  recentPostsByAuthor: ForemArticle[],
  explanations: string[],
): number {
  let pattern = 0;

  const currentTags = sortedTagKey(article.tag_list);
  const repeatedTags = recentPostsByAuthor.filter(
    (p) => p.id !== article.id && sortedTagKey(p.tag_list) === currentTags,
  );

  if (repeatedTags.length > 0) {
    pattern += 15;
    explanations.push("Repeated tag combinations used recently");
  }

  if (recentPostsByAuthor.length > 1) {
    const gaps: number[] = [];
    for (let i = 0; i < recentPostsByAuthor.length - 1; i++) {
      const date1 = new Date(recentPostsByAuthor[i].published_at).getTime();
      const date2 = new Date(recentPostsByAuthor[i + 1].published_at).getTime();
      gaps.push(Math.abs(date1 - date2));
    }
    const uniformGaps = gaps.every(
      (g) => Math.abs(g - gaps[0]) < 1000 * 60 * 5,
    );
    if (gaps.length > 0 && uniformGaps) {
      pattern += 18;
      explanations.push("Regular/automated publish timing");
    }
  }

  return pattern;
}

export function evaluatePriority(
  article: ForemArticle,
  user: ForemUser | null,
  comments: ForemComment[],
  recentPostsByAuthor: ForemArticle[],
): ScoreBreakdown {
  const explanations: string[] = [];

  const behavior = calculateBehaviorScore(
    article,
    user,
    recentPostsByAuthor,
    explanations,
  );
  const audience = calculateAudienceScore(article, comments, explanations);
  const pattern = calculatePatternScore(
    article,
    recentPostsByAuthor,
    explanations,
  );

  const total = Math.min(100, behavior + audience + pattern);

  let attention_level: "low" | "medium" | "high" = "low";
  if (total >= 70) attention_level = "high";
  else if (total >= 40) attention_level = "medium";

  return {
    total,
    behavior,
    audience,
    pattern,
    explanations,
    attention_level,
  };
}
