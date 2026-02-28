import { syncArticles } from "./sync";
import { ForemArticle, ForemClient } from "@/lib/forem";
import { evaluatePriority } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/forem", () => ({
  ForemClient: {
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
// Helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Record<string, unknown> = {}): ForemArticle {
  return {
    id: 1,
    title: "Test Article",
    description: "",
    readable_publish_date: "Jan 1",
    slug: "test-article",
    path: "/testuser/test-article",
    url: "https://dev.to/testuser/test-article",
    comments_count: 2,
    public_reactions_count: 5,
    collection_id: null,
    published_timestamp: "2024-01-01T10:00:00Z",
    positive_reactions_count: 5,
    cover_image: null,
    social_image: "https://dev.to/social.png",
    canonical_url: "https://dev.to/test",
    created_at: "2024-01-01T10:00:00Z",
    edited_at: null,
    crossposted_at: null,
    published_at: "2024-01-01T10:00:00Z",
    last_comment_at: "2024-01-01T10:00:00Z",
    reading_time_minutes: 3,
    tag_list: ["javascript"],
    tags: "javascript",
    user: {
      name: "Test User",
      username: "testuser",
      twitter_username: null,
      github_username: null,
      user_id: 1,
      website_url: null,
      profile_image: "https://example.com/pic.jpg",
      profile_image_90: "https://example.com/pic90.jpg",
    },
    ...overrides,
  } as ForemArticle;
}

function makeScore(overrides: Record<string, unknown> = {}) {
  return {
    total: 10,
    behavior: 0,
    audience: 5,
    pattern: 5,
    explanations: [],
    attention_level: "low" as const,
    ...overrides,
  };
}

const DEFAULT_UPSERT_RESULT = { data: null, error: null };

function makeUpsertChain(result = DEFAULT_UPSERT_RESULT) {
  return { upsert: vi.fn().mockResolvedValue(result) };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("syncArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty input ────────────────────────────────────────────────────────────

  it("does nothing when articles array is empty", async () => {
    const result = await syncArticles([]);
    expect(ForemClient.getUserByUsername).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
  });

  // ── User upsert ────────────────────────────────────────────────────────────

  it("upserts user when detailedUser is returned", async () => {
    const article = makeArticle();
    const detailedUser = {
      username: "testuser",
      joined_at: "2023-01-01T00:00:00Z",
    };

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(detailedUser);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const userUpsert = chain.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect((supabase.from as Mock).mock.calls[0][0]).toBe("users");
    expect(userUpsert.username).toBe("testuser");
    expect(userUpsert.joined_at).toBe("2023-01-01T00:00:00Z");
    expect(typeof userUpsert.updated_at).toBe("string");
  });

  it("skips user upsert when getUserByUsername returns null", async () => {
    const article = makeArticle();

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const tables = (supabase.from as Mock).mock.calls.map((c) => c[0]);
    expect(tables).not.toContain("users");
  });

  // ── Article upsert ─────────────────────────────────────────────────────────

  it("upserts article with all required fields", async () => {
    const article = makeArticle({
      id: 42,
      title: "My Article",
      published_at: "2024-03-15T08:00:00Z",
      public_reactions_count: 7,
      comments_count: 3,
      tag_list: ["ts", "react"],
      canonical_url: "https://dev.to/my-article",
    });

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(
      makeScore({ total: 55, attention_level: "medium" }),
    );

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const articleUpsert = chain.upsert.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>).id === 42,
    )?.[0] as Record<string, unknown>;

    expect(articleUpsert).toBeDefined();
    expect(articleUpsert.id).toBe(42);
    expect(articleUpsert.author).toBe("testuser");
    expect(articleUpsert.title).toBe("My Article");
    expect(articleUpsert.published_at).toBe("2024-03-15T08:00:00Z");
    expect(articleUpsert.reactions).toBe(7);
    expect(articleUpsert.comments).toBe(3);
    expect(articleUpsert.tags).toEqual(["ts", "react"]);
    expect(articleUpsert.canonical_url).toBe("https://dev.to/my-article");
    expect(articleUpsert.score).toBe(55);
    expect(articleUpsert.attention_level).toBe("medium");
    expect(typeof articleUpsert.updated_at).toBe("string");
  });

  // ── Commenter upsert ───────────────────────────────────────────────────────

  it("upserts each commenter with article_id and onConflict option", async () => {
    const article = makeArticle({ id: 7 });
    const comments = [
      { user: { username: "alice" } },
      { user: { username: "bob" } },
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue(comments);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const commenterCalls = chain.upsert.mock.calls.filter(
      (call: unknown[]) =>
        (call[0] as Record<string, unknown>).article_id === 7,
    );
    expect(commenterCalls).toHaveLength(2);
    expect(commenterCalls[0][0]).toMatchObject({
      article_id: 7,
      username: "alice",
    });
    expect(commenterCalls[0][1]).toEqual({ onConflict: "article_id,username" });
    expect(commenterCalls[1][0]).toMatchObject({
      article_id: 7,
      username: "bob",
    });
  });

  it("makes no commenter upserts when article has no comments", async () => {
    const article = makeArticle({ id: 99 });

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const commenterCalls = chain.upsert.mock.calls.filter(
      (call: unknown[]) =>
        (call[0] as Record<string, unknown>).article_id === 99,
    );
    expect(commenterCalls).toHaveLength(0);
  });

  // ── evaluatePriority integration ───────────────────────────────────────────

  it("passes null detailedUser to evaluatePriority when lookup returns null", async () => {
    const article = makeArticle();

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const [, userArg] = (evaluatePriority as Mock).mock.calls[0];
    expect(userArg).toBeNull();
  });

  it("passes correct comments to evaluatePriority", async () => {
    const article = makeArticle();
    const comments = [
      { user: { username: "u1" } },
      { user: { username: "u2" } },
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue(comments);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles([article]);

    const [, , commentsArg] = (evaluatePriority as Mock).mock.calls[0];
    expect(commentsArg).toEqual(comments);
  });

  it("filters recentPosts to only the same author when calling evaluatePriority", async () => {
    const articles = [
      makeArticle({ id: 20, user: { username: "alice" } }),
      makeArticle({ id: 21, user: { username: "bob" } }),
      makeArticle({ id: 22, user: { username: "alice" } }),
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles(articles);

    const aliceRecentPosts = (evaluatePriority as Mock).mock
      .calls[0][3] as Array<{
      user: { username: string };
    }>;
    expect(aliceRecentPosts.every((a) => a.user.username === "alice")).toBe(
      true,
    );

    const bobRecentPosts = (evaluatePriority as Mock).mock
      .calls[1][3] as Array<{
      user: { username: string };
    }>;
    expect(bobRecentPosts.every((a) => a.user.username === "bob")).toBe(true);
  });

  // ── Author deduplication ───────────────────────────────────────────────────

  it("fetches each unique author only once across multiple articles from the same author", async () => {
    const articles = [
      makeArticle({ id: 1, user: { username: "alice" } }),
      makeArticle({ id: 2, user: { username: "alice" } }),
      makeArticle({ id: 3, user: { username: "alice" } }),
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles(articles);

    expect(ForemClient.getUserByUsername).toHaveBeenCalledTimes(1);
    expect(ForemClient.getUserByUsername).toHaveBeenCalledWith("alice");
  });

  it("upserts each unique author's user record exactly once even with multiple articles", async () => {
    const detailedUser = {
      username: "alice",
      joined_at: "2023-01-01T00:00:00Z",
    };
    const articles = [
      makeArticle({ id: 1, user: { username: "alice" } }),
      makeArticle({ id: 2, user: { username: "alice" } }),
      makeArticle({ id: 3, user: { username: "bob" } }),
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(detailedUser);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles(articles);

    // 2 unique authors → 2 getUserByUsername calls, 2 user upserts
    expect(ForemClient.getUserByUsername).toHaveBeenCalledTimes(2);
    const userUpserts = (supabase.from as Mock).mock.calls
      .map((call) => call[0])
      .filter((table) => table === "users");
    expect(userUpserts).toHaveLength(2);
  });

  it("passes all same-author articles as recentPosts for each of that author's articles", async () => {
    const articles = [
      makeArticle({ id: 10, user: { username: "alice" } }),
      makeArticle({ id: 11, user: { username: "alice" } }),
      makeArticle({ id: 12, user: { username: "alice" } }),
    ];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    await syncArticles(articles);

    // All 3 evaluatePriority calls should receive all 3 alice articles as recentPosts.
    for (const call of (evaluatePriority as Mock).mock.calls) {
      const recentPosts = call[3] as Array<{ user: { username: string } }>;
      expect(recentPosts).toHaveLength(3);
      expect(recentPosts.every((a) => a.user.username === "alice")).toBe(true);
    }
  });

  // ── Error / exception flows ────────────────────────────────────────────────

  it("captures getUserByUsername error in result and continues", async () => {
    (ForemClient.getUserByUsername as Mock).mockRejectedValue(
      new Error("User lookup failed"),
    );

    const result = await syncArticles([makeArticle()]);

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.errors[0]).toContain("User lookup failed");
  });

  it("captures getComments error in result and continues", async () => {
    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockRejectedValue(
      new Error("Comment API error"),
    );

    const result = await syncArticles([makeArticle()]);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Comment API error");
  });

  it("captures supabase upsert promise rejection in result and continues", async () => {
    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    (supabase.from as Mock).mockReturnValue({
      upsert: vi.fn().mockRejectedValue(new Error("Supabase write failure")),
    });

    const result = await syncArticles([makeArticle()]);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Supabase write failure");
  });

  it("captures supabase upsert resolved error field in result and continues", async () => {
    // Supabase resolves (does not throw) with { error } on write failures.
    // This test verifies those non-throwing errors are surfaced via SyncResult.
    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock).mockResolvedValue([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    (supabase.from as Mock).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "unique constraint violated", code: "23505" },
      }),
    });

    const result = await syncArticles([makeArticle()]);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("unique constraint violated");
  });

  it("continues processing subsequent articles after a per-article error", async () => {
    const articles = [makeArticle({ id: 30 }), makeArticle({ id: 31 })];

    (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
    (ForemClient.getComments as Mock)
      .mockRejectedValueOnce(new Error("Partial failure"))
      .mockResolvedValueOnce([]);
    (evaluatePriority as Mock).mockReturnValue(makeScore());

    const chain = makeUpsertChain();
    (supabase.from as Mock).mockReturnValue(chain);

    const result = await syncArticles(articles);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Partial failure");
    // Second article was still processed
    expect(ForemClient.getComments).toHaveBeenCalledTimes(2);
  });
});
