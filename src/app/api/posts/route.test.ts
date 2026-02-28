import { GET } from "./route";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Builds the full Supabase query chain mock for this route:
// supabase.from("articles").select(...).order(...).limit(...)
function buildChain(resolvedValue: { data: unknown; error: unknown }) {
  const mockSelect = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
  (supabase.from as Mock).mockReturnValue({
    select: mockSelect,
    order: mockOrder,
    limit: mockLimit,
  });
  return { mockSelect, mockOrder, mockLimit };
}

describe("GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Positive ──────────────────────────────────────────────────────────────

  it("returns 200 with the list of posts on success", async () => {
    const mockData = [
      { id: "1", title: "Alpha", score: 100, attention_level: "high" },
      { id: "2", title: "Beta", score: 50, attention_level: "medium" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockData);
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
      "id, title, author, score, attention_level, canonical_url, published_at, reactions, comments, explanations",
    );
  });

  it("orders by score descending", async () => {
    const { mockOrder } = buildChain({ data: [], error: null });

    await GET();

    expect(mockOrder).toHaveBeenCalledWith("score", { ascending: false });
  });

  it("limits results to 100", async () => {
    const { mockLimit } = buildChain({ data: [], error: null });

    await GET();

    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it("returns 200 with empty array when no articles exist", async () => {
    buildChain({ data: [], error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("returns 200 with null data as-is (Supabase passthrough)", async () => {
    // Supabase may return null data without an error on an empty table in some drivers
    buildChain({ data: null, error: null });

    const res = await GET();

    expect(res.status).toBe(200);
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
    // Real Supabase PostgrestError has message, code, details, hint fields
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

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("returns 200 with a single article", async () => {
    const mockData = [
      { id: "42", title: "Only Post", score: 99, attention_level: "low" },
    ];
    buildChain({ data: mockData, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("42");
  });

  it("returns valid JSON content-type header", async () => {
    buildChain({ data: [], error: null });

    const res = await GET();

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
