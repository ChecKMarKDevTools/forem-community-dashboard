import { ForemArticle, ForemClient } from "@/lib/forem";
import { evaluatePriority } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Upserts a batch of Forem articles (plus their authors and commenters) into
 * Supabase. The full batch is passed so that per-author recent-post context is
 * available when computing priority scores.
 *
 * Per-article errors are non-fatal: failures are logged, counted, and included
 * in the returned SyncResult so the caller can surface them without aborting
 * the remaining articles.
 */
export async function syncArticles(
  articles: ForemArticle[],
): Promise<SyncResult> {
  const errors: string[] = [];

  for (const article of articles) {
    try {
      const author = article.user;

      const detailedUser = await ForemClient.getUserByUsername(author.username);
      if (detailedUser) {
        await supabase.from("users").upsert({
          username: detailedUser.username,
          joined_at: detailedUser.joined_at,
          updated_at: new Date().toISOString(),
        });
      }

      const recentPosts = articles.filter(
        (a) => a.user.username === author.username,
      );
      const comments = await ForemClient.getComments(article.id);
      const score = evaluatePriority(
        article,
        detailedUser,
        comments,
        recentPosts,
      );

      await supabase.from("articles").upsert({
        id: article.id,
        author: author.username,
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

      for (const comment of comments) {
        await supabase
          .from("commenters")
          .upsert(
            { article_id: article.id, username: comment.user.username },
            { onConflict: "article_id,username" },
          );
      }
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
