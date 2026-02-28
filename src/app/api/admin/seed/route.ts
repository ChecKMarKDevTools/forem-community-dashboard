import { NextResponse } from "next/server";
import { ForemArticle, ForemClient } from "@/lib/forem";
import { syncArticles } from "@/lib/sync";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 3;
const PER_PAGE = 30;

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse optional days parameter from JSON body.
  // No body → use default. Invalid JSON → 400. Invalid days value → 400.
  let days = DEFAULT_DAYS;
  const text = await request.text();
  if (text) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (body !== null && typeof body === "object" && "days" in body) {
      const rawDays = (body as Record<string, unknown>).days;
      if (rawDays !== undefined) {
        const parsed = Number.parseInt(String(rawDays), 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_DAYS) {
          return NextResponse.json(
            { error: `days must be an integer between 1 and ${MAX_DAYS}` },
            { status: 400 },
          );
        }
        days = parsed;
      }
    }
  }

  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const collected: ForemArticle[] = [];
    let page = 1;
    let done = false;

    while (!done) {
      const articles = await ForemClient.getLatestArticles(page, PER_PAGE);
      if (articles.length === 0) break;

      for (const article of articles) {
        if (new Date(article.published_at) < cutoff) {
          done = true;
          break;
        }
        collected.push(article);
      }

      // Forem returned a partial page — no more pages exist
      if (articles.length < PER_PAGE) break;
      page++;
    }

    await syncArticles(collected);
    return NextResponse.json({ success: true, count: collected.length, days });
  } catch (error: unknown) {
    console.error("Seed sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
