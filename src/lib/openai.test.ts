import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeConversation,
  truncateForTokenBudget,
  type LLMConversationResponse,
} from "./openai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful OpenAI Responses API body. */
function makeOpenAIResponse(data: LLMConversationResponse): object {
  return {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(data),
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("truncateForTokenBudget", () => {
  it("truncates post body to 2000 chars", () => {
    const longPost = "a".repeat(3000);
    const { truncatedPost } = truncateForTokenBudget(longPost, []);
    expect(truncatedPost.length).toBe(2000);
  });

  it("truncates individual comments to 500 chars", () => {
    const longComment = "b".repeat(1000);
    const { truncatedComments } = truncateForTokenBudget("post", [longComment]);
    // "Comment 0: " prefix = 11 chars + 500 chars body
    expect(truncatedComments).toBe(`Comment 0: ${"b".repeat(500)}`);
  });

  it("stops adding comments once cumulative chars exceed 2000", () => {
    // Each comment is 500 chars → 4 fit in 2000 budget, 5th should be excluded
    const comments = Array.from({ length: 6 }, () => "c".repeat(500));
    const { truncatedComments } = truncateForTokenBudget("post", comments);
    const lines = truncatedComments.split("\n");
    expect(lines.length).toBe(4);
  });

  it("handles empty comments array", () => {
    const { truncatedComments } = truncateForTokenBudget("post", []);
    expect(truncatedComments).toBe("");
  });
});

describe("analyzeConversation", () => {
  let savedApiKey: string | undefined;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-key";
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    if (savedApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedApiKey;
    }
    fetchSpy.mockRestore();
  });

  it("returns null when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await analyzeConversation("post body", ["comment 1"]);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for empty comments array without making API call", async () => {
    const result = await analyzeConversation("post body", []);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns parsed response from successful gpt-5-nano call", async () => {
    const llmData: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: 0.8,
          relevance: 0.9,
          depth: 0.7,
          constructiveness: 0.85,
        },
        {
          index: 1,
          tone: -0.3,
          relevance: 0.6,
          depth: 0.4,
          constructiveness: 0.3,
        },
      ],
      volatility: 0.6,
      topic_tags: ["testing", "vitest"],
      needs_support: false,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("post body", [
      "great stuff",
      "not so good",
    ]);

    expect(result).not.toBeNull();
    expect(result!.comments).toHaveLength(2);
    expect(result!.comments[0].tone).toBe(0.8);
    expect(result!.comments[0].relevance).toBe(0.9);
    expect(result!.comments[0].depth).toBe(0.7);
    expect(result!.comments[0].constructiveness).toBe(0.85);
    expect(result!.comments[1].tone).toBe(-0.3);
    expect(result!.comments[1].relevance).toBe(0.6);
    expect(result!.comments[1].depth).toBe(0.4);
    expect(result!.comments[1].constructiveness).toBe(0.3);
    expect(result!.volatility).toBe(0.6);
    expect(result!.topic_tags).toEqual(["testing", "vitest"]);
    expect(result!.needs_support).toBe(false);

    // Verify it called gpt-5-nano
    const callBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.model).toBe("gpt-5-nano");
  });

  it("falls back to gpt-5-mini when gpt-5-nano fails", async () => {
    const llmData: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: 0.5,
          relevance: 0.7,
          depth: 0.6,
          constructiveness: 0.8,
        },
      ],
      volatility: 0.2,
      topic_tags: ["fallback"],
      needs_support: false,
    };

    // First call (gpt-5-nano) fails
    fetchSpy.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );
    // Second call (gpt-5-mini) succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("post body", ["comment"]);

    expect(result).not.toBeNull();
    expect(result!.comments[0].tone).toBe(0.5);
    expect(result!.comments[0].relevance).toBe(0.7);
    expect(result!.comments[0].depth).toBe(0.6);
    expect(result!.comments[0].constructiveness).toBe(0.8);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify second call used gpt-5-mini
    const secondCallBody = JSON.parse(
      (fetchSpy.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody.model).toBe("gpt-5-mini");
  });

  it("returns null when both models fail", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await analyzeConversation("post body", ["comment"]);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("clamps out-of-range tone, relevance, depth, constructiveness, and volatility", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const llmData: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: 1.5,
          relevance: 1.3,
          depth: -0.2,
          constructiveness: 2.0,
        },
        {
          index: 1,
          tone: -2.0,
          relevance: -0.5,
          depth: 1.8,
          constructiveness: -1.0,
        },
      ],
      volatility: 1.3,
      topic_tags: ["clamping"],
      needs_support: false,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("post body", [
      "comment 1",
      "comment 2",
    ]);

    expect(result).not.toBeNull();
    // tone clamped to [-1, 1]
    expect(result!.comments[0].tone).toBe(1.0);
    expect(result!.comments[1].tone).toBe(-1.0);
    // relevance clamped to [0, 1]
    expect(result!.comments[0].relevance).toBe(1.0);
    expect(result!.comments[1].relevance).toBe(0.0);
    // depth clamped to [0, 1]
    expect(result!.comments[0].depth).toBe(0.0);
    expect(result!.comments[1].depth).toBe(1.0);
    // constructiveness clamped to [0, 1]
    expect(result!.comments[0].constructiveness).toBe(1.0);
    expect(result!.comments[1].constructiveness).toBe(0.0);
    // volatility clamped to [0, 1]
    expect(result!.volatility).toBe(1.0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("returns null for malformed JSON response", async () => {
    // Response with no output/content structure
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ output: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    // Fallback also returns malformed
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ output: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("post body", ["comment"]);

    expect(result).toBeNull();
  });

  it("sends correct Authorization header and request shape", async () => {
    const llmData: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: 0.0,
          relevance: 0.5,
          depth: 0.5,
          constructiveness: 0.5,
        },
      ],
      volatility: 0.0,
      topic_tags: ["neutral"],
      needs_support: false,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await analyzeConversation("my post", ["neutral comment"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init as RequestInit).method).toBe("POST");

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.instructions).toContain("Interaction signal analysis");
    expect(body.input).toContain("POST BODY:");
    expect(body.input).toContain("COMMENTS:");
    expect(body.text.format).toBeDefined();
  });

  it("handles network error on both attempts", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await analyzeConversation("post body", ["comment"]);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("parses needs_support: true from LLM response", async () => {
    const llmData: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: -0.5,
          relevance: 0.8,
          depth: 0.6,
          constructiveness: 0.4,
        },
      ],
      volatility: 0.3,
      topic_tags: ["burnout"],
      needs_support: true,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("I'm struggling with burnout", [
      "hang in there",
    ]);

    expect(result).not.toBeNull();
    expect(result!.needs_support).toBe(true);
  });

  it("defaults needs_support to false when LLM returns non-boolean", async () => {
    // Simulate LLM returning a non-boolean needs_support value
    const rawData = {
      comments: [
        {
          index: 0,
          tone: 0.5,
          relevance: 0.7,
          depth: 0.6,
          constructiveness: 0.8,
        },
      ],
      volatility: 0.2,
      topic_tags: ["test"],
      needs_support: "maybe", // string instead of boolean
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(rawData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeConversation("post body", ["comment"]);

    expect(result).not.toBeNull();
    expect(result!.needs_support).toBe(false);
  });
});
