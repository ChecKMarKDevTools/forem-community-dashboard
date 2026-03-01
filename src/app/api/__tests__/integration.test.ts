/**
 * Integration tests for the API layer.
 *
 * These tests exercise full request→response flows across all three routes,
 * verifying correct data shapes, HTTP semantics, and cross-route data
 * consistency. Supabase and sync are mocked at module boundaries; routing
 * and serialization logic run for real.
 *
 * The sync pipeline itself (article processing, scoring, Supabase upserts) is
 * fully tested in src/lib/sync.test.ts. These integration tests focus on
 * HTTP routing, auth enforcement, and response serialization.
 */

import { NextRequest } from "next/server";
import { GET as getPosts } from "../posts/route";
// Note: getPosts() accepts no Request parameter — see posts/route.ts signature
import { GET as getPostById } from "../posts/[id]/route";
import { POST as postCron } from "../cron/route";
import { syncArticles } from "@/lib/sync";
import { supabase, isConfigured } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

// Mock the heavy sync module at the boundary — the real pipeline is covered
// by src/lib/sync.test.ts. Loading sync.ts in a fork child exceeds the
// available V8 heap on macOS CI (it transitively loads all scoring logic).
vi.mock("@/lib/sync", () => ({
  syncArticles: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
  // Default: credentials are present so the normal code paths run.
  // Individual tests override this to verify unconfigured behaviour.
  isConfigured: vi.fn(() => true),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CRON_SECRET = "integration-secret";

const DB_ARTICLES = [
  {
    id: 1,
    title: "Spam Post",
    author: "spammer",
    score: 90,
    attention_level: "SIGNAL_AT_RISK",
  },
  {
    id: 2,
    title: "Normal Post",
    author: "regular",
    score: 20,
    attention_level: "NORMAL",
  },
  {
    id: 3,
    title: "Review Post",
    author: "mid",
    score: 50,
    attention_level: "NEEDS_REVIEW",
  },
];

const DB_ARTICLE_DETAIL = {
  id: 1,
  title: "Spam Post",
  author: "spammer",
  score: 90,
  attention_level: "SIGNAL_AT_RISK",
  reactions: 100,
  comments: 5,
  tags: ["javascript"],
  explanations: ["Risk Score: 8"],
  published_at: "2024-01-15T10:00:00Z",
  canonical_url: "https://external.example.com/post",
  metrics: {
    velocity_buckets: [{ hour: 0, count: 3 }],
    comments_per_hour: 1.5,
    commenter_shares: [{ username: "user1", share: 0.6 }],
    constructiveness_buckets: [{ hour: 0, depth_index: 1.0 }],
    avg_comment_length: 25,
    reply_ratio: 0.4,
    alternating_pairs: 0,
    risk_components: {
      frequency_penalty: 0,
      short_content: true,
      no_engagement: false,
      promo_keywords: 2,
      repeated_links: 0,
      engagement_credit: 0,
    },
    risk_score: 8,
    is_first_post: false,
    help_keywords: 0,
    interaction_signal: 0.35,
    interaction_method: "heuristic" as const,
    signal_strong_pct: 20,
    signal_moderate_pct: 60,
    signal_faint_pct: 20,
  },
};

const DB_RECENT_POSTS = [
  {
    id: 4,
    title: "Earlier Spam",
    published_at: "2024-01-14T10:00:00Z",
    score: 80,
    attention_level: "SIGNAL_AT_RISK",
  },
];

function buildSupabaseListChain(data: unknown, error: unknown = null) {
  const select = vi.fn().mockReturnThis();
  const gte = vi.fn().mockReturnThis();
  const order = vi.fn().mockReturnThis();
  const limit = vi.fn().mockResolvedValue({ data, error });
  (supabase.from as Mock).mockReturnValue({ select, gte, order, limit });
  return { select, gte, order, limit };
}

function buildSupabaseDetailChains(
  articleData: unknown,
  recentData: unknown,
  articleError: unknown = null,
  recentError: unknown = null,
) {
  let callCount = 0;
  (supabase.from as Mock).mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      const chain: Record<string, Mock> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi
          .fn()
          .mockResolvedValue({ data: articleData, error: articleError }),
      };
      return chain;
    }
    const chain: Record<string, Mock> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi
        .fn()
        .mockResolvedValue({ data: recentData, error: recentError }),
    };
    return chain;
  });
}

// ---------------------------------------------------------------------------
// GET /api/posts integration
// ---------------------------------------------------------------------------

describe("Integration: GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns non-NORMAL articles first, then NORMAL, each group sorted by score desc", async () => {
    // DB_ARTICLES: SIGNAL_AT_RISK (90), NORMAL (20), NEEDS_REVIEW (50)
    buildSupabaseListChain(DB_ARTICLES);

    const res = await getPosts();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(3);
    // Non-NORMAL first: SIGNAL_AT_RISK (90) then NEEDS_REVIEW (50)
    expect(json[0].attention_level).not.toBe("NORMAL");
    expect(json[1].attention_level).not.toBe("NORMAL");
    // NORMAL last
    expect(json[2].attention_level).toBe("NORMAL");
    // Within non-NORMAL group: highest score first
    expect(json[0].score).toBeGreaterThanOrEqual(json[1].score);
  });

  it("response body is a JSON array of post summaries with required fields", async () => {
    buildSupabaseListChain(DB_ARTICLES);

    const res = await getPosts();
    const json = await res.json();

    for (const post of json) {
      expect(post).toHaveProperty("id");
      expect(post).toHaveProperty("title");
      expect(post).toHaveProperty("author");
      expect(post).toHaveProperty("score");
      expect(post).toHaveProperty("attention_level");
    }
  });

  it("propagates Supabase errors as a structured 500 response", async () => {
    buildSupabaseListChain(null, new Error("Postgres unavailable"));

    const res = await getPosts();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toHaveProperty("error");
    expect(typeof json.error).toBe("string");
  });

  it("returns 200 + [] when Supabase credentials are not configured", async () => {
    // Simulates Lighthouse CI / local dev without .env.local — the API must
    // return a graceful empty list so no HTTP 500 is issued and the browser
    // never logs a network console error (which would fail the Lighthouse
    // errors-in-console audit).
    (isConfigured as Mock).mockReturnValueOnce(false);

    const res = await getPosts();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
    // Supabase must NOT be called when credentials are absent
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/posts/[id] integration
// ---------------------------------------------------------------------------

describe("Integration: GET /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full article detail with recent_posts array", async () => {
    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, DB_RECENT_POSTS);

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    // Article fields at top level
    expect(json.id).toBe(1);
    expect(json.title).toBe("Spam Post");
    expect(json.author).toBe("spammer");
    expect(json.score).toBe(90);
    expect(json.attention_level).toBe("SIGNAL_AT_RISK");
    // recent_posts
    expect(Array.isArray(json.recent_posts)).toBe(true);
    expect(json.recent_posts[0].id).toBe(4);
  });

  it("response shape is compatible with Dashboard PostDetails type", async () => {
    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, []);

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });
    const json = await res.json();

    // Verify all fields the Dashboard reads from PostDetails
    const requiredFields = [
      "id",
      "title",
      "author",
      "score",
      "attention_level",
      "reactions",
      "comments",
      "tags",
      "explanations",
      "published_at",
      "canonical_url",
      "recent_posts",
    ];
    for (const field of requiredFields) {
      expect(json).toHaveProperty(field);
    }
  });

  it("returns metrics JSONB field in detail response", async () => {
    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, []);

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.metrics).toBeDefined();
    expect(json.metrics.velocity_buckets).toHaveLength(1);
    expect(json.metrics.risk_score).toBe(8);
    expect(json.metrics.commenter_shares[0].username).toBe("user1");
    expect(json.metrics.risk_components.short_content).toBe(true);
    expect(json.metrics.risk_components.promo_keywords).toBe(2);
  });

  it("recent_posts defaults to [] when Supabase returns null", async () => {
    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, null);

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.recent_posts).toEqual([]);
  });

  it("returns 400 for non-numeric ID — no Supabase calls made", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/bad-id");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "bad-id" }),
    });

    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns 404 when article does not exist in DB", async () => {
    buildSupabaseDetailChains(null, null);

    const req = new NextRequest("http://localhost:3000/api/posts/9999");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "9999" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 500 on recent posts DB failure", async () => {
    buildSupabaseDetailChains(
      DB_ARTICLE_DETAIL,
      null,
      null,
      new Error("Recent query failed"),
    );

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(500);
  });

  it("returns 404 when Supabase credentials are not configured", async () => {
    // When not configured, any specific post ID is treated as not found.
    // No Supabase call is made, and the response is a clean 404 (not a 500),
    // so no browser network console error is logged during Lighthouse CI.
    (isConfigured as Mock).mockReturnValueOnce(false);

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await getPostById(req, {
      params: Promise.resolve({ id: "1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toHaveProperty("error");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/cron integration
// ---------------------------------------------------------------------------

function makeCronRequest(token?: string) {
  return new Request("http://localhost:3000/api/cron", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("Integration: POST /api/cron", () => {
  let savedCronSecret: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = savedCronSecret;
    }
  });

  it("returns success with synced count from syncArticles result", async () => {
    (syncArticles as Mock).mockResolvedValue({
      synced: 2,
      failed: 0,
      errors: [],
    });

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.synced).toBe(2);
    expect(syncArticles).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized requests without calling syncArticles", async () => {
    const res = await postCron(makeCronRequest("bad-token"));

    expect(res.status).toBe(401);
    expect(syncArticles).not.toHaveBeenCalled();
  });

  it("returns 401 when no token provided", async () => {
    const res = await postCron(makeCronRequest());

    expect(res.status).toBe(401);
    expect(syncArticles).not.toHaveBeenCalled();
  });

  it("propagates syncArticles errors as 500 with error message", async () => {
    (syncArticles as Mock).mockRejectedValue(new Error("Forem rate limited"));

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Forem rate limited");
  });

  it("returns synced: 0 when syncArticles reports no articles processed", async () => {
    (syncArticles as Mock).mockResolvedValue({
      synced: 0,
      failed: 0,
      errors: [],
    });

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.synced).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-route data consistency
// ---------------------------------------------------------------------------

describe("Integration: cross-route data consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("article IDs returned by GET /api/posts are valid inputs for GET /api/posts/[id]", async () => {
    // Step 1: list endpoint returns posts
    buildSupabaseListChain(DB_ARTICLES);
    const listRes = await getPosts();
    const listJson = await listRes.json();

    expect(listRes.status).toBe(200);
    const firstId = listJson[0].id as number;

    // Step 2: use the returned ID to fetch detail
    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, DB_RECENT_POSTS);
    const detailReq = new NextRequest(
      `http://localhost:3000/api/posts/${firstId}`,
    );
    const detailRes = await getPostById(detailReq, {
      params: Promise.resolve({ id: String(firstId) }),
    });
    const detailJson = await detailRes.json();

    expect(detailRes.status).toBe(200);
    expect(detailJson.id).toBe(DB_ARTICLE_DETAIL.id);
  });

  it("attention_level in list response matches detail response for the same article", async () => {
    buildSupabaseListChain(DB_ARTICLES);
    const listRes = await getPosts();
    const listJson = await listRes.json();

    const listArticle = listJson.find((a: { id: number }) => a.id === 1);

    buildSupabaseDetailChains(DB_ARTICLE_DETAIL, []);
    const detailReq = new NextRequest("http://localhost:3000/api/posts/1");
    const detailRes = await getPostById(detailReq, {
      params: Promise.resolve({ id: "1" }),
    });
    const detailJson = await detailRes.json();

    expect(listArticle.attention_level).toBe(detailJson.attention_level);
    expect(listArticle.score).toBe(detailJson.score);
  });
});
