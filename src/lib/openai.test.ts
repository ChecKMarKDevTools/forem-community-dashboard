import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeSentimentBatch,
  truncateForTokenBudget,
  type LLMSentimentResponse,
} from "./openai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful OpenAI Responses API body. */
function makeOpenAIResponse(data: LLMSentimentResponse): object {
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

describe("analyzeSentimentBatch", () => {
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

    const result = await analyzeSentimentBatch("post body", ["comment 1"]);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for empty comments array without making API call", async () => {
    const result = await analyzeSentimentBatch("post body", []);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns parsed response from successful gpt-5-mini call", async () => {
    const llmData: LLMSentimentResponse = {
      comments: [
        { index: 0, score: 0.8 },
        { index: 1, score: -0.3 },
      ],
      volatility: 0.6,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeSentimentBatch("post body", [
      "great stuff",
      "not so good",
    ]);

    expect(result).not.toBeNull();
    expect(result!.comments).toHaveLength(2);
    expect(result!.comments[0].score).toBe(0.8);
    expect(result!.comments[1].score).toBe(-0.3);
    expect(result!.volatility).toBe(0.6);

    // Verify it called gpt-5-mini
    const callBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.model).toBe("gpt-5-mini");
  });

  it("falls back to gpt-5 when gpt-5-mini fails", async () => {
    const llmData: LLMSentimentResponse = {
      comments: [{ index: 0, score: 0.5 }],
      volatility: 0.2,
    };

    // First call (gpt-5-mini) fails
    fetchSpy.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );
    // Second call (gpt-5) succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeSentimentBatch("post body", ["comment"]);

    expect(result).not.toBeNull();
    expect(result!.comments[0].score).toBe(0.5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify second call used gpt-5
    const secondCallBody = JSON.parse(
      (fetchSpy.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody.model).toBe("gpt-5");
  });

  it("returns null when both models fail", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await analyzeSentimentBatch("post body", ["comment"]);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("clamps out-of-range scores without rejecting", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const llmData: LLMSentimentResponse = {
      comments: [
        { index: 0, score: 1.5 },
        { index: 1, score: -2.0 },
      ],
      volatility: 1.3,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await analyzeSentimentBatch("post body", [
      "comment 1",
      "comment 2",
    ]);

    expect(result).not.toBeNull();
    expect(result!.comments[0].score).toBe(1.0);
    expect(result!.comments[1].score).toBe(-1.0);
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

    const result = await analyzeSentimentBatch("post body", ["comment"]);

    expect(result).toBeNull();
  });

  it("sends correct Authorization header and request shape", async () => {
    const llmData: LLMSentimentResponse = {
      comments: [{ index: 0, score: 0.0 }],
      volatility: 0.0,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenAIResponse(llmData)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await analyzeSentimentBatch("my post", ["neutral comment"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init as RequestInit).method).toBe("POST");

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.instructions).toContain("Sentiment analysis");
    expect(body.input).toContain("POST BODY:");
    expect(body.input).toContain("COMMENTS:");
    expect(body.text.format).toBeDefined();
  });

  it("handles network error on both attempts", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await analyzeSentimentBatch("post body", ["comment"]);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
