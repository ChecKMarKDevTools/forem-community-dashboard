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
  published_at: string;
  last_comment_at: string;
  reading_time_minutes: number;
  tag_list: string[];
  tags: string;
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
    name: string;
    username: string;
    twitter_username: string | null;
    github_username: string | null;
    website_url: string | null;
    profile_image: string;
    profile_image_90: string;
  };
  children: ForemComment[];
}

/** Returns headers that include the API key when FOREM_API_KEY is configured. */
function buildHeaders(): Record<string, string> {
  const apiKey = process.env.FOREM_API_KEY;
  return apiKey ? { "api-key": apiKey } : {};
}

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
}

export class ForemClient {
  static async getLatestArticles(
    page: number = 1,
    perPage: number = 100,
  ): Promise<ForemArticle[]> {
    const res = await fetchWithRetry(
      `${BASE_URL}/articles?per_page=${perPage}&page=${page}`,
      // next.revalidate is a Next.js fetch extension for CDN cache control
      { next: { revalidate: 300 } } as RequestInit,
    );
    if (!res.ok) throw new Error("Failed to fetch articles");
    return res.json();
  }

  static async getArticle(id: number): Promise<ForemArticle> {
    const res = await fetchWithRetry(`${BASE_URL}/articles/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch article ${id}`);
    return res.json();
  }

  static async getUserByUsername(username: string): Promise<ForemUser | null> {
    const res = await fetchWithRetry(
      `${BASE_URL}/users/by_username?url=${username}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch user ${username}`);
    return res.json();
  }

  static async getComments(articleId: number): Promise<ForemComment[]> {
    const res = await fetchWithRetry(`${BASE_URL}/comments?a_id=${articleId}`);
    if (!res.ok)
      throw new Error(`Failed to fetch comments for article ${articleId}`);
    return res.json();
  }
}
