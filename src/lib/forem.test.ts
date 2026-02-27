import { ForemClient } from "./forem";
import { vi, type Mock } from "vitest";

describe("ForemClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches latest articles", async () => {
    const mockResponse = [{ id: 1, title: "Test" }];
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getLatestArticles(1, 10);
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://dev.to/api/articles?per_page=10&page=1",
      expect.any(Object),
    );
  });

  it("handles API errors", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
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
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getUserByUsername("test");
    expect(result).toEqual(mockResponse);
  });

  it("handles user not found (404)", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await ForemClient.getUserByUsername("not-found");
    expect(result).toBeNull();
  });

  it("fetches a single article", async () => {
    const mockResponse = { id: 1, title: "Single Test" };
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getArticle(1);
    expect(result).toEqual(mockResponse);
  });

  it("handles article fetch errors", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false });
    await expect(ForemClient.getArticle(1)).rejects.toThrow(
      "Failed to fetch article 1",
    );
  });

  it("fetches comments for an article", async () => {
    const mockResponse = [{ id_code: "abc" }];
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await ForemClient.getComments(1);
    expect(result).toEqual(mockResponse);
  });

  it("handles comments fetch errors", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false });
    await expect(ForemClient.getComments(1)).rejects.toThrow(
      "Failed to fetch comments for article 1",
    );
  });
});
