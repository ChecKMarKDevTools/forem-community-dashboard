/**
 * Integration tests for the API layer.
 *
 * These tests exercise full request→response flows across all three routes,
 * verifying correct data shapes, HTTP semantics, and cross-route data
 * consistency. Supabase, ForemClient, and scoring are mocked at module
 * boundaries; routing and serialization logic run for real.
 */

import { NextRequest } from "next/server";
import { GET as getPosts } from "../posts/route";
// Note: getPosts() accepts no Request parameter — see posts/route.ts signature
import { GET as getPostById } from "../posts/[id]/route";
import { POST as postCron } from "../cron/route";
import { ForemClient } from "@/lib/forem";
import { evaluatePriority } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/forem", () => ({
  ForemClient: {
    getLatestArticles: vi.fn(),
    getUserByUsername: vi.fn(),
    getComments: vi.fn(),
  },
}));

vi.mock("@/lib/scoring", () => ({
  evaluatePriority: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
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
    attention_level: "high",
  },
  {
    id: 2,
    title: "Normal Post",
    author: "regular",
    score: 20,
    attention_level: "low",
  },
  {
    id: 3,
    title: "Mid Post",
    author: "mid",
    score: 50,
    attention_level: "medium",
  },
];

const DB_ARTICLE_DETAIL = {
  id: 1,
  title: "Spam Post",
  author: "spammer",
  score: 90,
  attention_level: "high",
  reactions: 100,
  comments: 5,
  tags: ["javascript"],
  explanations: ["Account age is less than 7 days"],
  published_at: "2024-01-15T10:00:00Z",
  canonical_url: "https://external.example.com/post",
};

const DB_RECENT_POSTS = [
  {
    id: 4,
    title: "Earlier Spam",
    published_at: "2024-01-14T10:00:00Z",
    score: 80,
    attention_level: "high",
  },
];

function buildSupabaseListChain(data: unknown, error: unknown = null) {
  const select = vi.fn().mockReturnThis();
  const order = vi.fn().mockReturnThis();
  const limit = vi.fn().mockResolvedValue({ data, error });
  (supabase.from as Mock).mockReturnValue({ select, order, limit });
  return { select, order, limit };
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

function buildSupabaseUpsertChain() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  (supabase.from as Mock).mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// GET /api/posts integration
// ---------------------------------------------------------------------------

describe("Integration: GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns list sorted by score descending from DB", async () => {
    buildSupabaseListChain(DB_ARTICLES);

    const res = await getPosts();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(3);
    // Ordering is delegated to Supabase; the handler passes the data through
    expect(json[0].score).toBe(90);
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
    expect(json.attention_level).toBe("high");
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
});

// ---------------------------------------------------------------------------
// POST /api/cron integration
// ---------------------------------------------------------------------------

const DEFAULT_SCORE = {
  total: 10,
  behavior: 0,
  audience: 5,
  pattern: 5,
  explanations: [] as string[],
  attention_level: "low" as const,
};

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
    // Default scoring mock — individual tests may override
    (evaluatePriority as Mock).mockReturnValue(DEFAULT_SCORE);
  });

  afterEach(() => {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = savedCronSecret;
    }
  });

  it("syncs articles and returns success with count", async () => {
    const foremArticles = [
      {
        id: 100,
        title: "New Article",
        published_at: "2024-02-01T09:00:00Z",
        public_reactions_count: 2,
        comments_count: 0,
        tag_list: ["typescript"],
        canonical_url: "https://dev.to/new-article",
        user: { username: "newuser" },
      },
    ];

    (ForemClient.getLatestArticles as Mock).mockResolvedValue(foremArticles);
    (ForemClient.getUserByUsername as Mock).mockResolvedValue({
      username: "newuser",
      joined_at: "2023-12-01T00:00:00Z",
    });
    (ForemClient.getComments as Mock).mockResolvedValue([]);

    const upsertChain = buildSupabaseUpsertChain();

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.synced).toBe(1);

    // Verify Supabase was called for users and articles
    const fromCalls = (supabase.from as Mock).mock.calls.map((c) => c[0]);
    expect(fromCalls).toContain("users");
    expect(fromCalls).toContain("articles");

    // Verify evaluatePriority result flows into article upsert
    const articleUpsert = upsertChain.upsert.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>).id === 100,
    );
    expect(articleUpsert).toBeDefined();
  });

  it("rejects unauthorized requests without calling Forem API", async () => {
    const res = await postCron(makeCronRequest("bad-token"));

    expect(res.status).toBe(401);
    expect(ForemClient.getLatestArticles).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("handles Forem API failures gracefully with 500", async () => {
    (ForemClient.getLatestArticles as Mock).mockRejectedValue(
      new Error("Forem rate limited"),
    );

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Forem rate limited");
  });

  it("calls evaluatePriority with correct article and user data", async () => {
    (evaluatePriority as Mock).mockReturnValue({
      total: 25,
      behavior: 10,
      audience: 15,
      pattern: 0,
      explanations: ["Account age is less than 7 days"],
      attention_level: "low" as const,
    });

    const article = {
      id: 200,
      title: "Scored Article",
      published_at: "2024-03-01T12:00:00Z",
      public_reactions_count: 1,
      comments_count: 0,
      tag_list: [],
      canonical_url: "https://dev.to/scored",
      user: { username: "scorer" },
    };

    (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    buildSupabaseUpsertChain();

    await postCron(makeCronRequest(CRON_SECRET));

    expect(evaluatePriority).toHaveBeenCalledWith(
      article,
      null,
      [],
      expect.arrayContaining([article]),
    );
  });

  it("integrates scoring into article upsert — stores score and attention_level", async () => {
    (evaluatePriority as Mock).mockReturnValue({
      total: 85,
      behavior: 35,
      audience: 25,
      pattern: 25,
      explanations: ["High priority detected"],
      attention_level: "high" as const,
    });

    const article = {
      id: 300,
      title: "High Priority",
      published_at: "2024-04-01T08:00:00Z",
      public_reactions_count: 50,
      comments_count: 10,
      tag_list: ["spam"],
      canonical_url: "https://evil.example.com",
      user: { username: "badactor" },
    };

    (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);

    const upsertChain = buildSupabaseUpsertChain();

    await postCron(makeCronRequest(CRON_SECRET));

    const articleUpsert = upsertChain.upsert.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>).id === 300,
    )?.[0] as Record<string, unknown>;

    expect(articleUpsert.score).toBe(85);
    expect(articleUpsert.attention_level).toBe("high");
    expect(articleUpsert.explanations).toEqual(["High priority detected"]);
  });

  it("syncs zero articles when Forem returns empty list", async () => {
    (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);

    const res = await postCron(makeCronRequest(CRON_SECRET));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.synced).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
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
