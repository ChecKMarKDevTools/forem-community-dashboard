import { NextRequest } from "next/server";
import { GET } from "./route";
import { supabase } from "@/lib/supabase";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("GET /api/posts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches single post and recent posts successfully", async () => {
    const mockPost = {
      id: 1,
      title: "Test",
      author: "user1",
      url: "https://example.com",
    };
    const mockRecent = [{ id: 2, title: "Recent" }];

    const mockSingle1 = vi
      .fn()
      .mockResolvedValue({ data: mockPost, error: null });
    const mockLimit2 = vi
      .fn()
      .mockResolvedValue({ data: mockRecent, error: null });

    (supabase.from as Mock).mockImplementation(() => {
      const mockChain: Record<string, Mock> = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        neq: vi.fn(() => mockChain),
        order: vi.fn(() => mockChain),
        single: mockSingle1,
        limit: mockLimit2,
      };

      return mockChain;
    });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    // Response is now flattened: article fields at top level + recent_posts
    expect(json.id).toBe(1);
    expect(json.title).toBe("Test");
    expect(json.recent_posts[0].id).toBe(2);
  });

  it("defaults recent_posts to empty array when recentPosts is null", async () => {
    const mockPost = { id: 1, title: "Test", author: "user1" };

    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: mockPost, error: null });
    const mockLimit = vi.fn().mockResolvedValue({ data: null, error: null });

    (supabase.from as Mock).mockImplementation(() => {
      const mockChain: Record<string, Mock> = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        neq: vi.fn(() => mockChain),
        order: vi.fn(() => mockChain),
        single: mockSingle,
        limit: mockLimit,
      };
      return mockChain;
    });

    const req = new NextRequest("http://localhost:3000/api/posts/1");
    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.recent_posts).toEqual([]);
  });

  it("handles invalid ID", async () => {
    const req = new NextRequest("http://localhost:3000/api/posts/not-found");
    const res = await GET(req, {
      params: Promise.resolve({ id: "not-found" }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid ID");
  });

  it("handles post not found", async () => {
    const mockChain: Record<string, Mock> = {
      select: vi.fn(() => mockChain),
      eq: vi.fn(() => mockChain),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as Mock).mockReturnValue(mockChain);

    const req = new NextRequest("http://localhost:3000/api/posts/999");
    const res = await GET(req, { params: Promise.resolve({ id: "999" }) });
    await res.json();

    expect(res.status).toBe(404);
  });

  it("handles server errors when fetching recent posts", async () => {
    const mockChain: Record<string, Mock> = {
      select: vi.fn(() => mockChain),
      eq: vi.fn(() => mockChain),
      neq: vi.fn(() => mockChain),
      order: vi.fn(() => mockChain),
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: 999, author: "test" }, error: null }),
      limit: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("Internal Error") }),
    };
    (supabase.from as Mock).mockReturnValue(mockChain);

    const req = new NextRequest("http://localhost:3000/api/posts/999");
    const res = await GET(req, { params: Promise.resolve({ id: "999" }) });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Internal Error");
  });
});
