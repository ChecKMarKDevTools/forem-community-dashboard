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

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost:3000/api/cron", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

function makeArticle(id = 1) {
  return {
    id,
    title: "Test Article",
    published_at: "2024-01-01T10:00:00Z",
    public_reactions_count: 5,
    comments_count: 2,
    tag_list: ["javascript"],
    canonical_url: "https://dev.to/test",
    user: { username: "testuser" },
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
    (syncArticles as Mock).mockResolvedValue({
      synced: 0,
      failed: 0,
      errors: [],
    });
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
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("passes authentication with correct Bearer token", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  // ── Delegation ────────────────────────────────────────────────────────────

  describe("delegation to syncArticles", () => {
    it("fetches articles with page 1 and perPage 100", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(1, 100);
    });

    it("passes all fetched articles to syncArticles", async () => {
      const articles = [makeArticle(1), makeArticle(2)];
      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);

      await POST(makeRequest(`Bearer ${VALID_SECRET}`));

      expect(syncArticles).toHaveBeenCalledWith(articles);
    });

    it("returns { success, synced, failed, errors } from syncArticles result", async () => {
      const articles = [makeArticle(1), makeArticle(2), makeArticle(3)];
      (ForemClient.getLatestArticles as Mock).mockResolvedValue(articles);
      (syncArticles as Mock).mockResolvedValue({
        synced: 3,
        failed: 0,
        errors: [],
      });

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true, synced: 3, failed: 0, errors: [] });
    });

    it("passes empty array to syncArticles when no articles returned", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([]);
      (syncArticles as Mock).mockResolvedValue({
        synced: 0,
        failed: 0,
        errors: [],
      });

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.synced).toBe(0);
      expect(syncArticles).toHaveBeenCalledWith([]);
    });
  });

  // ── Error flows ───────────────────────────────────────────────────────────

  describe("error flows", () => {
    it("returns 500 when getLatestArticles throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue(
        new Error("Forem API down"),
      );

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Forem API down");
    });

    it("returns 500 when syncArticles throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockResolvedValue([
        makeArticle(),
      ]);
      (syncArticles as Mock).mockRejectedValue(new Error("Sync failed"));

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Sync failed");
    });

    it("returns 500 with 'Unknown error' for non-Error throws", async () => {
      (ForemClient.getLatestArticles as Mock).mockRejectedValue("string error");

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Unknown error");
    });
  });
});
