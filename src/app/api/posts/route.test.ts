/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { supabase } from "@/lib/supabase";
import { vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("GET /api/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches posts successfully", async () => {
    const mockData = [{ id: "1", title: "Test Post", score: 100 }];
    const mockSelect = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi
      .fn()
      .mockResolvedValue({ data: mockData, error: null });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
      limit: mockLimit,
    });

    const req = new NextRequest("http://localhost:3000/api/posts");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith("articles");
  });

  it("handles database errors", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("DB Error") });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
      limit: mockLimit,
    });

    const req = new NextRequest("http://localhost:3000/api/posts");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("DB Error");
  });
});
