import { ForemArticle, ForemUser, ForemClient } from "@/lib/forem";
import { evaluatePriority } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Resolves a user from the cache on a hit, or fetches from the Forem API and
 * populates the cache on a miss. Storing null for "user not found" prevents
 * redundant API calls for the same unknown username within a sync run.
 */
async function resolveUser(
  username: string,
  userCache: Map<string, ForemUser | null>,
): Promise<ForemUser | null> {
  if (userCache.has(username)) {
    // Map.has() guarantees the key exists; cast is safe.
    return userCache.get(username) as ForemUser | null;
  }
  const user = await ForemClient.getUserByUsername(username);
  userCache.set(username, user);
  return user;
}

/**
 * Upserts one article's full sync payload: author user record (once per
 * author per run), scored article row, and each commenter row.
 * Throws on any Supabase write error so the caller can catch and record it.
 */
async function syncOneArticle(
  article: ForemArticle,
  articlesByAuthor: Map<string, ForemArticle[]>,
  userCache: Map<string, ForemUser | null>,
  upsertedAuthors: Set<string>,
): Promise<void> {
  const username = article.user.username;
  const detailedUser = await resolveUser(username, userCache);

  if (detailedUser && !upsertedAuthors.has(username)) {
    const { error: userError } = await supabase.from("users").upsert({
      username: detailedUser.username,
      joined_at: detailedUser.joined_at,
      updated_at: new Date().toISOString(),
    });
    if (userError) throw new Error(userError.message);
    upsertedAuthors.add(username);
  }

  const recentPosts = articlesByAuthor.get(username) ?? [];
  const comments = await ForemClient.getComments(article.id);
  const score = evaluatePriority(article, detailedUser, comments, recentPosts);

  const { error: articleError } = await supabase.from("articles").upsert({
    id: article.id,
    author: username,
    published_at: article.published_at,
    reactions: article.public_reactions_count,
    comments: article.comments_count,
    tags: article.tag_list,
    canonical_url: article.canonical_url,
    score: score.total,
    attention_level: score.attention_level,
    explanations: score.explanations,
    title: article.title,
    updated_at: new Date().toISOString(),
  });
  if (articleError) throw new Error(articleError.message);

  for (const comment of comments) {
    const { error: commenterError } = await supabase
      .from("commenters")
      .upsert(
        { article_id: article.id, username: comment.user.username },
        { onConflict: "article_id,username" },
      );
    if (commenterError) throw new Error(commenterError.message);
  }
}

/**
 * Upserts a batch of Forem articles (plus their authors and commenters) into
 * Supabase. The full batch is passed so that per-author recent-post context is
 * available when computing priority scores.
 *
 * Articles are pre-grouped by author in O(N) before the main loop, avoiding
 * the O(N²) per-article filter that would arise from scanning the whole batch
 * for each article. User API lookups are cached so each unique author is
 * fetched at most once per sync run, reducing Forem API load and guarding
 * against rate-limit exhaustion.
 *
 * Per-article errors are non-fatal: failures are logged, counted, and included
 * in the returned SyncResult so the caller can surface them without aborting
 * the remaining articles.
 */
export async function syncArticles(
  articles: ForemArticle[],
): Promise<SyncResult> {
  const errors: string[] = [];

  // Pre-group by author — O(N) total, eliminates the O(N²) per-article filter.
  const articlesByAuthor = new Map<string, ForemArticle[]>();
  for (const article of articles) {
    const username = article.user.username;
    const group = articlesByAuthor.get(username);
    if (group) {
      group.push(article);
    } else {
      articlesByAuthor.set(username, [article]);
    }
  }

  // Cache successful user lookups so each unique author is fetched once.
  const userCache = new Map<string, ForemUser | null>();
  // Track which authors have already been upserted to avoid redundant writes.
  const upsertedAuthors = new Set<string>();

  for (const article of articles) {
    try {
      await syncOneArticle(
        article,
        articlesByAuthor,
        userCache,
        upsertedAuthors,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Unknown error on article ${article.id}`;
      console.error(`syncArticles: skipping article ${article.id}: ${message}`);
      errors.push(`article ${article.id}: ${message}`);
    }
  }

  return {
    synced: articles.length - errors.length,
    failed: errors.length,
    errors,
  };
}
