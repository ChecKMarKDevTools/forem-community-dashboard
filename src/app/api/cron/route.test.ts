import { POST } from "./route";
import { syncArticles } from "@/lib/sync";
import { vi, type Mock } from "vitest";

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

const VALID_SECRET = "test-secret";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("POST /api/cron", () => {
  let savedCronSecret: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    savedCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    (syncArticles as Mock).mockResolvedValue({
      synced: 0,
      failed: 0,
      errors: [],
    });
  });

  afterEach(() => {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = savedCronSecret;
    }
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
      const res = await POST(makeRequest(`Basic ${VALID_SECRET} `));
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET env var is undefined", async () => {
      delete process.env.CRON_SECRET;
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(401);
    });

    it("passes authentication with correct Bearer token", async () => {
      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);
    });

    it("tolerates extra whitespace around the Bearer token", async () => {
      const res = await POST(makeRequest(`Bearer   ${VALID_SECRET}  `));
      expect(res.status).toBe(200);
    });

    it("handles case-insensitive Bearer prefix", async () => {
      const res = await POST(makeRequest(`bearer ${VALID_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  // ── Delegation ────────────────────────────────────────────────────────────

  describe("delegation to syncArticles", () => {
    it("calls syncArticles (with no arguments)", async () => {
      await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      expect(syncArticles).toHaveBeenCalledWith(5);
    });

    it("returns { success, synced, failed, errors } from syncArticles result", async () => {
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
  });

  // ── Error flows ───────────────────────────────────────────────────────────

  describe("error flows", () => {
    it("returns 500 when syncArticles throws", async () => {
      (syncArticles as Mock).mockRejectedValue(new Error("Sync failed"));

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Sync failed");
    });

    it("returns 500 with 'Unknown error' for non-Error throws", async () => {
      (syncArticles as Mock).mockRejectedValue("string error");

      const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("Unknown error");
    });
  });
});
