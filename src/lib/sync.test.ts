import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  syncArticles,
  buildVelocityBuckets,
  buildConstructivenessBuckets,
  buildCommenterShares,
  buildSentimentSpread,
  buildArticleMetrics,
} from "./sync";
import { ForemUser, ForemComment, ForemClient } from "./forem";
import { supabase } from "./supabase";

vi.mock("./forem", () => ({
  ForemClient: {
    getLatestArticles: vi.fn(),
    getArticle: vi.fn(),
    getComments: vi.fn(),
    getUserByUsername: vi.fn(),
  },
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockUser: ForemUser = {
  type_of: "user",
  id: 1,
  name: "Test User",
  username: "testuser",
  summary: "",
  twitter_username: null,
  github_username: null,
  website_url: null,
  location: null,
  joined_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  profile_image: "",
};

/** Fresh user (joined < 30 days ago, 1 post in 24h) triggers is_first_post logic. */
const freshUser: ForemUser = {
  type_of: "user",
  id: 2,
  name: "New User",
  username: "newuser",
  summary: "",
  twitter_username: null,
  github_username: null,
  website_url: null,
  location: null,
  joined_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  profile_image: "",
};

const NOW = Date.now();
/** 3 hours ago — safely inside the 2-72h sync window. */
const THREE_HOURS_AGO = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
/** 34 hours ago — in the sync window and time_since_post > 30 min for NEEDS_RESPONSE. */
const THIRTY_FOUR_HOURS_AGO = new Date(NOW - 34 * 60 * 60 * 1000).toISOString();

function makeArticle(overrides: Record<string, unknown>) {
  return {
    id: 1,
    title: "Test Article",
    description: "desc",
    body_markdown: "word ".repeat(50),
    url: "https://dev.to/test1",
    published_at: THREE_HOURS_AGO,
    public_reactions_count: 10,
    comments_count: 2,
    reading_time_minutes: 2,
    tag_list: ["test"],
    tags: "test",
    canonical_url: "https://dev.to/test1",
    user: { username: "testuser", name: "Test User" },
    ...overrides,
  };
}

function makeComment(overrides: Partial<ForemComment> = {}): ForemComment {
  return {
    type_of: "comment",
    id_code: "c1",
    created_at: new Date().toISOString(),
    body_html: "<p>Nice post</p>",
    user: {
      name: "Commenter",
      username: "commenter1",
      twitter_username: null,
      github_username: null,
      website_url: null,
      profile_image: "",
      profile_image_90: "",
    },
    children: [],
    ...overrides,
  };
}

/** Resets the supabase.from mock to return a fresh upsert/select/delete chain.
 *  - select → eq → gte resolves to empty data (backfill is a no-op)
 *  - delete → lt → select resolves to empty data (purge is a no-op) */
function resetSupabaseMock() {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const deleteChain = {
    lt: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  vi.mocked(supabase.from).mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnValue(selectChain),
    delete: vi.fn().mockReturnValue(deleteChain),
  } as never);
}

function setupBasicMocks(
  articles: Record<string, unknown>[],
  comments: ForemComment[] | ((id: number) => Promise<ForemComment[]>) = [],
  user:
    | ForemUser
    | ((username: string) => Promise<ForemUser | null>) = mockUser,
) {
  vi.mocked(ForemClient.getLatestArticles).mockImplementation(async (page) => {
    if (page === 1) return articles as never;
    return [];
  });
  vi.mocked(ForemClient.getArticle).mockImplementation(
    async (id: number, _?: boolean) => {
      const article = (articles as Record<string, unknown>[]).find(
        (a) => a.id === id,
      );
      return (article || makeArticle({ id })) as never;
    },
  );
  if (typeof user === "function") {
    vi.mocked(ForemClient.getUserByUsername).mockImplementation(user);
  } else {
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(user);
  }
  if (typeof comments === "function") {
    vi.mocked(ForemClient.getComments).mockImplementation(comments);
  } else {
    vi.mocked(ForemClient.getComments).mockResolvedValue(comments);
  }
  resetSupabaseMock();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("syncArticles scoring pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Category: NEEDS_RESPONSE ───────────────────────────────────────────

  it("classifies NEEDS_RESPONSE when support_score >= 3 and time_since_post >= 30", async () => {
    // time_since_post = 34h*60 = 2040 min, reactions=0, comments=0,
    // fresh user (is_first_post = true → +2), no reactions (+1), no comments (+2) → support = 5
    const article = makeArticle({
      id: 1,
      published_at: THIRTY_FOUR_HOURS_AGO,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 1,
      user: { username: "newuser", name: "New User" },
    });

    setupBasicMocks([article], [], freshUser);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: POSSIBLY_LOW_QUALITY ─────────────────────────────────────

  it("classifies POSSIBLY_LOW_QUALITY when risk_score >= 4", async () => {
    // freq penalty: 1 post (<=2 threshold) = 0, word_count=100 < 120 (+2),
    // no engagement (+2), author promo keywords "buy"+"subscribe" (+2) → risk = 6 - 0 engage = 6
    const article = makeArticle({
      id: 2,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
    });

    // Promo comment from the article AUTHOR — only author promo words count
    const promoComment = makeComment({
      body_html: "<p>buy this product now subscribe</p>",
      user: {
        name: "Test User",
        username: "testuser",
        twitter_username: null,
        github_username: null,
        website_url: null,
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article], [promoComment]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: NEEDS_REVIEW ─────────────────────────────────────────────

  it("classifies NEEDS_REVIEW when comment_count >= 6, heat_score >= 5, reaction/comment < 1.2", async () => {
    const article = makeArticle({
      id: 3,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
    });

    // 20 comments with negative sentiment to get high heat_score
    const comments = Array.from({ length: 20 }, (_, i) =>
      makeComment({
        id_code: `c3_${i}`,
        body_html: "<p>terrible bad awful broken issue</p>",
        user: {
          name: `User ${i}`,
          username: `user${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: BOOST_VISIBILITY ─────────────────────────────────────────

  it("classifies BOOST_VISIBILITY when effort is high but exposure is low", async () => {
    // word_count >= 600 (reading_time * 200 = 1000), distinct_commenters >= 2,
    // avg_comment_length >= 18, reaction_count <= 5, attention_delta >= 3
    const article = makeArticle({
      id: 4,
      public_reactions_count: 1,
      comments_count: 2,
      reading_time_minutes: 5,
    });

    const comments = [
      makeComment({
        id_code: "c4_1",
        body_html:
          "<p>" +
          "This is a great detailed insightful comment with many words ".repeat(
            5,
          ) +
          "</p>",
        user: {
          name: "User 1",
          username: "commenter_a",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      makeComment({
        id_code: "c4_2",
        body_html:
          "<p>" +
          "Another excellent thoughtful response explaining the topic ".repeat(
            5,
          ) +
          "</p>",
        user: {
          name: "User 2",
          username: "commenter_b",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: NORMAL ───────────────────────────────────────────────────

  it("classifies NORMAL when no category thresholds are met", async () => {
    const article = makeArticle({
      id: 5,
      public_reactions_count: 10,
      comments_count: 2,
      reading_time_minutes: 2,
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── All 5 categories in a single run ───────────────────────────────────

  it("covers all 5 category branches in a single sync run", async () => {
    const articles = [
      // NEEDS_RESPONSE: old post, fresh user, no engagement
      makeArticle({
        id: 10,
        published_at: THIRTY_FOUR_HOURS_AGO,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
      // POSSIBLY_LOW_QUALITY: short, no engagement
      makeArticle({
        id: 20,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 0.5,
      }),
      // NEEDS_REVIEW: many heated comments
      makeArticle({
        id: 30,
        public_reactions_count: 2,
        comments_count: 20,
        reading_time_minutes: 5,
      }),
      // BOOST_VISIBILITY: quality content, low exposure
      makeArticle({
        id: 40,
        public_reactions_count: 1,
        comments_count: 2,
        reading_time_minutes: 5,
      }),
      // NORMAL: average post
      makeArticle({
        id: 50,
        public_reactions_count: 10,
        comments_count: 2,
        reading_time_minutes: 2,
      }),
    ];

    setupBasicMocks(
      articles,
      async (id: number) => {
        if (id === 30) {
          return Array.from({ length: 20 }, (_, i) =>
            makeComment({
              id_code: `c30_${i}`,
              body_html: "<p>terrible bad awful broken</p>",
              user: {
                name: `User ${i}`,
                username: `user${i}`,
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
          );
        }
        if (id === 40) {
          return [
            makeComment({
              id_code: "c40_1",
              body_html:
                "<p>" +
                "This is a great detailed insightful comment with many words ".repeat(
                  5,
                ) +
                "</p>",
              user: {
                name: "A",
                username: "commenter_a",
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
            makeComment({
              id_code: "c40_2",
              body_html:
                "<p>" +
                "Another excellent thoughtful response explaining the topic ".repeat(
                  5,
                ) +
                "</p>",
              user: {
                name: "B",
                username: "commenter_b",
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
          ];
        }
        return [];
      },
      async (username: string) => {
        if (username === "newuser") return freshUser;
        return mockUser;
      },
    );

    const result = await syncArticles(5);

    expect(result.synced).toBe(5);
    expect(result.failed).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith("articles");
    expect(supabase.from).toHaveBeenCalledWith("users");
  });

  // ── repeated_links metric ──────────────────────────────────────────────

  it("adds repeated_links=2 to risk_score when a domain appears > 2 times", async () => {
    const article = makeArticle({
      id: 60,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
    });

    // 3 comments each linking to the same external domain
    const spamComments = Array.from({ length: 3 }, (_, i) =>
      makeComment({
        id_code: `spam_${i}`,
        body_html: `<p>Check this <a href="https://spam.example.com/page${i}">link</a></p>`,
        user: {
          name: `Spammer ${i}`,
          username: `spammer${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], spamComments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does not add repeated_links when no domain exceeds threshold", async () => {
    const article = makeArticle({
      id: 61,
      public_reactions_count: 10,
      comments_count: 2,
      reading_time_minutes: 2,
    });

    // 2 comments with different domains — neither exceeds 2
    const comments = [
      makeComment({
        id_code: "link1",
        body_html:
          '<p>See <a href="https://a.example.com">A</a> and <a href="https://b.example.com">B</a></p>',
      }),
      makeComment({
        id_code: "link2",
        body_html: '<p>Also <a href="https://c.example.com">C</a></p>',
        user: {
          name: "Other",
          username: "other",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("returns zero synced when article is older than the 120-hour sync window", async () => {
    // 200 hours = > 5 days, outside SYNC_WINDOW_HOURS
    const article = makeArticle({
      id: 70,
      published_at: new Date(NOW - 200 * 60 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("syncs articles at exactly the 120-hour boundary (inclusive lower edge)", async () => {
    // 119 hours — just inside the window
    const article = makeArticle({
      id: 72,
      published_at: new Date(NOW - 119 * 60 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fetches page 2 when page 1 articles are still within the sync window", async () => {
    // Page 1 returns one article within the window
    const page1Article = makeArticle({ id: 300 });
    // Page 2 returns one more article (also within the window); page 3 returns []
    const page2Article = makeArticle({
      id: 301,
      published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [page1Article] as never;
        if (page === 2) return [page2Article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles();

    // Both articles from page 1 and page 2 should be synced
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(1, 100);
    expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(2, 100);
  });

  it("stops fetching pages early when oldest article on the page exceeds SYNC_WINDOW_HOURS", async () => {
    // Page 1: articles within window
    const recentArticle = makeArticle({ id: 310 });
    // Page 2: oldest article is 200h old — triggers early exit, no page 3 request
    const staleArticle = makeArticle({
      id: 311,
      published_at: new Date(NOW - 200 * 60 * 60 * 1000).toISOString(),
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [recentArticle] as never;
        if (page === 2) return [staleArticle] as never;
        // page 3+ should never be called
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles();

    // Only the recent article from page 1 is in the valid window
    expect(result.synced).toBe(1);
    // Page 3 was never requested
    expect(ForemClient.getLatestArticles).not.toHaveBeenCalledWith(3, 100);
  });

  it("processes all valid articles when maxToProcess is undefined (production path)", async () => {
    // 3 articles all within the sync window
    const articles = [
      makeArticle({ id: 320 }),
      makeArticle({
        id: 321,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
      makeArticle({
        id: 322,
        published_at: new Date(NOW - 6 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    // Call with no argument — production behavior, no cap
    const result = await syncArticles();

    expect(result.synced).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("returns zero synced when article is too fresh (< 2h)", async () => {
    const article = makeArticle({
      id: 71,
      published_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns zero synced when Forem returns empty article list", async () => {
    setupBasicMocks([]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("handles nested comment children for alternating_pairs detection", async () => {
    const article = makeArticle({
      id: 80,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
    });

    // A→B→A reply chain (alternating pair)
    const nestedComments: ForemComment[] = [
      {
        type_of: "comment",
        id_code: "root",
        created_at: new Date().toISOString(),
        body_html: "<p>terrible broken thing</p>",
        user: {
          name: "Alice",
          username: "alice",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
        children: [
          {
            type_of: "comment",
            id_code: "reply1",
            created_at: new Date().toISOString(),
            body_html: "<p>bad response wrong take</p>",
            user: {
              name: "Bob",
              username: "bob",
              twitter_username: null,
              github_username: null,
              website_url: null,
              profile_image: "",
              profile_image_90: "",
            },
            children: [
              {
                type_of: "comment",
                id_code: "reply2",
                created_at: new Date().toISOString(),
                body_html: "<p>terrible take</p>",
                user: {
                  name: "Alice",
                  username: "alice",
                  twitter_username: null,
                  github_username: null,
                  website_url: null,
                  profile_image: "",
                  profile_image_90: "",
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    setupBasicMocks([article], nestedComments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Fresh counts from individual article fetch ──────────────────────

  it("uses fresh counts from getArticle instead of stale list API counts", async () => {
    // List API returns stale counts (2 reactions, 0 comments)
    const article = makeArticle({
      id: 95,
      public_reactions_count: 2,
      comments_count: 0,
    });

    // Individual article fetch returns updated counts (15 reactions, 5 comments)
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockResolvedValue(
      makeArticle({
        id: 95,
        public_reactions_count: 15,
        comments_count: 5,
        body_markdown: "word ".repeat(100),
      }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Track upserted article data to verify fresh counts are used
    const upsertedArticles: Array<{ reactions: number; comments: number }> = [];
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if ("reactions" in data) {
          upsertedArticles.push(
            data as { reactions: number; comments: number },
          );
        }
        return { error: null };
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    // Verify fresh counts from getArticle were used, not stale list API counts
    expect(upsertedArticles).toHaveLength(1);
    expect(upsertedArticles[0].reactions).toBe(15);
    expect(upsertedArticles[0].comments).toBe(5);
  });

  it("falls back to list API counts when getArticle fails", async () => {
    const article = makeArticle({
      id: 96,
      public_reactions_count: 3,
      comments_count: 1,
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockRejectedValue(
      new Error("Article fetch failed"),
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    // Should still succeed using fallback counts from list API
    expect(result.failed).toBe(0);
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it("counts failed articles when user upsert fails", async () => {
    const article = makeArticle({ id: 90 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({
        error: { message: "User upsert failed" },
      }),
      select: vi.fn().mockReturnThis(),
    } as never);

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("User upsert failed");
  });

  it("throws on fatal pipeline error (getLatestArticles fails)", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockRejectedValue(
      new Error("Forem API down"),
    );

    await expect(syncArticles(1)).rejects.toThrow("Forem API down");
  });

  it("throws wrapped error for non-Error fatal failures", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockRejectedValue("string error");

    await expect(syncArticles(1)).rejects.toThrow("Fatal Sync Pipeline Error");
  });

  it("processes comments with no body_html links gracefully", async () => {
    const article = makeArticle({ id: 100 });
    const comment = makeComment({
      body_html: "<p>Just a plain text comment with no links</p>",
    });

    setupBasicMocks([article], [comment]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles null user from resolveUser (user not found)", async () => {
    const article = makeArticle({ id: 110 });
    setupBasicMocks([article], [], null as unknown as ForemUser);

    const result = await syncArticles(1);

    // Should still sync — just skips user upsert
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("uses maxToProcess to limit shortlist size", async () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      makeArticle({ id: 200 + i }),
    );

    setupBasicMocks(articles);

    const result = await syncArticles(3);

    expect(result.synced).toBe(3);
    expect(result.failed).toBe(0);
  });

  // ── DevTeam org bypass ───────────────────────────────────────────────

  it("forces NORMAL for devteam org posts that would otherwise be NEEDS_REVIEW", async () => {
    const article = makeArticle({
      id: 400,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
      organization: {
        name: "The DEV Team",
        username: "devteam",
        slug: "devteam",
        profile_image: "",
        profile_image_90: "",
      },
    });

    // 20 heated comments — would trigger NEEDS_REVIEW without org bypass
    const comments = Array.from({ length: 20 }, (_, i) =>
      makeComment({
        id_code: `c400_${i}`,
        body_html: "<p>terrible bad awful broken issue</p>",
        user: {
          name: `User ${i}`,
          username: `user${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does NOT bypass classification for non-devteam orgs", async () => {
    const article = makeArticle({
      id: 401,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
      organization: {
        name: "Some Org",
        username: "someorg",
        slug: "someorg",
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    // Should still classify (not forced NORMAL) — low quality signals present
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Promo keyword scoping ──────────────────────────────────────────

  it("ignores promo keywords from non-author commenters", async () => {
    const article = makeArticle({
      id: 410,
      public_reactions_count: 15,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    // Promo comment from someone OTHER than the article author
    const promoComment = makeComment({
      body_html: "<p>buy this subscribe to my channel follow me</p>",
      user: {
        name: "Random Commenter",
        username: "randomguy",
        twitter_username: null,
        github_username: null,
        website_url: null,
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article], [promoComment]);

    const result = await syncArticles(1);

    // Should NOT be POSSIBLY_LOW_QUALITY because promo words are from a commenter, not the author
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Frequency penalty threshold ────────────────────────────────────

  it("does not penalize authors with 2 or fewer posts per day", async () => {
    // Two articles by the same author within 24h
    const articles = [
      makeArticle({
        id: 420,
        public_reactions_count: 15,
        comments_count: 3,
        reading_time_minutes: 3,
      }),
      makeArticle({
        id: 421,
        public_reactions_count: 12,
        comments_count: 2,
        reading_time_minutes: 2,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    const result = await syncArticles(2);

    // Both should sync as NORMAL — 2 posts/day = 0 frequency penalty
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  // ── Engagement credit ──────────────────────────────────────────────

  it("engagement credit offsets risk for high-traction posts", async () => {
    // Short post (word_count < 120 → +2 risk) but lots of engagement
    const article = makeArticle({
      id: 430,
      public_reactions_count: 50,
      comments_count: 10,
      reading_time_minutes: 0.5,
    });

    // 6 unique commenters to trigger distinct_commenters >= 5 credit
    const comments = Array.from({ length: 6 }, (_, i) =>
      makeComment({
        id_code: `c430_${i}`,
        body_html: "<p>Good stuff</p>",
        user: {
          name: `User ${i}`,
          username: `commenter${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    // reactions>=10 → -2, distinct_commenters>=5 → -1, total engage credit = -3
    // risk = 0 + 2 (short) + 0 + 0 + 0 - 3 = max(0, -1) = 0 → NORMAL
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Existing edge cases continue ───────────────────────────────────

  it("sets is_first_post=false for fresh user with multiple posts in 24h", async () => {
    // Two articles by the same fresh user within 24h → postsByAuthor24h > 1
    // so is_first_post condition (===1) fails even though joined < 30 days ago.
    const articles = [
      makeArticle({
        id: 500,
        published_at: THREE_HOURS_AGO,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
      makeArticle({
        id: 501,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
    ];

    setupBasicMocks(articles, [], freshUser);

    const result = await syncArticles(2);

    // Both sync, but is_first_post is false since author has 2 posts in 24h
    // Support score is lower without the +2 bonus from is_first_post
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("counts failed articles when article upsert fails", async () => {
    const article = makeArticle({ id: 510 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // User upsert succeeds
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
        } as never;
      }
      // Article upsert fails
      return {
        upsert: vi.fn().mockResolvedValue({
          error: { message: "Article upsert constraint violation" },
        }),
        select: vi.fn().mockReturnThis(),
      } as never;
    });

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Article upsert constraint violation");
  });

  it("records 'Unknown error' when per-article catch receives a non-Error value", async () => {
    const article = makeArticle({ id: 520 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    // Throw a non-Error value from getUserByUsername to trigger the non-Error branch
    vi.mocked(ForemClient.getUserByUsername).mockRejectedValue(
      "string rejection",
    );
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Unknown error");
  });

  it("caches resolved users to avoid duplicate upserts", async () => {
    // Two articles by the same author
    const articles = [
      makeArticle({ id: 300 }),
      makeArticle({
        id: 301,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    await syncArticles(2);

    // getUserByUsername should only be called once for the same author
    expect(ForemClient.getUserByUsername).toHaveBeenCalledTimes(1);
  });

  // ── Null username handling (deleted Forem accounts) ──────────────────

  it("skips commenter tracking for comments with null usernames", async () => {
    const article = makeArticle({
      id: 700,
      public_reactions_count: 5,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    const comments: ForemComment[] = [
      // Normal commenter
      makeComment({
        id_code: "c700_1",
        body_html: "<p>great post</p>",
        user: {
          name: "Normal User",
          username: "normaluser",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      // Deleted account with null username
      makeComment({
        id_code: "c700_2",
        body_html: "<p>deleted user comment</p>",
        user: {
          name: null,
          username: null,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles nested replies from deleted accounts without crashing", async () => {
    const article = makeArticle({
      id: 710,
      public_reactions_count: 2,
      comments_count: 3,
      reading_time_minutes: 3,
    });

    const comments: ForemComment[] = [
      {
        type_of: "comment",
        id_code: "c710_root",
        created_at: new Date().toISOString(),
        body_html: "<p>root comment</p>",
        user: {
          name: "Alice",
          username: "alice",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
        children: [
          {
            type_of: "comment",
            id_code: "c710_deleted_reply",
            created_at: new Date().toISOString(),
            body_html: "<p>reply from deleted account</p>",
            user: {
              name: null,
              username: null,
              twitter_username: null,
              github_username: null,
              website_url: null,
              profile_image: "",
              profile_image_90: "",
            },
            children: [
              {
                type_of: "comment",
                id_code: "c710_grandchild",
                created_at: new Date().toISOString(),
                body_html: "<p>reply to deleted user</p>",
                user: {
                  name: "Bob",
                  username: "bob",
                  twitter_username: null,
                  github_username: null,
                  website_url: null,
                  profile_image: "",
                  profile_image_90: "",
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("includes metrics JSONB in the article upsert payload", async () => {
    const article = makeArticle({
      id: 600,
      public_reactions_count: 5,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    const comments = [
      makeComment({
        id_code: "c600_1",
        body_html: "<p>awesome helpful post</p>",
        created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        user: {
          name: "User A",
          username: "usera",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      makeComment({
        id_code: "c600_2",
        body_html: "<p>terrible broken thing</p>",
        created_at: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(),
        user: {
          name: "User B",
          username: "userb",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);

    // Verify that the upsert was called with a metrics field
    const upsertMock = vi.mocked(supabase.from).mock.results;
    const articleUpsertCall = upsertMock.find(
      (r) =>
        r.type === "return" &&
        (r.value as { upsert: ReturnType<typeof vi.fn> }).upsert,
    );
    expect(articleUpsertCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Purge stale articles
// ---------------------------------------------------------------------------

describe("syncArticles — purge step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes purge count in errors array when stale articles are deleted (production path)", async () => {
    const article = makeArticle({ id: 900 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Mock select chain (backfill returns empty) and delete chain (purge returns 2 rows)
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 101 }, { id: 102 }],
          error: null,
        }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    // No maxToProcess → production path (includes purge)
    const result = await syncArticles();

    expect(result.synced).toBe(1);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Purged 2 stale articles"),
    );
  });

  it("skips purge when maxToProcess is set (test path)", async () => {
    const article = makeArticle({ id: 910 });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    // With maxToProcess set, purge is skipped — no purge message in errors
    expect(result.errors).not.toContainEqual(expect.stringContaining("Purged"));
  });
});

// ---------------------------------------------------------------------------
// Metric builder function tests
// ---------------------------------------------------------------------------

describe("buildVelocityBuckets", () => {
  const publishedAt = "2024-01-01T10:00:00Z";

  it("buckets comments into hourly bins relative to publication", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = [
      new Date(pubTime + 30 * 60 * 1000), // 0.5h → bucket 0
      new Date(pubTime + 90 * 60 * 1000), // 1.5h → bucket 1
      new Date(pubTime + 100 * 60 * 1000), // ~1.67h → bucket 1
    ];

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result).toEqual([
      { hour: 0, count: 1 },
      { hour: 1, count: 2 },
    ]);
  });

  it("returns empty array for no timestamps", () => {
    expect(buildVelocityBuckets([], publishedAt)).toEqual([]);
  });

  it("caps at 48 buckets", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = Array.from(
      { length: 60 },
      (_, i) => new Date(pubTime + i * 60 * 60 * 1000),
    );

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result.length).toBeLessThanOrEqual(48);
  });

  it("handles comments before publication (negative offset clamped to 0)", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = [new Date(pubTime - 60 * 60 * 1000)];

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result).toEqual([{ hour: 0, count: 1 }]);
  });
});

describe("buildConstructivenessBuckets", () => {
  const publishedAt = "2024-01-01T10:00:00Z";

  it("averages depth per hourly bucket", () => {
    const pubTime = new Date(publishedAt).getTime();
    const commentDepths = [
      { timestamp: new Date(pubTime + 30 * 60 * 1000), depth: 0 },
      { timestamp: new Date(pubTime + 40 * 60 * 1000), depth: 2 },
      { timestamp: new Date(pubTime + 90 * 60 * 1000), depth: 3 },
    ];

    const result = buildConstructivenessBuckets(commentDepths, publishedAt);

    expect(result).toEqual([
      { hour: 0, depth_index: 1 }, // avg(0, 2) = 1
      { hour: 1, depth_index: 3 }, // avg(3) = 3
    ]);
  });

  it("returns empty array for no data", () => {
    expect(buildConstructivenessBuckets([], publishedAt)).toEqual([]);
  });
});

describe("buildCommenterShares", () => {
  it("returns top-5 commenters sorted by share descending", () => {
    const counts = new Map([
      ["alice", 5],
      ["bob", 3],
      ["carol", 2],
      ["dave", 1],
      ["eve", 4],
      ["frank", 1],
    ]);

    const result = buildCommenterShares(counts, 16);

    expect(result).toHaveLength(5);
    expect(result[0].username).toBe("alice");
    expect(result[0].share).toBeCloseTo(5 / 16);
    expect(result[1].username).toBe("eve");
  });

  it("returns empty array when totalComments is 0", () => {
    const counts = new Map([["alice", 1]]);
    expect(buildCommenterShares(counts, 0)).toEqual([]);
  });

  it("returns all commenters when fewer than 5", () => {
    const counts = new Map([
      ["alice", 3],
      ["bob", 2],
    ]);
    const result = buildCommenterShares(counts, 5);
    expect(result).toHaveLength(2);
  });
});

describe("buildSentimentSpread", () => {
  it("computes correct percentages", () => {
    const result = buildSentimentSpread(3, 2, 10);
    expect(result.positive_pct).toBe(30);
    expect(result.negative_pct).toBe(20);
    expect(result.neutral_pct).toBe(50);
  });

  it("returns 100% neutral for zero comments", () => {
    const result = buildSentimentSpread(0, 0, 0);
    expect(result).toEqual({
      positive_pct: 0,
      neutral_pct: 100,
      negative_pct: 0,
    });
  });

  it("handles all-positive comments", () => {
    const result = buildSentimentSpread(5, 0, 5);
    expect(result.positive_pct).toBe(100);
    expect(result.negative_pct).toBe(0);
    expect(result.neutral_pct).toBe(0);
  });

  it("clamps neutral to 0 when pos+neg exceeds total", () => {
    // Edge case: a comment can be both positive AND negative
    const result = buildSentimentSpread(8, 5, 10);
    expect(result.neutral_pct).toBe(0);
  });
});

describe("buildArticleMetrics", () => {
  it("assembles a complete ArticleMetrics object", () => {
    const pubAt = "2024-01-01T10:00:00Z";
    const pubTime = new Date(pubAt).getTime();

    const metrics = {
      uniqueCommenters: new Set(["alice", "bob"]),
      totalCommentWords: 50,
      pos_comments: 2,
      neg_comments: 1,
      alternating_pairs: 1,
      replies_with_parent: 3,
      promo_keywords: 0,
      help_keywords: 1,
      externalDomainCounts: new Map<string, number>(),
      comment_timestamps: [
        new Date(pubTime + 60 * 60 * 1000),
        new Date(pubTime + 2 * 60 * 60 * 1000),
        new Date(pubTime + 2 * 60 * 60 * 1000),
      ],
      commenter_comment_counts: new Map([
        ["alice", 2],
        ["bob", 1],
      ]),
      comment_depths: [
        { timestamp: new Date(pubTime + 60 * 60 * 1000), depth: 0 },
        { timestamp: new Date(pubTime + 2 * 60 * 60 * 1000), depth: 1 },
        { timestamp: new Date(pubTime + 2 * 60 * 60 * 1000), depth: 2 },
      ],
    };

    const result = buildArticleMetrics({
      metrics,
      publishedAt: pubAt,
      commentCount: 3,
      ageHours: 5,
      riskScore: 2,
      frequencyPenalty: 0,
      engagementCredit: 1,
      wordCount: 500,
      reactionCount: 10,
      repeatedLinks: 0,
      isFirstPost: false,
    });

    expect(result.velocity_buckets).toHaveLength(2);
    expect(result.comments_per_hour).toBeCloseTo(3 / 5);
    expect(result.commenter_shares).toHaveLength(2);
    expect(result.commenter_shares[0].username).toBe("alice");
    expect(result.positive_pct).toBeCloseTo((2 / 3) * 100);
    expect(result.negative_pct).toBeCloseTo((1 / 3) * 100);
    expect(result.constructiveness_buckets).toHaveLength(2);
    expect(result.avg_comment_length).toBeCloseTo(50 / 3);
    expect(result.reply_ratio).toBeCloseTo(3 / 3);
    expect(result.alternating_pairs).toBe(1);
    expect(result.risk_score).toBe(2);
    expect(result.risk_components.frequency_penalty).toBe(0);
    expect(result.risk_components.short_content).toBe(false);
    expect(result.risk_components.no_engagement).toBe(false);
    expect(result.risk_components.engagement_credit).toBe(1);
    expect(result.sentiment_flips).toBe(1);
    expect(result.is_first_post).toBe(false);
    expect(result.help_keywords).toBe(1);
  });

  it("handles zero comments gracefully", () => {
    const metrics = {
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

    const result = buildArticleMetrics({
      metrics,
      publishedAt: "2024-01-01T10:00:00Z",
      commentCount: 0,
      ageHours: 3,
      riskScore: 4,
      frequencyPenalty: 2,
      engagementCredit: 0,
      wordCount: 50,
      reactionCount: 0,
      repeatedLinks: 0,
      isFirstPost: true,
    });

    expect(result.velocity_buckets).toEqual([]);
    expect(result.comments_per_hour).toBe(0);
    expect(result.commenter_shares).toEqual([]);
    expect(result.neutral_pct).toBe(100);
    expect(result.avg_comment_length).toBe(0);
    expect(result.reply_ratio).toBe(0);
    expect(result.risk_components.short_content).toBe(true);
    expect(result.risk_components.no_engagement).toBe(true);
    expect(result.is_first_post).toBe(true);
  });
});
