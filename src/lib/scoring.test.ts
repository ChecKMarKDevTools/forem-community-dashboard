import { evaluatePriority } from "./scoring";
import { ForemArticle, ForemUser, ForemComment } from "./forem";

describe("Scoring Logic", () => {
  const mockArticle: Partial<ForemArticle> = {
    id: 1,
    title: "Hello world",
    public_reactions_count: 5,
    comments_count: 2,
    page_views_count: 100,
    tag_list: ["testing", "hello"],
    published_at: new Date().toISOString(),
    canonical_url: "https://dev.to/something",
  };

  const mockUser: Partial<ForemUser> = {
    joined_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
  };

  const mockComments: Partial<ForemComment>[] = [];
  const mockRecentPosts: Partial<ForemArticle>[] = [];

  it("evaluates normal post with score 0 baseline", () => {
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      mockUser as ForemUser,
      mockComments as ForemComment[],
      mockRecentPosts as ForemArticle[],
    );
    expect(result.behavior).toBe(0);
    expect(result.attention_level).toBe("low");
  });

  it("adds behavior score for new users", () => {
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      { ...mockUser, joined_at: new Date().toISOString() } as ForemUser,
      [],
      [],
    );
    expect(result.behavior).toBe(15);
    expect(result.explanations).toContain("Account age is less than 7 days");
  });

  it("adds behavior score for off-site canonical URL", () => {
    const result = evaluatePriority(
      { ...mockArticle, canonical_url: "https://example.com" } as ForemArticle,
      null,
      [],
      [],
    );
    expect(result.behavior).toBe(10);
    expect(result.explanations).toContain("Uses off-site canonical URL");
  });

  it("adds audience score for high reactions with 0 comments", () => {
    const result = evaluatePriority(
      { ...mockArticle, public_reactions_count: 25 } as ForemArticle,
      null,
      [],
      [],
    );
    expect(result.audience).toBe(15);
  });

  it("adds pattern score for repeated tags", () => {
    const recent = [{ id: 2, tag_list: ["testing", "hello"] }];
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      null,
      [],
      recent as unknown as ForemArticle[],
    );
    expect(result.pattern).toBe(15);
  });

  it("adds behavior score for high post frequency", () => {
    const publishedAt = Date.now();
    const recent = [
      {
        id: 2,
        published_at: new Date(publishedAt - 1000 * 60 * 60).toISOString(),
        tag_list: [],
      },
      {
        id: 3,
        published_at: new Date(publishedAt - 1000 * 60 * 120).toISOString(),
        tag_list: [],
      },
      {
        id: 4,
        published_at: new Date(publishedAt - 1000 * 60 * 180).toISOString(),
        tag_list: [],
      },
    ];
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      null,
      [],
      recent as unknown as ForemArticle[],
    );
    expect(result.behavior).toBe(9);
    expect(result.explanations).toContain(
      "High post frequency (more than 2 posts in 24 hours)",
    );
  });

  it("adds audience score for low unique comment participants", () => {
    const comments = [
      { user: { username: "user1" } },
      { user: { username: "user1" } },
      { user: { username: "user2" } },
      { user: { username: "user2" } },
    ];
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      null,
      comments as unknown as ForemComment[],
      [],
    );
    expect(result.audience).toBe(20);
    expect(result.explanations).toContain(
      "Low unique participants vs comment count",
    );
  });

  it("adds pattern score for uniform automated publish gaps", () => {
    const recent = [
      {
        id: 2,
        published_at: new Date("2024-01-01T10:00:00Z").toISOString(),
        tag_list: [],
      },
      {
        id: 3,
        published_at: new Date("2024-01-01T11:00:00Z").toISOString(),
        tag_list: [],
      },
      {
        id: 4,
        published_at: new Date("2024-01-01T12:00:00Z").toISOString(),
        tag_list: [],
      },
    ];
    const result = evaluatePriority(
      mockArticle as ForemArticle,
      null,
      [],
      recent as unknown as ForemArticle[],
    );
    expect(result.pattern).toBe(18);
    expect(result.explanations).toContain("Regular/automated publish timing");
  });

  it("evaluates medium attention level properly", () => {
    const resultMedium = evaluatePriority(
      mockArticle as ForemArticle,
      { ...mockUser, joined_at: new Date().toISOString() } as ForemUser,
      [
        { user: { username: "u1" } },
        { user: { username: "u1" } },
        { user: { username: "u2" } },
        { user: { username: "u2" } },
      ] as unknown as ForemComment[],
      [{ id: 2, tag_list: ["testing", "hello"] }] as unknown as ForemArticle[],
    );
    expect(resultMedium.total).toBe(50);
    expect(resultMedium.attention_level).toBe("medium");
  });
});
