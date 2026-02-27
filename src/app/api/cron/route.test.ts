import { POST } from "./route";
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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost:3000/api/cron", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const DEFAULT_UPSERT_RESULT: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};

function makeUpsertChain(
  result: { data: unknown; error: unknown } = DEFAULT_UPSERT_RESULT,
) {
  const chain = {
    upsert: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/** Minimal ForemArticle shape required by the cron handler. */
function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Test Article",
    published_at: "2024-01-01T10:00:00Z",
    public_reactions_count: 5,
    comments_count: 2,
    tag_list: ["javascript"],
    canonical_url: "https://dev.to/test",
    user: { username: "testuser" },
    ...overrides,
  };
}

function makeScore() {
  return {
    total: 10,
    behavior: 0,
    audience: 5,
    pattern: 5,
    explanations: [],
    attention_level: "low" as const,
  };
}

const VALID_SECRET = "test-secret";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("POST /api/cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 when Bearer token is wrong", async () => {
      const res = await POST(makeRequest("Bearer wrong-token"));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 when header uses incorrect scheme (Basic)", async () => {
      const res = await POST(makeRequest(`Basic ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET env var is undefined", async () => {
      delete process.env.CRON_SECRET;
      // With undefined secret, `Bearer undefined` would need to be sent —
      // any other token must fail.
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("passes authentication with correct Bearer token", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  // ── Success flows ─────────────────────────────────────────────────────────

  describe("success flows", () => {
    it("returns 200 with count 0 when articles list is empty", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true, count: 0 });
      expect(ForemClient.getUserByUsername).not.toHaveBeenCalled();
    });

    it("returns 200 with correct count for single article", async () => {
      const article = makeArticle();
      const score = makeScore();

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue({
        username: "testuser",
        joined_at: "2020-01-01T00:00:00Z",
      });
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(score);

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true, count: 1 });
    });

    it("upserts user data when detailedUser is found", async () => {
      const article = makeArticle();
      const detailedUser = {
        username: "testuser",
        joined_at: "2023-06-01T00:00:00Z",
      };

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(detailedUser);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      // First from() call = "users" upsert
      const fromCalls = (supabase.from as Mock).mock.calls;
      expect(fromCalls[0][0]).toBe("users");

      const userUpsertArg = upsertChain.upsert.mock.calls[0][0];
      expect(userUpsertArg.username).toBe("testuser");
      expect(userUpsertArg.joined_at).toBe("2023-06-01T00:00:00Z");
      expect(userUpsertArg.updated_at).toBeDefined();
    });

    it("skips user upsert when detailedUser is null", async () => {
      const article = makeArticle();

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      // With null user, from() is called for "articles" only (+ commenters if any)
      const fromCalls = (supabase.from as Mock).mock.calls.map((c) => c[0]);
      expect(fromCalls).not.toContain("users");
    });

    it("upserts article with score and attention_level from evaluatePriority", async () => {
      const article = makeArticle({ id: 42 });
      const score = {
        ...makeScore(),
        total: 55,
        attention_level: "medium" as const,
      };

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(score);

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      const articleUpsertArg = upsertChain.upsert.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).id === 42,
      )?.[0] as Record<string, unknown>;

      expect(articleUpsertArg).toBeDefined();
      expect(articleUpsertArg.score).toBe(55);
      expect(articleUpsertArg.attention_level).toBe("medium");
      expect(articleUpsertArg.author).toBe("testuser");
    });

    it("upserts commenters for each comment on an article", async () => {
      const article = makeArticle({ id: 7 });
      const comments = [
        { user: { username: "commenter1" } },
        { user: { username: "commenter2" } },
      ];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue(comments);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      // Find all commenter upsert calls
      const commenterCalls = upsertChain.upsert.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).article_id === 7,
      );
      expect(commenterCalls).toHaveLength(2);
      expect(commenterCalls[0][0]).toMatchObject({
        article_id: 7,
        username: "commenter1",
      });
      expect(commenterCalls[1][0]).toMatchObject({
        article_id: 7,
        username: "commenter2",
      });
    });

    it("uses onConflict option for commenter upserts", async () => {
      const article = makeArticle({ id: 3 });
      const comments = [{ user: { username: "alice" } }];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue(comments);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      const commenterCall = upsertChain.upsert.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).username === "alice",
      );
      expect(commenterCall?.[1]).toEqual({ onConflict: "article_id,username" });
    });

    it("handles multiple articles in one sync run", async () => {
      const articles = [
        makeArticle({ id: 10, user: { username: "userA" } }),
        makeArticle({ id: 11, user: { username: "userB" } }),
        makeArticle({ id: 12, user: { username: "userA" } }),
      ];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.count).toBe(3);
      // getUserByUsername called once per article
      expect(ForemClient.getUserByUsername).toHaveBeenCalledTimes(3);
    });

    it("passes evaluatePriority only articles by the same author as recentPosts", async () => {
      const articles = [
        makeArticle({ id: 20, user: { username: "alice" } }),
        makeArticle({ id: 21, user: { username: "bob" } }),
        makeArticle({ id: 22, user: { username: "alice" } }),
      ];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      // First call (alice, id=20): recentPosts should include articles with username="alice"
      const firstCallRecentPosts = (evaluatePriority as Mock).mock.calls[0][3];
      expect(
        firstCallRecentPosts.every(
          (a: { user: { username: string } }) => a.user.username === "alice",
        ),
      ).toBe(true);

      // Second call (bob, id=21): recentPosts should include only bob's articles
      const secondCallRecentPosts = (evaluatePriority as Mock).mock.calls[1][3];
      expect(
        secondCallRecentPosts.every(
          (a: { user: { username: string } }) => a.user.username === "bob",
        ),
      ).toBe(true);
    });
  });

  // ── Error / exception flows ────────────────────────────────────────────────

  describe("error flows", () => {
    it("returns 500 when ForemClient.getLatestArticles throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue(
        new Error("Forem API down"),
      );

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Forem API down");
    });

    it("returns 500 with 'Unknown error' for non-Error throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue("string error");

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Unknown error");
    });

    it("returns 500 when ForemClient.getComments throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([
        makeArticle(),
      ]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockRejectedValue(
        new Error("Comment API error"),
      );

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Comment API error");
    });

    it("returns 500 when supabase article upsert throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([
        makeArticle(),
      ]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      (supabase.from as Mock).mockReturnValue({
        upsert: vi.fn().mockRejectedValue(new Error("Supabase write failure")),
      });

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Supabase write failure");
    });

    it("returns 500 when ForemClient.getUserByUsername throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([
        makeArticle(),
      ]);
      (ForemClient.getUserByUsername as Mock).mockRejectedValue(
        new Error("User lookup failed"),
      );

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("User lookup failed");
    });

    it("still processes articles when one throws mid-loop (propagates to 500)", async () => {
      // The cron handler uses a for-loop with no per-article try/catch,
      // so any thrown error escapes to the top-level catch → 500.
      const articles = [makeArticle({ id: 30 }), makeArticle({ id: 31 })];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      // First call succeeds, second call throws
      (ForemClient.getComments as Mock)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("Partial failure"));
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(500);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles article with no comments (empty comments array)", async () => {
      const article = makeArticle({ id: 99 });

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);

      // No commenter upserts should have article_id=99
      const commenterCalls = upsertChain.upsert.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).article_id === 99,
      );
      expect(commenterCalls).toHaveLength(0);
    });

    it("stores correct article fields including title and updated_at", async () => {
      const article = makeArticle({
        id: 50,
        title: "Edge Case Title",
        published_at: "2024-03-15T08:00:00Z",
        public_reactions_count: 3,
        comments_count: 1,
        tag_list: ["edge"],
        canonical_url: "https://dev.to/edge-case",
      });

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      const articleUpsertArg = upsertChain.upsert.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).id === 50,
      )?.[0] as Record<string, unknown>;

      expect(articleUpsertArg.title).toBe("Edge Case Title");
      expect(articleUpsertArg.published_at).toBe("2024-03-15T08:00:00Z");
      expect(articleUpsertArg.reactions).toBe(3);
      expect(articleUpsertArg.comments).toBe(1);
      expect(articleUpsertArg.tags).toEqual(["edge"]);
      expect(typeof articleUpsertArg.updated_at).toBe("string");
    });

    it("uses page 1 and perPage 100 when fetching articles", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(1, 100);
    });

    it("passes detailedUser (null) to evaluatePriority when user lookup returns null", async () => {
      const article = makeArticle();

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue([]);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      const [, userArg] = (evaluatePriority as Mock).mock.calls[0];
      expect(userArg).toBeNull();
    });

    it("passes correct comments to evaluatePriority", async () => {
      const article = makeArticle({ id: 60 });
      const comments = [
        { user: { username: "u1" } },
        { user: { username: "u2" } },
      ];

      (ForemClient.getLatestArticles as Mock).mockResolvedValue([article]);
      (ForemClient.getUserByUsername as Mock).mockResolvedValue(null);
      (ForemClient.getComments as Mock).mockResolvedValue(comments);
      (evaluatePriority as Mock).mockReturnValue(makeScore());

      const upsertChain = makeUpsertChain();
      (supabase.from as Mock).mockReturnValue(upsertChain);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      const [, , commentsArg] = (evaluatePriority as Mock).mock.calls[0];
      expect(commentsArg).toEqual(comments);
    });
  });
});
