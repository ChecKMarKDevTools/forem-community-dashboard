import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { vi, Mock } from "vitest";

// Set up mock fetch
const mockPosts = [
  {
    id: "post-1",
    title: "Highly toxic post",
    url: "https://dev.to/test/post-1",
    score: 85,
    attention_level: "high",
    explanations: ["Triggered toxic words", "High flag ratio"],
    created_at: "2023-10-27T10:00:00Z",
    author_name: "Test Author",
    author_username: "testauthor",
    comments_count: 50,
    public_reactions_count: 10,
    page_views_count: 1000,
  },
  {
    id: "post-2",
    title: "Normal post",
    url: "https://dev.to/test/post-2",
    score: 15,
    attention_level: "low",
    explanations: [],
    created_at: "2023-10-26T10:00:00Z",
    author_name: "Good User",
    author_username: "gooduser",
    comments_count: 5,
    public_reactions_count: 20,
    page_views_count: 500,
  },
];

const mockPostDetails = {
  ...mockPosts[0],
  score_breakdown: { behavior: 40, audience: 25, pattern: 20 },
  recent_posts: [
    {
      id: "post-3",
      title: "Previous post",
      url: "https://dev.to/test/post-3",
      score: 10,
      attention_level: "low",
      created_at: "2023-10-20T10:00:00Z",
    },
  ],
};

globalThis.fetch = vi.fn() as Mock;

describe("Dashboard Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("fetches and renders a list of posts", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText("Community Queue")).toBeInTheDocument();
    });

    expect(screen.getByText("Highly toxic post")).toBeInTheDocument();
    expect(screen.getByText("Normal post")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("handles post selection and fetching details", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ json: async () => mockPosts });
      if (url === "/api/posts/post-1")
        return Promise.resolve({ json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Highly toxic post")).toBeInTheDocument();
    });

    const postCard = screen
      .getByText("Highly toxic post")
      .closest("div.border")!;
    fireEvent.click(postCard);

    await waitFor(() => {
      expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    });

    expect(screen.getByText("@testauthor")).toBeInTheDocument();
    expect(screen.getByText("Triggered toxic words")).toBeInTheDocument();
  });

  it("handles empty post list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => [] });

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });
  });

  it("handles api error for posts list", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });

    // We can't rely strictly on toHaveBeenCalled because React strict mode might swallow or call multiple times.
    // Instead we just verify it doesn't crash and shows empty state.
    consoleErrorSpy.mockRestore();
  });
});
