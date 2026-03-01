/**
 * OpenAI integration for LLM-powered sentiment analysis.
 *
 * Sends a batch of comments (with the parent post body for context) to the
 * OpenAI Responses API and receives per-comment sentiment scores plus an
 * overall volatility metric.
 *
 * Design:
 *  - Model cascade: gpt-5-mini → gpt-5 → null (graceful fallback to keywords)
 *  - Missing OPENAI_API_KEY returns null immediately (no throw)
 *  - Token budget: ~2 000 chars post body + ~2 000 chars comments ≈ 1 000 tokens
 *  - Out-of-range values are clamped with a warning, not rejected
 */

export interface LLMSentimentResponse {
  readonly comments: ReadonlyArray<{
    readonly index: number;
    readonly score: number;
  }>;
  readonly volatility: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POST_CHAR_LIMIT = 2000;
const COMMENT_CHAR_LIMIT = 500;
const TOTAL_COMMENT_CHAR_LIMIT = 2000;

const PRIMARY_MODEL = "gpt-5-mini";
const FALLBACK_MODEL = "gpt-5";

const SYSTEM_PROMPT = `TASK: Sentiment analysis of blog post comments.
INPUT: A blog post body followed by numbered comments.
OUTPUT: JSON matching the provided schema.
RULES:
- For each comment, assign a sentiment score: -1.0 (strongly negative) to 1.0 (strongly positive).
- Score reflects the comment's tone in context of the blog post topic.
- Compute overall volatility: 0.0 (all comments have similar tone) to 1.0 (extreme variation in tone across comments).
- Neutral/informational comments score near 0.0.
- Do not explain. Output only valid JSON.`;

const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  name: "sentiment_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      comments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            score: { type: "number" },
          },
          required: ["index", "score"],
          additionalProperties: false,
        },
      },
      volatility: { type: "number" },
    },
    required: ["comments", "volatility"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Truncate post body and format comments within the token budget. */
export function truncateForTokenBudget(
  postBody: string,
  commentTexts: ReadonlyArray<string>,
): { truncatedPost: string; truncatedComments: string } {
  const truncatedPost = postBody.slice(0, POST_CHAR_LIMIT);

  let cumulative = 0;
  const lines: string[] = [];
  for (let i = 0; i < commentTexts.length; i++) {
    const text = commentTexts[i].slice(0, COMMENT_CHAR_LIMIT);
    if (cumulative + text.length > TOTAL_COMMENT_CHAR_LIMIT) break;
    cumulative += text.length;
    lines.push(`Comment ${i}: ${text}`);
  }

  return { truncatedPost, truncatedComments: lines.join("\n") };
}

/** Clamp a numeric value to [min, max], logging a warning if out of range. */
function clamp(value: number, min: number, max: number, label: string): number {
  if (value < min || value > max) {
    console.warn(
      `OpenAI sentiment: ${label} value ${value} out of range [${min}, ${max}], clamping`,
    );
  }
  return Math.min(max, Math.max(min, value));
}

/** Parse and validate the LLM JSON response. */
function parseResponse(
  json: unknown,
  expectedCount: number,
): LLMSentimentResponse | null {
  if (
    typeof json !== "object" ||
    json === null ||
    !("comments" in json) ||
    !("volatility" in json)
  ) {
    return null;
  }

  const raw = json as {
    comments: Array<{ index: number; score: number }>;
    volatility: number;
  };

  if (!Array.isArray(raw.comments) || typeof raw.volatility !== "number") {
    return null;
  }

  const comments = raw.comments
    .filter(
      (c): c is { index: number; score: number } =>
        typeof c.index === "number" && typeof c.score === "number",
    )
    .slice(0, expectedCount)
    .map((c) => ({
      index: c.index,
      score: clamp(c.score, -1, 1, `comment[${c.index}].score`),
    }));

  const volatility = clamp(raw.volatility, 0, 1, "volatility");

  return { comments, volatility };
}

/** Call the OpenAI Responses API with structured output. */
async function callOpenAI(
  userMessage: string,
  model: string,
  apiKey: string,
): Promise<LLMSentimentResponse | null> {
  const response = await globalThis.fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input: userMessage,
        text: {
          format: RESPONSE_SCHEMA,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    output?: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>;
  };

  // Extract the text content from the response
  const textContent = body.output
    ?.find((item) => item.type === "message")
    ?.content?.find((c) => c.type === "output_text")?.text;

  if (!textContent) {
    throw new Error("OpenAI response missing text content");
  }

  return JSON.parse(textContent) as LLMSentimentResponse;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze sentiment for a batch of comments using the OpenAI LLM.
 *
 * Returns per-comment scores and overall volatility, or `null` when:
 *  - OPENAI_API_KEY is not configured
 *  - Both model cascade attempts fail
 *  - The comment list is empty
 */
export async function analyzeSentimentBatch(
  postBody: string,
  commentTexts: ReadonlyArray<string>,
): Promise<LLMSentimentResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (commentTexts.length === 0) return null;

  const { truncatedPost, truncatedComments } = truncateForTokenBudget(
    postBody,
    commentTexts,
  );

  const userMessage = `POST BODY:\n${truncatedPost}\n\nCOMMENTS:\n${truncatedComments}`;

  // Model cascade: try primary, then fallback
  try {
    const result = await callOpenAI(userMessage, PRIMARY_MODEL, apiKey);
    return result ? parseResponse(result, commentTexts.length) : null;
  } catch {
    // Primary model failed — try fallback
  }

  try {
    const result = await callOpenAI(userMessage, FALLBACK_MODEL, apiKey);
    return result ? parseResponse(result, commentTexts.length) : null;
  } catch {
    // Both models failed — return null for keyword fallback
    return null;
  }
}
