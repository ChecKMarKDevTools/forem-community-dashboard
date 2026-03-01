// Category strings stored in DB `articles.attention_level` by the classification pipeline.
export type AttentionCategory =
  | "NEEDS_RESPONSE"
  | "SIGNAL_AT_RISK"
  | "NEEDS_REVIEW"
  | "BOOST_VISIBILITY"
  | "NORMAL";

import type { ArticleMetrics } from "@/types/metrics";

// Matches the DB `articles` table schema returned by /api/posts and /api/posts/[id].
export type Post = {
  id: number;
  title: string;
  canonical_url: string;
  score: number;
  attention_level: AttentionCategory;
  explanations: string[];
  published_at: string;
  author: string;
  reactions: number;
  comments: number;
  metrics?: ArticleMetrics | null;
};

// Subset returned for recent posts by /api/posts/[id] (includes canonical_url for linking).
export type RecentPost = {
  id: number;
  title: string;
  canonical_url: string;
  dev_url?: string | null;
  published_at: string;
  score: number;
  attention_level: AttentionCategory;
};

export type PostDetails = Post & {
  dev_url?: string | null;
  recent_posts?: RecentPost[];
};
