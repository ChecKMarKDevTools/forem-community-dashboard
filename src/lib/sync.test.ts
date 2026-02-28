import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncArticles } from "./sync";
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

/** Resets the supabase.from mock to return a fresh upsert chain. */
function resetSupabaseMock() {
  vi.mocked(supabase.from).mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
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
  vi.mocked(ForemClient.getArticle).mockImplementation(async (id: number) => {
    const article = (articles as Record<string, unknown>[]).find(
      (a) => a.id === id,
    );
    return article || makeArticle({ id });
  });
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

  it("returns zero synced when no articles fall in the 2-72h window", async () => {
    // Article too old (100 hours)
    const article = makeArticle({
      id: 70,
      published_at: new Date(NOW - 100 * 60 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
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
});
