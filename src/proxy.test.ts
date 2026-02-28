import { NextRequest, NextResponse } from "next/server";
import { proxy } from "./proxy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, origin?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (origin !== undefined) {
    headers["origin"] = origin;
  }
  return new NextRequest("http://localhost:3000/api/posts", {
    method,
    headers,
  });
}

const ALLOWED_ORIGIN_1 = "https://dev-signal.checkmarkdevtools.dev";
const ALLOWED_ORIGIN_2 =
  "https://forem-community-dashboard-abc123-ue.a.run.app";
const DISALLOWED_ORIGIN = "https://evil.example.com";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("proxy (CORS)", () => {
  let savedAllowedOrigins: string | undefined;

  beforeEach(() => {
    savedAllowedOrigins = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = `${ALLOWED_ORIGIN_1},${ALLOWED_ORIGIN_2}`;
  });

  afterEach(() => {
    if (savedAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = savedAllowedOrigins;
    }
  });

  // ── Preflight (OPTIONS) ──────────────────────────────────────────────────

  describe("OPTIONS preflight", () => {
    it("returns 204 with CORS headers for an allowed origin", () => {
      const req = makeRequest("OPTIONS", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_1,
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, OPTIONS",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type, Authorization",
      );
      expect(res.headers.get("Vary")).toBe("Origin");
    });

    it("returns 204 without CORS headers for a disallowed origin", () => {
      const req = makeRequest("OPTIONS", DISALLOWED_ORIGIN);
      const res = proxy(req);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Vary")).toBeNull();
    });

    it("returns 204 without CORS headers when no Origin header is present", () => {
      const req = makeRequest("OPTIONS");
      const res = proxy(req);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("allows a second configured origin", () => {
      const req = makeRequest("OPTIONS", ALLOWED_ORIGIN_2);
      const res = proxy(req);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_2,
      );
    });
  });

  // ── Non-preflight requests ───────────────────────────────────────────────

  describe("GET / POST requests", () => {
    it("passes request through with CORS headers for an allowed origin", () => {
      const req = makeRequest("GET", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_1,
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, OPTIONS",
      );
      expect(res.headers.get("Vary")).toBe("Origin");
    });

    it("passes request through without CORS headers for a disallowed origin", () => {
      const req = makeRequest("GET", DISALLOWED_ORIGIN);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("passes request through without CORS headers when no Origin is present", () => {
      const req = makeRequest("GET");
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("reflects the correct specific origin (not wildcard)", () => {
      const req = makeRequest("POST", ALLOWED_ORIGIN_2);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_2,
      );
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("trims whitespace from ALLOWED_ORIGINS entries", () => {
      process.env.ALLOWED_ORIGINS = `  ${ALLOWED_ORIGIN_1}  ,  ${ALLOWED_ORIGIN_2}  `;
      const req = makeRequest("GET", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_1,
      );
    });

    it("ignores empty entries in ALLOWED_ORIGINS", () => {
      process.env.ALLOWED_ORIGINS = `${ALLOWED_ORIGIN_1},,${ALLOWED_ORIGIN_2}`;
      const req = makeRequest("GET", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        ALLOWED_ORIGIN_1,
      );
    });

    it("returns no CORS headers when ALLOWED_ORIGINS is empty string", () => {
      process.env.ALLOWED_ORIGINS = "";
      const req = makeRequest("GET", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns no CORS headers when ALLOWED_ORIGINS is unset", () => {
      delete process.env.ALLOWED_ORIGINS;
      const req = makeRequest("GET", ALLOWED_ORIGIN_1);
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not allow partial-match origins (must be exact)", () => {
      const req = makeRequest(
        "GET",
        "https://evil-dev-signal.checkmarkdevtools.dev",
      );
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("is case-sensitive for origin matching", () => {
      const req = makeRequest("GET", ALLOWED_ORIGIN_1.toUpperCase());
      const res = proxy(req);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns NextResponse from OPTIONS even when no origins are configured", () => {
      process.env.ALLOWED_ORIGINS = "";
      const req = makeRequest("OPTIONS");
      const res = proxy(req);

      expect(res).toBeInstanceOf(NextResponse);
      expect(res.status).toBe(204);
    });
  });
});
