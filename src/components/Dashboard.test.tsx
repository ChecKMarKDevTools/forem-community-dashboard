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

  it("fetches and renders a list of posts with new category labels", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText("Attention Queue")).toBeInTheDocument();
    });

    expect(screen.getByText("Needs review post")).toBeInTheDocument();
    expect(screen.getByText("Normal post")).toBeInTheDocument();
    // New analyst-briefing labels
    expect(screen.getByText("Active Discussion")).toBeInTheDocument();
    expect(screen.getByText("Routine Discussion")).toBeInTheDocument();
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
      expect(screen.getByText("Why This Surfaced")).toBeInTheDocument();
    });

    // @testauthor now appears in both the list card and the detail panel
    expect(screen.getAllByText("@testauthor").length).toBeGreaterThanOrEqual(2);
    // Heat 7.5 (Moderate) and Risk 2 (Moderate) both show qualitative labels
    const moderateLabels = screen.getAllByText("Moderate");
    expect(moderateLabels.length).toBeGreaterThanOrEqual(2);
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
      // Attention delta >= 5 triggers "Sudden Attention Spike" behavior description
      expect(screen.getByText("Sudden Attention Spike")).toBeInTheDocument();
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
      // support >= 3 triggers "New Author Awaiting Response"
      expect(
        screen.getByText("New Author Awaiting Response"),
      ).toBeInTheDocument();
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
      // risk >= 4 triggers "Risk Signals Detected"
      expect(screen.getByText("Risk Signals Detected")).toBeInTheDocument();
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
      expect(screen.getByText("Attention Queue")).toBeInTheDocument();
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
      expect(screen.getByText("Why This Surfaced")).toBeInTheDocument();
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

  it("parses scores from explanations and shows qualitative labels", async () => {
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
      // Qualitative labels instead of "X pts"
      // Heat 12 >= 10 = High, Risk 5 >= 4 = High, Support 4 >= 4 = High
      const highLabels = screen.getAllByText("High");
      expect(highLabels.length).toBe(3);
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

  it("renders Conversation Pattern Signals with tooltips, excluding scores shown in Why This Surfaced", async () => {
    const detailWithSignals = {
      ...mockPosts[0],
      explanations: [
        "Word Count: 800",
        "Unique Commenters: 5",
        "Effort: 30.01",
        "Attention Delta: 12.50",
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
      expect(
        screen.getByText("Conversation Pattern Signals"),
      ).toBeInTheDocument();
    });

    // Activity signals card should show only non-score signals (4 items)
    const tooltips = screen.getAllByRole("tooltip");
    const tooltipTexts = tooltips.map((el) => el.textContent);

    expect(tooltipTexts).toContain(
      "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
    );
    expect(tooltipTexts).toContain(
      "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
    );
    expect(tooltipTexts).toContain(
      "Rough estimate of how much thinking and replying participants put in; long thoughtful replies raise it, short reactions barely move it.",
    );
    expect(tooltipTexts).toContain(
      "Measures how quickly people started paying attention compared to normal; spikes mean the topic suddenly caught eyes.",
    );

    // Heat/Risk/Support should NOT appear in the signals card (they're in Why This Surfaced)
    expect(tooltipTexts).not.toContain(
      "Emotional intensity of replies; disagreement and passion raise it, calm discussion lowers it.",
    );

    // Qualitative labels should appear in Why This Surfaced
    const lowLabels = screen.getAllByText("Low");
    expect(lowLabels.length).toBeGreaterThanOrEqual(2);
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

  it("shows Suggested Action card in detail panel", async () => {
    const detailWithHighRisk = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 3.00",
        "Risk Score: 7 (freq: 3, promo: 2, engage: -0)",
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
          json: async () => detailWithHighRisk,
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
      expect(screen.getByText("Suggested Action")).toBeInTheDocument();
    });

    // Risk 7 >= 6 triggers highest risk suggestion
    expect(
      screen.getByText(
        "Review for potential policy violations — multiple risk signals are present.",
      ),
    ).toBeInTheDocument();
  });

  it("shows routine suggested action when no signals are elevated", async () => {
    const detailRoutine = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 2.00",
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
          json: async () => detailRoutine,
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
      expect(screen.getByText("Suggested Action")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No action needed. Routine community activity."),
    ).toBeInTheDocument();
  });

  it("renders Conversation Pattern Signals before Why This Surfaced in DOM order", async () => {
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

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Conversation Pattern Signals"),
      ).toBeInTheDocument();
    });

    const signals = screen.getByText("Conversation Pattern Signals");
    const surfaced = screen.getByText("Why This Surfaced");

    // Conversation Pattern Signals should appear before Why This Surfaced in DOM
    expect(
      signals.compareDocumentPosition(surfaced) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders badge on the right side of list cards after title", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    // The title should come before the badge in DOM order (badge on right)
    const title = screen.getByText("Needs review post");
    const badge = screen.getByText("Active Discussion");

    expect(
      title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows behavior description based on heat signals", async () => {
    const highHeatPosts = [
      {
        id: 7,
        title: "Hot discussion",
        canonical_url: "https://dev.to/test/post-7",
        score: 60,
        attention_level: "NEEDS_REVIEW",
        explanations: [
          "Heat Score: 12.00",
          "Risk Score: 1",
          "Support Score: 0",
        ],
        published_at: "2023-10-27T10:00:00Z",
        author: "hotauthor",
        reactions: 5,
        comments: 30,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => highHeatPosts });
    render(<Dashboard />);

    await waitFor(() => {
      // heat >= 10 triggers "Rapidly Growing Discussion"
      expect(
        screen.getByText("Rapidly Growing Discussion"),
      ).toBeInTheDocument();
    });
  });

  it("shows qualitative level on recent post badges instead of numeric score", async () => {
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

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Previous post")).toBeInTheDocument();
    });

    // Recent post with score 10 should show "Low" (< 20)
    // Check the recent posts section specifically
    const recentSection = screen.getByText("Recent Posts by Author");
    expect(recentSection).toBeInTheDocument();

    // Should NOT show "SCORE: 10" — numeric scores are gone
    expect(screen.queryByText("SCORE: 10")).not.toBeInTheDocument();
  });
});
