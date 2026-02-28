import { NextResponse } from "next/server";
import { ForemArticle, ForemClient } from "@/lib/forem";
import { syncArticles } from "@/lib/sync";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 3;
const PER_PAGE = 100;
// Safety cap: Forem articles are ranked, not strictly date-ordered, so we
// can't stop on the first old article. We stop when an entire page falls
// outside the cutoff window (no matches), or when we hit MAX_PAGES.
const MAX_PAGES = 100;
const DAYS_RANGE_ERROR = `days must be an integer between 1 and ${MAX_DAYS}`;

/**
 * Parses and validates the `days` parameter from the request body.
 * Returns the validated integer, or a NextResponse error to return immediately.
 */
async function parseDaysFromBody(
  request: Request,
): Promise<number | NextResponse> {
  const text = await request.text();
  if (!text) return DEFAULT_DAYS;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body === null || typeof body !== "object" || !("days" in body)) {
    return DEFAULT_DAYS;
  }

  const rawDays = (body as Record<string, unknown>).days;
  if (rawDays === undefined) return DEFAULT_DAYS;

  // Guard against Object#toString producing "[object Object]" in Number().
  if (typeof rawDays !== "string" && typeof rawDays !== "number") {
    return NextResponse.json({ error: DAYS_RANGE_ERROR }, { status: 400 });
  }

  // Use Number() so that float strings like "7.5" produce 7.5 (not 7 via
  // parseInt truncation), then Number.isInteger() rejects them as non-integer.
  const numericDays =
    typeof rawDays === "number" ? rawDays : Number(rawDays.trim());
  if (
    Number.isNaN(numericDays) ||
    !Number.isInteger(numericDays) ||
    numericDays < 1 ||
    numericDays > MAX_DAYS
  ) {
    return NextResponse.json({ error: DAYS_RANGE_ERROR }, { status: 400 });
  }

  return numericDays;
}

/**
 * Fetches all Forem articles published within the last `days` days,
 * paginating until no more pages exist or the entire page is outside the window.
 */
async function collectArticlesInWindow(days: number): Promise<ForemArticle[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const collected: ForemArticle[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const articles = await ForemClient.getLatestArticles(page, PER_PAGE);
    if (articles.length === 0) break;

    const withinWindow = articles.filter(
      (a) => new Date(a.published_at) >= cutoff,
    );
    collected.push(...withinWindow);

    // Full page with zero matches — far enough back that we won't find more
    if (withinWindow.length === 0) break;

    // Partial page — no further pages exist
    if (articles.length < PER_PAGE) break;
  }

  return collected;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysOrError = await parseDaysFromBody(request);
  if (daysOrError instanceof NextResponse) return daysOrError;

  try {
    const collected = await collectArticlesInWindow(daysOrError);
    const result = await syncArticles(collected);
    return NextResponse.json({
      success: true,
      collected: collected.length,
      ...result,
      days: daysOrError,
    });
  } catch (error: unknown) {
    console.error("Seed sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
