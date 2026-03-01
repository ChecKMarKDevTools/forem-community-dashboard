// Forem Community API Client

const BASE_URL = "https://dev.to/api";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export interface ForemArticle {
  id: number;
  title: string;
  description: string;
  readable_publish_date: string;
  slug: string;
  path: string;
  url: string;
  comments_count: number;
  public_reactions_count: number;
  collection_id: number | null;
  published_timestamp: string;
  positive_reactions_count: number;
  cover_image: string | null;
  social_image: string;
  canonical_url: string;
  created_at: string;
  edited_at: string | null;
  crossposted_at: string | null;
  /** Null for draft/unpublished articles; non-null for published ones.
   * GET /api/articles (public feed) does not include a `published` boolean —
   * that field only appears on GET /api/articles/me. published_at alone is
   * the reliable signal for whether an article is live. */
  published_at: string | null;
  last_comment_at: string;
  reading_time_minutes: number;
  tag_list: string[];
  tags: string;
  organization?: {
    name: string;
    username: string;
    slug: string;
    profile_image: string;
    profile_image_90: string;
  };
  user: {
    name: string;
    username: string;
    twitter_username: string | null;
    github_username: string | null;
    user_id: number;
    website_url: string | null;
    profile_image: string;
    profile_image_90: string;
  };
  body_html?: string;
  body_markdown?: string;
}

export interface ForemUser {
  type_of: string;
  id: number;
  username: string;
  name: string;
  summary: string;
  twitter_username: string | null;
  github_username: string | null;
  website_url: string | null;
  location: string | null;
  joined_at: string;
  profile_image: string;
}

export interface ForemComment {
  type_of: string;
  id_code: string;
  created_at: string;
  body_html: string;
  user: {
    name: string | null;
    /** Null when the Forem account has been deleted. */
    username: string | null;
    twitter_username: string | null;
    github_username: string | null;
    website_url: string | null;
    profile_image: string;
    profile_image_90: string;
  };
  children: ForemComment[];
}

let warnedMissingKey = false;

/** Returns headers that include the API key when DEV_API_KEY is configured. */
function buildHeaders(): Record<string, string> {
  const apiKey = process.env.DEV_API_KEY;
  if (!apiKey && !warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      "[forem] DEV_API_KEY is not set — requests are unauthenticated with lower rate limits.",
    );
  }
  return apiKey ? { "api-key": apiKey } : {};
}

/** Reset the one-time warning flag (test-only). */
export function resetMissingKeyWarning(): void {
  warnedMissingKey = false;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string): T | null {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return cached.data as T;
}

function setCached(key: string, data: unknown) {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

class RequestQueue {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  private readonly maxParallel = 5;
  private readonly delayBetweenBatchesMs = 1000; // 800-1200 avg
  private lastBatchTime = Date.now();

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxParallel) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    const now = Date.now();
    if (
      this.activeCount === 0 &&
      now - this.lastBatchTime < this.delayBetweenBatchesMs
    ) {
      await new Promise((r) =>
        setTimeout(r, this.delayBetweenBatchesMs - (now - this.lastBatchTime)),
      );
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      this.lastBatchTime = Date.now();
      this.queue.shift()?.();
    }
  }

  reset() {
    this.activeCount = 0;
    this.queue = [];
    this.lastBatchTime = 0;
  }
}

export const foremQueue = new RequestQueue();

/**
 * Wraps fetch with exponential-backoff retry on HTTP 429 (rate-limited).
 * Respects the Retry-After response header when present; otherwise uses
 * RETRY_BASE_DELAY_MS * 2^attempt. Gives up after MAX_RETRIES retries and
 * returns the final response so the caller can inspect the status.
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  attempt = 0,
): Promise<Response> {
  const mergedHeaders = {
    ...buildHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  };

  return foremQueue.enqueue(async () => {
    const res = await fetch(url, { ...init, headers: mergedHeaders });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : Number.NaN;

      const delayMs = Number.isNaN(retryAfterSec)
        ? RETRY_BASE_DELAY_MS * 2 ** attempt
        : retryAfterSec * 1000;

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return fetchWithRetry(url, init, attempt + 1);
    }

    return res;
  });
}

export class ForemClient {
  static async getLatestArticles(
    page: number = 1,
    perPage: number = 100,
  ): Promise<ForemArticle[]> {
    const url = `${BASE_URL}/articles?per_page=${perPage}&page=${page}`;
    // next.revalidate is a Next.js fetch extension for CDN cache control
    const res = await fetchWithRetry(url, {
      next: { revalidate: 300 },
    } as RequestInit);
    if (!res.ok) throw new Error("Failed to fetch articles");
    return res.json();
  }

  static async getArticle(
    id: number,
    skip_refetch_if_cached = true,
  ): Promise<ForemArticle> {
    const cacheKey = `article_${id}`;
    if (skip_refetch_if_cached) {
      const cached = getCached<ForemArticle>(cacheKey);
      if (cached) return cached;
    }

    const res = await fetchWithRetry(`${BASE_URL}/articles/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch article ${id}`);
    const data = await res.json();
    setCached(cacheKey, data);
    return data;
  }

  static async getUserByUsername(username: string): Promise<ForemUser | null> {
    const cacheKey = `user_${username}`;
    const cached = getCached<ForemUser>(cacheKey);
    if (cached) return cached;

    const res = await fetchWithRetry(
      `${BASE_URL}/users/by_username?url=${username}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch user ${username}`);
    const data = await res.json();
    setCached(cacheKey, data);
    return data;
  }

  static async getComments(
    articleId: number,
    skip_refetch_if_cached = true,
  ): Promise<ForemComment[]> {
    const cacheKey = `comments_${articleId}`;
    if (skip_refetch_if_cached) {
      const cached = getCached<ForemComment[]>(cacheKey);
      if (cached) return cached;
    }

    const res = await fetchWithRetry(`${BASE_URL}/comments?a_id=${articleId}`);
    if (!res.ok)
      throw new Error(`Failed to fetch comments for article ${articleId}`);
    const data = await res.json();
    setCached(cacheKey, data);
    return data;
  }
}
