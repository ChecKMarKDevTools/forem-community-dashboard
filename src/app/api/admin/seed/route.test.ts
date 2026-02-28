import { POST } from "./route";
import { ForemClient } from "@/lib/forem";
import { syncArticles } from "@/lib/sync";
import { vi, type Mock } from "vitest";

vi.mock("@/lib/forem", () => ({
  ForemClient: {
    getLatestArticles: vi.fn(),
  },
}));

vi.mock("@/lib/sync", () => ({
  syncArticles: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SECRET = "test-cron-secret";

function makeRequest(authHeader: string | undefined, body?: unknown): Request {
  const init: RequestInit = { method: "POST" };
  const headers: Record<string, string> = {};
  if (authHeader) headers["authorization"] = authHeader;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  init.headers = headers;
  return new Request("http://localhost:3000/api/admin/seed", init);
}

/** Build a Forem article with a published_at relative to now. */
function makeArticle(id: number, daysAgo: number, username = "author") {
  const published = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    id,
    title: `Article ${id}`,
    published_at: published.toISOString(),
    public_reactions_count: 1,
    comments_count: 0,
    tag_list: [],
    canonical_url: `https://dev.to/a${id}`,
    user: { username },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("POST /api/admin/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = VALID_SECRET;
    (syncArticles as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const res = await POST(makeRequest(undefined));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("Unauthorized");
    });

    it("returns 401 when Bearer token is wrong", async () => {
      const res = await POST(makeRequest("Bearer wrong-token"));
      expect(res.status).toBe(401);
    });

    it("returns 401 when header uses incorrect scheme (Basic)", async () => {
      const res = await POST(makeRequest(`Basic ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET env var is undefined", async () => {
      delete process.env.CRON_SECRET;
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("passes authentication with correct Bearer token", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  // ── Input validation ──────────────────────────────────────────────────────

  describe("input validation", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost:3000/api/admin/seed", {
        method: "POST",
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
          "content-type": "application/json",
        },
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid JSON body");
    });

    it("returns 400 when days is 0", async () => {
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 0 }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(
        /days must be an integer between 1 and 90/,
      );
    });

    it("returns 400 when days is negative", async () => {
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: -5 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when days exceeds 90", async () => {
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 91 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when days is a non-numeric string", async () => {
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: "fortnight" }),
      );
      expect(res.status).toBe(400);
    });

    it("accepts days at lower boundary (1)", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 1 }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).days).toBe(1);
    });

    it("accepts days at upper boundary (90)", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 90 }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).days).toBe(90);
    });

    it("uses default of 3 days when no body is sent", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.days).toBe(3);
    });

    it("uses default of 3 days when body has no days field", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { other: "field" }),
      );
      const json = await res.json();
      expect(json.days).toBe(3);
    });

    it("coerces string numeric days (e.g. '7') to integer", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: "7" }),
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.days).toBe(7);
    });
  });

  // ── Pagination logic ──────────────────────────────────────────────────────

  describe("pagination", () => {
    it("collects all articles within the day window from a single page", async () => {
      // 3 articles within 3 days, 1 older — expects 3 collected
      const articles = [
        makeArticle(1, 1),
        makeArticle(2, 2),
        makeArticle(3, 3),
        makeArticle(4, 4), // outside 3-day window
      ];
      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.count).toBe(3);
      expect(syncArticles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 2 }),
          expect.objectContaining({ id: 3 }),
        ]),
      );
    });

    it("stops pagination when a full page contains an article past the cutoff", async () => {
      // Page 1: 30 articles within window (full page → fetch page 2)
      const page1 = Array.from({ length: 30 }, (_, i) => makeArticle(i + 1, 1));
      // Page 2: first article is past cutoff
      const page2 = [makeArticle(31, 10)];

      (ForemClient.getLatestArticles as Mock)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(ForemClient.getLatestArticles).toHaveBeenCalledTimes(2);
      expect(json.count).toBe(30);
    });

    it("stops pagination when a partial page is returned (last page)", async () => {
      // Page 1: full page, all within window
      const page1 = Array.from({ length: 30 }, (_, i) => makeArticle(i + 1, 1));
      // Page 2: partial page (< 30 items)
      const page2 = [makeArticle(31, 1), makeArticle(32, 2)];

      (ForemClient.getLatestArticles as Mock)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 7 }),
      );
      const json = await res.json();

      expect(ForemClient.getLatestArticles).toHaveBeenCalledTimes(2);
      expect(json.count).toBe(32);
    });

    it("stops after page 1 when Forem returns empty first page", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.count).toBe(0);
      expect(ForemClient.getLatestArticles).toHaveBeenCalledTimes(1);
    });

    it("collects 0 articles when all articles on first page are outside the window", async () => {
      const articles = [makeArticle(1, 10), makeArticle(2, 15)];
      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(json.count).toBe(0);
      expect(syncArticles).toHaveBeenCalledWith([]);
    });

    it("fetches pages with PER_PAGE=30", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      await POST(makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }));
      expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(1, 30);
    });

    it("increments page number on subsequent fetches", async () => {
      const page1 = Array.from({ length: 30 }, (_, i) => makeArticle(i + 1, 1));
      const page2: never[] = [];

      (ForemClient.getLatestArticles as Mock)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }));

      expect(ForemClient.getLatestArticles).toHaveBeenNthCalledWith(1, 1, 30);
      expect(ForemClient.getLatestArticles).toHaveBeenNthCalledWith(2, 2, 30);
    });
  });

  // ── Success response ──────────────────────────────────────────────────────

  describe("success response", () => {
    it("returns { success, count, days } on success", async () => {
      const articles = [makeArticle(1, 1), makeArticle(2, 2)];
      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 7 }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true, count: 2, days: 7 });
    });
  });

  // ── Error flows ───────────────────────────────────────────────────────────

  describe("error flows", () => {
    it("returns 500 when getLatestArticles throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue(
        new Error("Forem API down"),
      );

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Forem API down");
    });

    it("returns 500 when syncArticles throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      (syncArticles as Mock).mockRejectedValue(new Error("Sync failed"));

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Sync failed");
    });

    it("returns 500 with 'Unknown error' for non-Error throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue("string error");

      const res = await POST(
        makeRequest(`Bearer ${VALID_SECRET}`, { days: 3 }),
      );
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Unknown error");
    });
  });
});
