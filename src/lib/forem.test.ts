import { ForemClient, foremQueue } from "./forem";
import { vi, type Mock } from "vitest";

describe("ForemClient", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    foremQueue.reset();
  });

  it("fetches latest articles", async () => {
    const mockResponse = [{ id: 1, title: "Test" }];
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getLatestArticles(1, 10);
    expect(result).toEqual(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://dev.to/api/articles?per_page=10&page=1",
      expect.any(Object),
    );
  });

  it("handles API errors", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(ForemClient.getLatestArticles(1)).rejects.toThrow(
      "Failed to fetch articles",
    );
  });

  it("fetches user info by username", async () => {
    const mockResponse = { id: 1, username: "test" };
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getUserByUsername("test2");
    expect(result).toEqual(mockResponse);
  });

  it("handles user not found (404)", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await ForemClient.getUserByUsername("not-found-2");
    expect(result).toBeNull();
  });

  it("fetches a single article", async () => {
    const mockResponse = { id: 1, title: "Single Test" };
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getArticle(1);
    expect(result).toEqual(mockResponse);
  });

  it("handles article fetch errors", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await expect(ForemClient.getArticle(1, false)).rejects.toThrow(
      "Failed to fetch article 1",
    );
  });

  it("fetches comments for an article", async () => {
    const mockResponse = [{ id_code: "abc" }];
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getComments(1);
    expect(result).toEqual(mockResponse);
  });

  it("handles comments fetch errors", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await expect(ForemClient.getComments(1, false)).rejects.toThrow(
      "Failed to fetch comments for article 1",
    );
  });
});

// ---------------------------------------------------------------------------
// Cache expiration
// ---------------------------------------------------------------------------

describe("ForemClient — cache expiration", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    foremQueue.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    foremQueue.reset();
    vi.useRealTimers();
  });

  it("returns cached user on second call within TTL", async () => {
    const mockResponse = { id: 1, username: "cached_user" };
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // First call — populates cache
    await ForemClient.getUserByUsername("cached_user");
    // Second call — should use cache, not fetch
    await ForemClient.getUserByUsername("cached_user");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches after cache TTL expires (5 minutes)", async () => {
    vi.useFakeTimers();

    const mockResponse = { id: 1, username: "expiring_user" };
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // First call populates cache
    await ForemClient.getUserByUsername("expiring_user");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance past 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Second call should re-fetch because cache expired
    await ForemClient.getUserByUsername("expiring_user");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// API key header injection
// ---------------------------------------------------------------------------

describe("ForemClient — API key header", () => {
  let savedApiKey: string | undefined;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    savedApiKey = process.env.FOREM_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
    foremQueue.reset();
    if (savedApiKey === undefined) {
      delete process.env.FOREM_API_KEY;
    } else {
      process.env.FOREM_API_KEY = savedApiKey;
    }
  });

  it("sends api-key header when FOREM_API_KEY is set", async () => {
    process.env.FOREM_API_KEY = "my-secret-key";
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await ForemClient.getLatestArticles(1, 10);

    const [, callInit] = (globalThis.fetch as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((callInit.headers as Record<string, string>)["api-key"]).toBe(
      "my-secret-key",
    );
  });

  it("omits api-key header when FOREM_API_KEY is not set", async () => {
    delete process.env.FOREM_API_KEY;
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await ForemClient.getLatestArticles(1, 10);

    const [, callInit] = (globalThis.fetch as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = (callInit?.headers ?? {}) as Record<string, string>;
    expect(headers["api-key"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rate-limit retry (429 → exponential backoff)
// ---------------------------------------------------------------------------

/** Helper: mock headers object that returns null for Retry-After. */
function noRetryAfterHeaders() {
  return { get: () => null };
}

describe("ForemClient — 429 retry", () => {
  // Fake timers prevent real delays from slowing the suite.
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    foremQueue.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    foremQueue.reset();
    vi.useRealTimers();
  });

  it("retries once on 429 and returns the successful second response", async () => {
    const mockData = [{ id: 1, title: "Test" }];
    (globalThis.fetch as Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: noRetryAfterHeaders(),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => mockData });

    const promise = ForemClient.getLatestArticles(1, 10);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff: second retry waits twice as long as the first", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;

    // Spy on setTimeout to capture delay values before fake timers fire.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (cb: () => void, delay?: number) => {
        delays.push(delay ?? 0);
        return realSetTimeout(cb, 0); // fire immediately for test speed
      },
    );

    const mockData: unknown[] = [];
    (globalThis.fetch as Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: noRetryAfterHeaders(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: noRetryAfterHeaders(),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => mockData });

    const promise = ForemClient.getLatestArticles(1, 10);
    await vi.runAllTimersAsync();
    await promise;

    expect(delays).toHaveLength(2);
    // Second delay should be 2× the first (exponential base-2 backoff).
    expect(delays[1]).toBe(delays[0] * 2);
  });

  it("honours the Retry-After response header over exponential backoff", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (cb: () => void, delay?: number) => {
        delays.push(delay ?? 0);
        return realSetTimeout(cb, 0);
      },
    );

    (globalThis.fetch as Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (k: string) => (k === "retry-after" ? "5" : null) },
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const promise = ForemClient.getLatestArticles(1, 10);
    await vi.runAllTimersAsync();
    await promise;

    // 5 seconds from Retry-After header → 5000 ms delay
    expect(delays[0]).toBe(5000);
  });

  it("throws after exhausting all retries (MAX_RETRIES = 3)", async () => {
    (globalThis.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 429,
      headers: noRetryAfterHeaders(),
    });

    // Run timers and assert the rejection in parallel so the rejection handler
    // is attached before fake timers fire (avoids PromiseRejectionHandledWarning
    // and satisfies vitest/valid-expect).
    await Promise.all([
      expect(ForemClient.getLatestArticles(1, 10)).rejects.toThrow(
        "Failed to fetch articles",
      ),
      vi.runAllTimersAsync(),
    ]);

    // 1 initial attempt + 3 retries = 4 total fetch calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry on non-429 errors (e.g. 500)", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    // No setTimeout is scheduled (500 is not retried), so we can await directly.
    await expect(ForemClient.getComments(999)).rejects.toThrow(
      "Failed to fetch comments for article 999",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry 404 for getUserByUsername — returns null immediately", async () => {
    (globalThis.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await ForemClient.getUserByUsername("ghost2");
    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
