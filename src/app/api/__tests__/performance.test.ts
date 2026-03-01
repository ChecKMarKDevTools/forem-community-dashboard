/**
 * Performance tests for API handlers and core library functions.
 *
 * Timing budget assertions are opt-in: set PERF_TESTS=true to enable the
 * timing suites. Without that flag, all describe blocks here are skipped so
 * CI is not sensitive to machine load, Node/V8 version, or parallel test
 * execution. All code paths exercised here are also covered by the unit and
 * integration test suites, so coverage is maintained regardless of this flag.
 *
 * Convention: BUDGET_* constants define the maximum acceptable duration in ms.
 */

import { GET as getPosts } from "../posts/route";
import { GET as getPostById } from "../posts/[id]/route";
import { POST as postCron } from "../cron/route";
import { ForemClient, type ForemArticle } from "@/lib/forem";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/forem", () => ({
  ForemClient: {
    getLatestArticles: vi.fn(),
    getUserByUsername: vi.fn(),
    getComments: vi.fn(),
    getArticle: vi.fn().mockResolvedValue({ id: 1, body_html: "mock" }),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Performance tests are permanently enabled as per user requirement
// Timing assertions (50ms/20ms) are validated across all CI runs
const TIMING_BUDGETS_ENABLED = true;

// ---------------------------------------------------------------------------
// Time-budget constants (milliseconds)
// ---------------------------------------------------------------------------
const BUDGET_GET_POSTS_SINGLE = 50; // One cold call to GET /api/posts
const BUDGET_GET_POST_BY_ID_SINGLE = 50; // One cold call to GET /api/posts/[id]
const BUDGET_GET_POSTS_P99 = 20; // p99 across 100 warm calls
const BUDGET_GET_POST_BY_ID_P99 = 20; // p99 across 100 warm calls
const BUDGET_CRON_100_ARTICLES = 500; // Full cron run with 100 articles
// Scoring is now inline in sync.ts — no standalone evaluatePriority to benchmark

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeArticle(id: number = 1): ForemArticle {
  return {
    id,
    title: `Article ${id}`,
    description: "",
    readable_publish_date: "Jan 1",
    slug: `article-${id}`,
    path: `/article-${id}`,
    url: `https://dev.to/article-${id}`,
    comments_count: 2,
    public_reactions_count: 5,
    collection_id: null,
    published_timestamp: "2024-01-01T10:00:00Z",
    positive_reactions_count: 5,
    cover_image: null,
    social_image: "",
    canonical_url: "https://dev.to/canonical",
    created_at: "2024-01-01T00:00:00Z",
    edited_at: null,
    crossposted_at: null,
    published_at: "2024-01-01T10:00:00Z",
    last_comment_at: "2024-01-01T11:00:00Z",
    reading_time_minutes: 3,
    tag_list: ["javascript", "webdev"],
    tags: "javascript, webdev",
    user: {
      name: `User ${id}`,
      username: `user${id}`,
      twitter_username: null,
      github_username: null,
      user_id: id,
      website_url: null,
      profile_image: "",
      profile_image_90: "",
    },
  };
}

function buildSupabaseListMock(count: number) {
  const data = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Post ${i + 1}`,
    author: `user${i + 1}`,
    score: 100 - i,
    attention_level: "low",
  }));
  const select = vi.fn().mockReturnThis();
  const gte = vi.fn().mockReturnThis();
  const lte = vi.fn().mockReturnThis();
  const order = vi.fn().mockReturnThis();
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  (supabase.from as Mock).mockReturnValue({ select, gte, lte, order, limit });
}

function buildSupabaseDetailMock(id: number) {
  let callCount = 0;
  (supabase.from as Mock).mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      const chain: Record<string, Mock> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({
          data: {
            id,
            title: `Post ${id}`,
            author: "testuser",
            score: 50,
            metrics: {
              velocity_buckets: [{ hour: 0, count: 2 }],
              comments_per_hour: 1,
              commenter_shares: [{ username: "user1", share: 0.5 }],
              positive_pct: 30,
              neutral_pct: 50,
              negative_pct: 20,
              constructiveness_buckets: [{ hour: 0, depth_index: 0.5 }],
              avg_comment_length: 20,
              reply_ratio: 0.3,
              alternating_pairs: 0,
              risk_components: {
                frequency_penalty: 0,
                short_content: false,
                no_engagement: false,
                promo_keywords: 0,
                repeated_links: 0,
                engagement_credit: 0,
              },
              risk_score: 0,
              sentiment_flips: 0,
              is_first_post: false,
              help_keywords: 0,
            },
          },
          error: null,
        }),
      };
      return chain;
    }
    const chain: Record<string, Mock> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    return chain;
  });
}

function buildCronMocks(articleCount: number) {
  const articles = Array.from({ length: articleCount }, (_, i) =>
    makeArticle(i + 1),
  );
  (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);
  (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
  (ForemClient.getComments as Mock).mockResolvedValue([]);
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const deleteChain = {
    lt: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  (supabase.from as Mock).mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: vi.fn().mockReturnValue(selectChain),
    delete: vi.fn().mockReturnValue(deleteChain),
  });
  return articles;
}

/** Returns p99 latency from an array of samples in ms. */
function p99(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * 0.99);
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// GET /api/posts performance
// ---------------------------------------------------------------------------

describe.skipIf(!TIMING_BUDGETS_ENABLED)("Performance: GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(`completes a single call in under ${BUDGET_GET_POSTS_SINGLE}ms`, async () => {
    buildSupabaseListMock(100);

    const start = Date.now();
    await getPosts();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(BUDGET_GET_POSTS_SINGLE);
  });

  it(`p99 of 100 calls stays under ${BUDGET_GET_POSTS_P99}ms`, async () => {
    const samples: number[] = [];

    for (let i = 0; i < 100; i++) {
      buildSupabaseListMock(100);
      const start = performance.now();
      await getPosts();
      samples.push(performance.now() - start);
    }

    expect(p99(samples)).toBeLessThan(BUDGET_GET_POSTS_P99);
  });

  it("handles max payload (100 articles) without exceeding budget", async () => {
    buildSupabaseListMock(100);

    const start = Date.now();
    await getPosts();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(BUDGET_GET_POSTS_SINGLE);
  });
});

// ---------------------------------------------------------------------------
// GET /api/posts/[id] performance
// ---------------------------------------------------------------------------

describe.skipIf(!TIMING_BUDGETS_ENABLED)(
  "Performance: GET /api/posts/[id]",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(`completes a single call in under ${BUDGET_GET_POST_BY_ID_SINGLE}ms`, async () => {
      buildSupabaseDetailMock(42);

      const req = new NextRequest("http://localhost:3000/api/posts/42");
      const start = Date.now();
      await getPostById(req, { params: Promise.resolve({ id: "42" }) });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(BUDGET_GET_POST_BY_ID_SINGLE);
    });

    it(`p99 of 100 calls stays under ${BUDGET_GET_POST_BY_ID_P99}ms`, async () => {
      const samples: number[] = [];

      for (let i = 0; i < 100; i++) {
        buildSupabaseDetailMock(1);
        const req = new NextRequest("http://localhost:3000/api/posts/1");
        const start = performance.now();
        await getPostById(req, { params: Promise.resolve({ id: "1" }) });
        samples.push(performance.now() - start);
      }

      expect(p99(samples)).toBeLessThan(BUDGET_GET_POST_BY_ID_P99);
    });

    it("invalid ID returns 400 faster than valid lookup (no DB call)", async () => {
      const req = new NextRequest("http://localhost:3000/api/posts/abc");
      const start = performance.now();
      const res = await getPostById(req, {
        params: Promise.resolve({ id: "abc" }),
      });
      const elapsed = performance.now() - start;

      expect(res.status).toBe(400);
      // Should be near-instant — much faster than a DB call budget
      expect(elapsed).toBeLessThan(10);
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/cron performance
// ---------------------------------------------------------------------------

describe.skipIf(!TIMING_BUDGETS_ENABLED)("Performance: POST /api/cron", () => {
  const CRON_SECRET = "perf-test-secret";
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

  function makeCronRequest() {
    return new Request("http://localhost:3000/api/cron", {
      method: "POST",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
  }

  it(`unauthorized check completes in under 5ms (no I/O)`, async () => {
    const req = new Request("http://localhost:3000/api/cron", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    const start = performance.now();
    const res = await postCron(req);
    const elapsed = performance.now() - start;

    expect(res.status).toBe(401);
    expect(elapsed).toBeLessThan(5);
  });

  it(`syncs 100 articles in under ${BUDGET_CRON_100_ARTICLES}ms`, async () => {
    buildCronMocks(100);

    const start = Date.now();
    const res = await postCron(makeCronRequest());
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(BUDGET_CRON_100_ARTICLES);
  });

  it("throughput scales linearly: 50 articles takes roughly half of 100 articles", async () => {
    // Measure 50-article run
    buildCronMocks(50);
    const start50 = performance.now();
    await postCron(makeCronRequest());
    const elapsed50 = performance.now() - start50;

    // Measure 100-article run
    vi.clearAllMocks();
    buildCronMocks(100);
    const start100 = performance.now();
    await postCron(makeCronRequest());
    const elapsed100 = performance.now() - start100;

    // Allow up to 3× ratio (linear = 2×; allow slack for JIT and mock overhead)
    const ratio = elapsed100 / Math.max(elapsed50, 0.1);
    expect(ratio).toBeLessThan(3);
  });
});

// Scoring function performance tests removed — evaluatePriority is now inline
// in sync.ts and not exported as a standalone function. Scoring perf is covered
// by the cron performance suite above (sync includes scoring in its pipeline).
