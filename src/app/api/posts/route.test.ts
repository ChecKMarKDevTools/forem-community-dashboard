import { GET } from "./route";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

/**
 * The posts route chain:
 * supabase.from("articles").select(...).gte(...).order(...).order(...).limit(50)
 *
 * The route re-sorts the returned rows client-side (non-NORMAL first, then
 * score DESC within each group), so we feed the mock data in a known order
 * and assert the JS re-sort, not the Supabase order.
 */
function buildChain(resolvedValue: { data: unknown; error: unknown }) {
  const mockSelect = vi.fn().mockReturnThis();
  const mockGte = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue(resolvedValue);

  (supabase.from as Mock).mockReturnValue({
    select: mockSelect,
    gte: mockGte,
    order: mockOrder,
    limit: mockLimit,
  });

  return { mockSelect, mockGte, mockOrder, mockLimit };
}

describe("GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Positive ──────────────────────────────────────────────────────────────

  it("returns 200 with posts on success", async () => {
    const mockData = [
      { id: "1", title: "Alpha", score: 100, attention_level: "NORMAL" },
      { id: "2", title: "Beta", score: 50, attention_level: "NORMAL" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(2);
  });

  it("queries the 'articles' table", async () => {
    buildChain({ data: [], error: null });

    await GET();

    expect(supabase.from).toHaveBeenCalledWith("articles");
  });

  it("selects only the expected columns", async () => {
    const { mockSelect } = buildChain({ data: [], error: null });

    await GET();

    expect(mockSelect).toHaveBeenCalledWith(
      "id, title, author, score, attention_level, canonical_url, dev_url, published_at, reactions, comments, explanations",
    );
  });

  it("filters articles to the 7-day window via gte", async () => {
    const { mockGte } = buildChain({ data: [], error: null });

    await GET();

    expect(mockGte).toHaveBeenCalledWith(
      "published_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it("limits results to 50 (display cap)", async () => {
    const { mockLimit } = buildChain({ data: [], error: null });

    await GET();

    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it("places non-NORMAL articles before NORMAL regardless of DB return order", async () => {
    const mockData = [
      {
        id: "1",
        title: "Spam",
        score: 90,
        attention_level: "SIGNAL_AT_RISK",
      },
      { id: "2", title: "Normal", score: 95, attention_level: "NORMAL" },
      { id: "3", title: "Hot", score: 70, attention_level: "NEEDS_REVIEW" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    // All non-NORMAL rows come before NORMAL
    const firstNormalIdx = json.findIndex(
      (p: { attention_level: string }) => p.attention_level === "NORMAL",
    );
    const lastNonNormalIdx = json.reduce(
      (acc: number, p: { attention_level: string }, i: number) =>
        p.attention_level !== "NORMAL" ? i : acc,
      -1,
    );
    expect(firstNormalIdx).toBeGreaterThan(lastNonNormalIdx);
  });

  it("sorts non-NORMAL group by score descending", async () => {
    const mockData = [
      { id: "1", title: "Low", score: 30, attention_level: "NEEDS_REVIEW" },
      {
        id: "2",
        title: "High",
        score: 80,
        attention_level: "SIGNAL_AT_RISK",
      },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json[0].score).toBeGreaterThanOrEqual(json[1].score);
  });

  it("sorts NORMAL group by score descending", async () => {
    const mockData = [
      { id: "1", title: "Low", score: 10, attention_level: "NORMAL" },
      { id: "2", title: "High", score: 60, attention_level: "NORMAL" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json[0].score).toBeGreaterThanOrEqual(json[1].score);
  });

  it("breaks score ties by published_at ascending (oldest first) within each group", async () => {
    const newer = "2024-01-10T10:00:00Z";
    const older = "2024-01-05T10:00:00Z";
    const mockData = [
      {
        id: "1",
        title: "Newer Non-Normal",
        score: 50,
        attention_level: "NEEDS_REVIEW",
        published_at: newer,
      },
      {
        id: "2",
        title: "Older Non-Normal",
        score: 50,
        attention_level: "SIGNAL_AT_RISK",
        published_at: older,
      },
      {
        id: "3",
        title: "Newer Normal",
        score: 20,
        attention_level: "NORMAL",
        published_at: newer,
      },
      {
        id: "4",
        title: "Older Normal",
        score: 20,
        attention_level: "NORMAL",
        published_at: older,
      },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    // Non-NORMAL group: same score, older should sort first
    expect(json[0].id).toBe("2"); // older non-normal
    expect(json[1].id).toBe("1"); // newer non-normal
    // NORMAL group: same score, older should sort first
    expect(json[2].id).toBe("4"); // older normal
    expect(json[3].id).toBe("3"); // newer normal
  });

  it("returns 200 with empty array when no articles exist", async () => {
    buildChain({ data: [], error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("returns 200 when Supabase returns null data (empty table)", async () => {
    buildChain({ data: null, error: null });

    const res = await GET();

    expect(res.status).toBe(200);
  });

  it("returns 200 with a single article", async () => {
    const mockData = [
      { id: "42", title: "Only Post", score: 99, attention_level: "NORMAL" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("42");
  });

  // ── Negative / Error ──────────────────────────────────────────────────────

  it("returns 500 with error message on database Error", async () => {
    buildChain({ data: null, error: new Error("DB connection failed") });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("DB connection failed");
  });

  it("returns 500 with message from PostgrestError (non-Error instance)", async () => {
    buildChain({
      data: null,
      error: {
        message: "relation not found",
        code: "PGRST116",
        details: null,
        hint: null,
      },
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("relation not found");
  });

  it("returns 500 when supabase.from throws synchronously", async () => {
    (supabase.from as Mock).mockImplementation(() => {
      throw new Error("Client not initialized");
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Client not initialized");
  });

  it("returns 500 with 'Unknown error' when catch receives a non-Error value", async () => {
    const nonError: unknown = "string error";
    (supabase.from as Mock).mockImplementation(() => {
      throw nonError;
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Unknown error");
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("returns valid JSON content-type header", async () => {
    buildChain({ data: [], error: null });

    const res = await GET();

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
