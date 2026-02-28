import { NextRequest } from "next/server";
import { GET } from "./route";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Chain builder helpers
// ---------------------------------------------------------------------------

/**
 * Builds a two-phase Supabase mock:
 *  Phase 1 (article lookup): .select().eq().single()
 *  Phase 2 (recent posts):   .select().eq().neq().order().limit()
 */
function buildChain(
  articleResult: { data: unknown; error: unknown },
  recentResult: { data: unknown; error: unknown },
) {
  let callCount = 0;

  (supabase.from as Mock).mockImplementation(() => {
    callCount++;

    if (callCount === 1) {
      // Article lookup chain
      const chain: Record<string, Mock> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue(articleResult),
      };
      return chain;
    }

    // Recent posts chain
    const chain: Record<string, Mock> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue(recentResult),
    };
    return chain;
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Positive ──────────────────────────────────────────────────────────────

  it("returns 200 with flattened article and recent_posts", async () => {
    const article = { id: 1, title: "Test", author: "user1", score: 80 };
    const recent = [
      {
        id: 2,
        title: "Older",
        published_at: "2024-01-01",
        score: 40,
        attention_level: "low",
        canonical_url: "https://example.com/2",
        dev_url: "https://dev.to/older",
      },
    ];
    buildChain({ data: article, error: null }, { data: recent, error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, makeParams("1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    // Top-level article fields
    expect(json.id).toBe(1);
    expect(json.title).toBe("Test");
    expect(json.author).toBe("user1");
    // recent_posts array
    expect(json.recent_posts).toHaveLength(1);
    expect(json.recent_posts[0].id).toBe(2);
  });

  it("returns empty array for recent_posts when Supabase returns null", async () => {
    const article = { id: 5, title: "Solo", author: "u1" };
    buildChain({ data: article, error: null }, { data: null, error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/5");
    const res = await GET(req, makeParams("5"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.recent_posts).toEqual([]);
  });

  it("returns empty array for recent_posts when recentPosts is an empty array", async () => {
    const article = { id: 9, title: "No Friends", author: "lonely" };
    buildChain({ data: article, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/9");
    const res = await GET(req, makeParams("9"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.recent_posts).toEqual([]);
  });

  it("queries articles table twice — once for article, once for recent posts", async () => {
    const article = { id: 3, author: "alice" };
    buildChain({ data: article, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/3");
    await GET(req, makeParams("3"));

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect((supabase.from as Mock).mock.calls[0][0]).toBe("articles");
    expect((supabase.from as Mock).mock.calls[1][0]).toBe("articles");
  });

  it("preserves all article fields in the flattened response", async () => {
    const article = {
      id: 77,
      title: "Full Fields",
      author: "bob",
      score: 42,
      attention_level: "medium",
      explanations: ["reason A"],
      tags: ["ts"],
      reactions: 10,
      comments: 3,
      published_at: "2024-06-01T00:00:00Z",
      canonical_url: "https://example.com/77",
      dev_url: "https://dev.to/testing",
    };
    buildChain({ data: article, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/77");
    const res = await GET(req, makeParams("77"));
    const json = await res.json();

    for (const [key, value] of Object.entries(article)) {
      expect(json[key]).toEqual(value);
    }
  });

  it("returns valid JSON content-type", async () => {
    const article = { id: 1, author: "x" };
    buildChain({ data: article, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, makeParams("1"));

    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // ── Invalid ID (400) ──────────────────────────────────────────────────────

  it("returns 400 for a non-numeric string ID", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/abc");
    const res = await GET(req, makeParams("abc"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid ID");
  });

  it("returns 400 for a float string ID", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/1.5");
    const res = await GET(req, makeParams("1.5"));
    const json = await res.json();

    // Number("1.5") → 1.5 → !isInteger(1.5) → 400
    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid ID");
  });

  it("returns 400 for an alpha-suffixed string ID (e.g. '1abc')", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/1abc");
    const res = await GET(req, makeParams("1abc"));
    const json = await res.json();

    // Number("1abc") → NaN → !isInteger(NaN) → 400
    // (parseInt would have silently truncated to 1 and fetched the wrong record)
    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid ID");
  });

  it("returns 400 for an empty string ID", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/");
    const res = await GET(req, makeParams(""));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid ID");
  });

  it("returns 400 for a purely whitespace ID", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/   ");
    const res = await GET(req, makeParams("   "));
    await res.json();

    // Number.parseInt("   ") → NaN
    expect(res.status).toBe(400);
  });

  // ── Not found (404) ───────────────────────────────────────────────────────

  it("returns 404 when article data is null and error is null", async () => {
    buildChain({ data: null, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/999");
    const res = await GET(req, makeParams("999"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("returns 404 when articleError is a non-null Error", async () => {
    buildChain(
      { data: null, error: new Error("Row not found") },
      { data: [], error: null },
    );

    const req = new NextRequest("http://localhost:3000/api/posts/404");
    const res = await GET(req, makeParams("404"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Post not found");
  });

  it("returns 404 when articleError is a plain object (non-Error)", async () => {
    buildChain(
      { data: null, error: { code: "PGRST116" } },
      { data: [], error: null },
    );

    const req = new NextRequest("http://localhost:3000/api/posts/404");
    const res = await GET(req, makeParams("404"));

    expect(res.status).toBe(404);
  });

  // ── Server error (500) ────────────────────────────────────────────────────

  it("returns 500 with error message when recent posts query fails with Error", async () => {
    const article = { id: 10, author: "u" };
    buildChain(
      { data: article, error: null },
      { data: null, error: new Error("Recent posts DB error") },
    );

    const req = new NextRequest("http://localhost:3000/api/posts/10");
    const res = await GET(req, makeParams("10"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Recent posts DB error");
  });

  it("returns 500 with message from PostgrestError (non-Error instance)", async () => {
    const article = { id: 11, author: "u" };
    // Real Supabase PostgrestError has message, code, details, hint fields
    buildChain(
      { data: article, error: null },
      {
        data: null,
        error: {
          message: "undefined table",
          code: "42P01",
          details: null,
          hint: null,
        },
      },
    );

    const req = new NextRequest("http://localhost:3000/api/posts/11");
    const res = await GET(req, makeParams("11"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("undefined table");
  });

  it("returns 500 when supabase.from throws synchronously", async () => {
    (supabase.from as Mock).mockImplementation(() => {
      throw new Error("Client uninitialized");
    });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, makeParams("1"));
    const json = await res.json();

    // The outer try/catch wraps Supabase calls and returns a structured 500.
    expect(res.status).toBe(500);
    expect(json.error).toBe("Client uninitialized");
  });

  it("returns 500 with 'Unknown error' when catch receives a non-Error value", async () => {
    const nonError: unknown = 42;
    (supabase.from as Mock).mockImplementation(() => {
      throw nonError;
    });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, makeParams("1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Unknown error");
  });

  // ── Boundary / numeric edge cases ─────────────────────────────────────────

  it("handles large numeric ID (MAX_SAFE_INTEGER string)", async () => {
    const largeId = String(Number.MAX_SAFE_INTEGER);
    buildChain({ data: null, error: null }, { data: [], error: null });

    const req = new NextRequest(`http://localhost:3000/api/posts/${largeId}`);
    const res = await GET(req, makeParams(largeId));

    // parseInt(Number.MAX_SAFE_INTEGER.toString()) is valid → proceeds to 404
    expect(res.status).toBe(404);
  });

  it("handles ID of '0'", async () => {
    buildChain({ data: null, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/0");
    const res = await GET(req, makeParams("0"));

    // 0 is a valid integer (not NaN) → proceeds to lookup → 404 (no article)
    expect(res.status).toBe(404);
  });

  it("handles negative ID string", async () => {
    buildChain({ data: null, error: null }, { data: [], error: null });

    const req = new NextRequest("http://localhost:3000/api/posts/-1");
    const res = await GET(req, makeParams("-1"));

    // parseInt("-1") = -1, valid → proceeds to lookup → 404
    expect(res.status).toBe(404);
  });
});
