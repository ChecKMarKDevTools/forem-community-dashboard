/**
 * OpenAI integration for LLM-powered interaction quality analysis.
 *
 * Sends a batch of comments (with the parent post body for context) to the
 * OpenAI Responses API and receives per-comment interaction scores plus
 * overall volatility and topic extraction.
 *
 * Design:
 *  - Model cascade: gpt-5-nano → gpt-5-mini → null (graceful fallback to heuristic)
 *  - Missing OPENAI_API_KEY returns null immediately (no throw)
 *  - Token budget: ~2 000 chars post body + ~2 000 chars comments ≈ 1 000 tokens
 *  - Out-of-range values are clamped with a warning, not rejected
 */

/** Per-comment interaction scores from LLM analysis. */
export interface LLMCommentScore {
  readonly index: number;
  /** Tone: -1.0 (strongly negative) to 1.0 (strongly positive). */
  readonly tone: number;
  /** Relevance: 0.0 (off-topic) to 1.0 (directly on-topic). */
  readonly relevance: number;
  /** Depth: 0.0 (surface-level) to 1.0 (substantive/technical). */
  readonly depth: number;
  /** Constructiveness: 0.0 (noise) to 1.0 (advances the conversation). */
  readonly constructiveness: number;
}

export interface LLMConversationResponse {
  readonly comments: ReadonlyArray<LLMCommentScore>;
  readonly volatility: number;
  readonly topic_tags: ReadonlyArray<string>;
  /** True when the post body contains signals of emotional distress, burnout, or help-seeking. */
  readonly needs_support: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// gpt-5-nano supports ~272K input tokens (~1.1M chars); gpt-5-mini supports ~400K.
// These limits are intentionally conservative to keep per-sync costs predictable
// while still covering a full typical thread (≈ 20–25 comments at 500 chars each).
const POST_CHAR_LIMIT = 4000;
const COMMENT_CHAR_LIMIT = 500;
const TOTAL_COMMENT_CHAR_LIMIT = 12000;

const PRIMARY_MODEL = "gpt-5-nano";
const FALLBACK_MODEL = "gpt-5-mini";

const SYSTEM_PROMPT = `TASK: Interaction signal analysis of blog post comments.
INPUT: A blog post body followed by numbered comments.
OUTPUT: JSON matching the provided schema.
RULES:
- Extract 1-3 topic keywords from the post body as topic_tags.
- For each comment, assign interaction scores:
  - tone: -1.0 (strongly negative) to 1.0 (strongly positive). Reflects the comment's emotional tone in context.
  - relevance: 0.0 (completely off-topic) to 1.0 (directly addresses the post's topic).
  - depth: 0.0 (surface-level reaction like "great post!") to 1.0 (substantive technical or thoughtful content).
  - constructiveness: 0.0 (adds nothing to the conversation) to 1.0 (meaningfully advances the discussion).
- Compute overall volatility: 0.0 (all comments have similar tone) to 1.0 (extreme variation in tone across comments).
- Set needs_support to true if the post body contains signals of emotional distress, mental health struggle, burnout, isolation, or explicit help-seeking. Only flag genuine distress — not routine technical questions or casual frustration.
- Never infer beyond available text. Score only what is present.
- Do not explain. Output only valid structured JSON.`;

const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  name: "conversation_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      topic_tags: {
        type: "array",
        items: { type: "string" },
      },
      comments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            tone: { type: "number" },
            relevance: { type: "number" },
            depth: { type: "number" },
            constructiveness: { type: "number" },
          },
          required: ["index", "tone", "relevance", "depth", "constructiveness"],
          additionalProperties: false,
        },
      },
      volatility: { type: "number" },
      needs_support: { type: "boolean" },
    },
    required: ["topic_tags", "comments", "volatility", "needs_support"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Truncate post body and format comments within the token budget.
 * The budget accounts for the `Comment N: ` prefix and `\n` separators so
 * that the final joined string stays within TOTAL_COMMENT_CHAR_LIMIT. */
export function truncateForTokenBudget(
  postBody: string,
  commentTexts: ReadonlyArray<string>,
): { truncatedPost: string; truncatedComments: string } {
  const truncatedPost = postBody.slice(0, POST_CHAR_LIMIT);

  let cumulative = 0;
  const lines: string[] = [];
  for (let i = 0; i < commentTexts.length; i++) {
    const text = commentTexts[i].slice(0, COMMENT_CHAR_LIMIT);
    const prefix = `Comment ${i}: `;
    // +1 for the "\n" separator between lines (not added before the first line)
    const overhead = prefix.length + (lines.length > 0 ? 1 : 0);
    if (cumulative + overhead + text.length > TOTAL_COMMENT_CHAR_LIMIT) break;
    cumulative += overhead + text.length;
    lines.push(`${prefix}${text}`);
  }

  return { truncatedPost, truncatedComments: lines.join("\n") };
}

/** Clamp a numeric value to [min, max], logging a warning if out of range. */
function clamp(value: number, min: number, max: number, label: string): number {
  if (value < min || value > max) {
    console.warn(
      `OpenAI analysis: ${label} value ${value} out of range [${min}, ${max}], clamping`,
    );
  }
  return Math.min(max, Math.max(min, value));
}

/** Parse and validate the LLM JSON response. */
function parseResponse(
  json: unknown,
  expectedCount: number,
): LLMConversationResponse | null {
  if (
    typeof json !== "object" ||
    json === null ||
    !("comments" in json) ||
    !("volatility" in json) ||
    !("topic_tags" in json)
  ) {
    return null;
  }

  const raw = json as {
    comments: Array<{
      index: number;
      tone: number;
      relevance: number;
      depth: number;
      constructiveness: number;
    }>;
    volatility: number;
    topic_tags: string[];
    needs_support: unknown;
  };

  if (
    !Array.isArray(raw.comments) ||
    typeof raw.volatility !== "number" ||
    !Array.isArray(raw.topic_tags)
  ) {
    return null;
  }

  // Build a Map keyed by index to guarantee a stable index→comment mapping:
  // duplicate indices are rejected (first occurrence wins) and out-of-range
  // indices are dropped, so downstream code can rely on index === array position.
  const byIndex = new Map<
    number,
    { tone: number; relevance: number; depth: number; constructiveness: number }
  >();
  for (const c of raw.comments) {
    if (
      typeof c.index === "number" &&
      Number.isInteger(c.index) &&
      c.index >= 0 &&
      c.index < expectedCount &&
      !byIndex.has(c.index) &&
      typeof c.tone === "number" &&
      typeof c.relevance === "number" &&
      typeof c.depth === "number" &&
      typeof c.constructiveness === "number"
    ) {
      byIndex.set(c.index, {
        tone: clamp(c.tone, -1, 1, `comment[${c.index}].tone`),
        relevance: clamp(c.relevance, 0, 1, `comment[${c.index}].relevance`),
        depth: clamp(c.depth, 0, 1, `comment[${c.index}].depth`),
        constructiveness: clamp(
          c.constructiveness,
          0,
          1,
          `comment[${c.index}].constructiveness`,
        ),
      });
    }
  }
  const comments: LLMCommentScore[] = [];
  for (let idx = 0; idx < expectedCount; idx++) {
    const scored = byIndex.get(idx);
    if (scored) {
      comments.push({ index: idx, ...scored });
    }
  }

  const volatility = clamp(raw.volatility, 0, 1, "volatility");
  const topic_tags = raw.topic_tags
    .filter((t): t is string => typeof t === "string")
    .slice(0, 3);
  const needs_support =
    typeof raw.needs_support === "boolean" ? raw.needs_support : false;

  return { comments, volatility, topic_tags, needs_support };
}

/** Call the OpenAI Responses API with structured output. */
async function callOpenAI(
  userMessage: string,
  model: string,
  apiKey: string,
): Promise<LLMConversationResponse | null> {
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

  return JSON.parse(textContent) as LLMConversationResponse;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze interaction quality for a batch of comments using the OpenAI LLM.
 *
 * Returns per-comment interaction scores, volatility, and topic tags,
 * or `null` when:
 *  - OPENAI_API_KEY is not configured
 *  - Both model cascade attempts fail
 *  - The comment list is empty
 */
export async function analyzeConversation(
  postBody: string,
  commentTexts: ReadonlyArray<string>,
): Promise<LLMConversationResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (commentTexts.length === 0) return null;

  const { truncatedPost, truncatedComments } = truncateForTokenBudget(
    postBody,
    commentTexts,
  );

  const userMessage = `POST BODY:\n${truncatedPost}\n\nCOMMENTS:\n${truncatedComments}`;

  // Model cascade: try primary (nano), then fallback (mini)
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
    // Both models failed — return null for heuristic fallback
    return null;
  }
}
