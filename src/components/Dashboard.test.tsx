import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { vi, Mock } from "vitest";

// Set up mock fetch
const mockPosts = [
  {
    id: 1,
    title: "Needs review post",
    canonical_url: "https://dev.to/test/post-1",
    score: 85,
    attention_level: "NEEDS_REVIEW",
    explanations: ["Heat Score: 7.50", "Risk Score: 2"],
    published_at: "2023-10-27T10:00:00Z",
    author: "testauthor",
    reactions: 10,
    comments: 50,
  },
  {
    id: 2,
    title: "Normal post",
    canonical_url: "https://dev.to/test/post-2",
    score: 15,
    attention_level: "NORMAL",
    explanations: [],
    published_at: "2023-10-26T10:00:00Z",
    author: "gooduser",
    reactions: 20,
    comments: 5,
  },
];

const mockPostDetails = {
  ...mockPosts[0],
  dev_url: "https://dev.to/testauthor/post-1",
  recent_posts: [
    {
      id: 3,
      title: "Previous post",
      canonical_url: "https://dev.to/test/post-3",
      dev_url: "https://dev.to/testauthor/post-3",
      score: 10,
      attention_level: "NORMAL",
      published_at: "2023-10-20T10:00:00Z",
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

  it("fetches and renders a list of posts with category labels", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText("Community Queue")).toBeInTheDocument();
    });

    expect(screen.getByText("Needs review post")).toBeInTheDocument();
    expect(screen.getByText("Normal post")).toBeInTheDocument();
    // New category labels instead of old "HIGH"
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("handles post selection and fetching details", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    const postCard = screen
      .getByText("Needs review post")
      .closest("div.border")!;
    fireEvent.click(postCard);

    await waitFor(() => {
      expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    });

    // @testauthor now appears in both the list card and the detail panel
    expect(screen.getAllByText("@testauthor").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Heat Score: 7.50")).toBeInTheDocument();
  });

  it("displays BOOST_VISIBILITY category correctly", async () => {
    const boostPosts = [
      {
        id: 4,
        title: "Boost me",
        canonical_url: "https://dev.to/test/post-4",
        score: 30,
        attention_level: "BOOST_VISIBILITY",
        explanations: ["Attention Delta: 5.20"],
        published_at: "2023-10-27T10:00:00Z",
        author: "writer",
        reactions: 2,
        comments: 3,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => boostPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Boost")).toBeInTheDocument();
    });
  });

  it("displays NEEDS_RESPONSE category correctly", async () => {
    const responsePosts = [
      {
        id: 5,
        title: "Help needed",
        canonical_url: "https://dev.to/test/post-5",
        score: 20,
        attention_level: "NEEDS_RESPONSE",
        explanations: ["Support Score: 5"],
        published_at: "2023-10-27T10:00:00Z",
        author: "newbie",
        reactions: 0,
        comments: 0,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => responsePosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs Response")).toBeInTheDocument();
    });
  });

  it("displays POSSIBLY_LOW_QUALITY category correctly", async () => {
    const lowQPosts = [
      {
        id: 6,
        title: "Buy crypto now",
        canonical_url: "https://dev.to/test/post-6",
        score: 5,
        attention_level: "POSSIBLY_LOW_QUALITY",
        explanations: ["Risk Score: 8"],
        published_at: "2023-10-27T10:00:00Z",
        author: "spammer",
        reactions: 0,
        comments: 0,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => lowQPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Low Quality")).toBeInTheDocument();
    });
  });

  it("handles empty post list", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });
  });

  it("sorts posts by attention priority: NEEDS_RESPONSE > BOOST > NEEDS_REVIEW > LOW_QUALITY > NORMAL", async () => {
    const mixedPosts = [
      {
        ...mockPosts[1],
        id: 10,
        title: "Normal post",
        attention_level: "NORMAL",
        score: 100,
      },
      {
        ...mockPosts[0],
        id: 11,
        title: "Needs review",
        attention_level: "NEEDS_REVIEW",
        score: 50,
      },
      {
        ...mockPosts[0],
        id: 12,
        title: "Needs response",
        attention_level: "NEEDS_RESPONSE",
        score: 10,
      },
      {
        ...mockPosts[0],
        id: 13,
        title: "Boost post",
        attention_level: "BOOST_VISIBILITY",
        score: 30,
      },
      {
        ...mockPosts[0],
        id: 14,
        title: "Low quality",
        attention_level: "POSSIBLY_LOW_QUALITY",
        score: 5,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mixedPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs response")).toBeInTheDocument();
    });

    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual([
      "Needs response",
      "Boost post",
      "Needs review",
      "Low quality",
      "Normal post",
    ]);
  });

  it("displays computed word count and age from explanations and published_at", async () => {
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString();
    const detailWithMetrics = {
      ...mockPosts[0],
      published_at: threeHoursAgo,
      explanations: ["Word Count: 1200", "Heat Score: 5.00"],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithMetrics,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("~1200 Words")).toBeInTheDocument();
      expect(screen.getByText("3 Hours Old")).toBeInTheDocument();
    });
  });

  it("renders GitHub feedback link in header", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Community Queue")).toBeInTheDocument();
    });

    const feedbackLink = screen.getByText("Feedback").closest("a");
    expect(feedbackLink).toHaveAttribute(
      "href",
      "https://github.com/ChecKMarKDevTools/forem-community-dashboard/issues",
    );
    expect(feedbackLink).toHaveAttribute("target", "_blank");
    expect(feedbackLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("displays score narratives explaining each score in plain language", async () => {
    const detailWithScores = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 7.50",
        "Risk Score: 2 (freq: 0, promo: 1, engage: -1)",
        "Support Score: 0",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithScores,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    });

    // Heat 7.5 >= 5 triggers elevated narrative
    expect(
      screen.getByText(
        "Elevated activity — comments are arriving faster than typical.",
      ),
    ).toBeInTheDocument();
    // Risk 2 >= 1 triggers minor flags narrative
    expect(
      screen.getByText("Minor flags present but likely not concerning."),
    ).toBeInTheDocument();
    // Support 0 triggers established narrative
    expect(
      screen.getByText("Author seems established with normal engagement."),
    ).toBeInTheDocument();
  });

  it("parses scores from explanations when no score_breakdown column exists", async () => {
    const detailFromExplanations = {
      ...mockPosts[0],
      explanations: [
        "Word Count: 500",
        "Heat Score: 12.00",
        "Risk Score: 5 (freq: 2, promo: 1, engage: -0)",
        "Support Score: 4",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailFromExplanations,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      // Parsed values appear as "X pts"
      expect(screen.getByText("12 pts")).toBeInTheDocument();
      expect(screen.getByText("5 pts")).toBeInTheDocument();
      expect(screen.getByText("4 pts")).toBeInTheDocument();
    });

    // High heat narrative
    expect(
      screen.getByText(
        "Very active discussion with rapid comments and mixed sentiment.",
      ),
    ).toBeInTheDocument();
    // High risk narrative
    expect(
      screen.getByText(
        "Some risk flags raised — short content or promotional language.",
      ),
    ).toBeInTheDocument();
    // High support narrative
    expect(
      screen.getByText(
        "Author appears to need community help — new user with little engagement.",
      ),
    ).toBeInTheDocument();
  });

  it("renders Discussion Activity Signals section with tooltip hover text on help icons", async () => {
    const detailWithSignals = {
      ...mockPosts[0],
      explanations: [
        "Word Count: 800",
        "Unique Commenters: 5",
        "Heat Score: 3.00",
        "Risk Score: 0 (freq: 0, promo: 0, engage: -0)",
        "Support Score: 1",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithSignals,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      // Renamed section title
      expect(
        screen.getByText("Discussion Activity Signals"),
      ).toBeInTheDocument();
    });

    // Each known signal should have a help icon with tooltip text
    const helpIcons = document.querySelectorAll("[title]");
    const tooltipTexts = Array.from(helpIcons).map((el) =>
      el.getAttribute("title"),
    );

    expect(tooltipTexts).toContain(
      "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
    );
    expect(tooltipTexts).toContain(
      "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
    );
    expect(tooltipTexts).toContain(
      "Emotional intensity of replies; disagreement and passion raise it, calm discussion lowers it.",
    );
    expect(tooltipTexts).toContain(
      "Probability the thread breaks platform rules; zero means nothing looks unsafe, even if people disagree loudly.",
    );
    expect(tooltipTexts).toContain(
      "Signs of constructive interaction like helping, clarifying, or agreeing; higher means collaborative tone.",
    );
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

    consoleErrorSpy.mockRestore();
  });
});
