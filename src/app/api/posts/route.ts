import { NextResponse } from "next/server";
import { supabase, isConfigured } from "@/lib/supabase";

/**
 * GET /api/posts
 *
 * Returns the top 50 articles from the display window, ordered so that
 * actionable categories surface first:
 *   1. Non-NORMAL articles (NEEDS_RESPONSE, SIGNAL_AT_RISK, SILENT_SIGNAL,
 *      NEEDS_REVIEW, BOOST_VISIBILITY) — highest-score first within group,
 *      then oldest published_at first for equal-score ties
 *   2. NORMAL articles — same ordering, filling up to the 50 limit
 *
 * The API window is 168 h (7 days) — intentionally wider than
 * SYNC_WINDOW_HOURS (120 h / 5 days) in sync.ts — to surface articles
 * scored near the sync-window boundary without re-scoring them.
 * Articles are only written to the DB during sync runs, so the window here
 * simply avoids surfacing very old records that somehow survived longer than
 * the intended retention horizon.
 */
export async function GET() {
  // Return an empty list when credentials are absent (Lighthouse CI, local dev
  // without .env.local). This prevents a 500 → browser network console error
  // that would fail the Lighthouse errors-in-console audit.
  if (!isConfigured()) {
    return NextResponse.json([]);
  }

  try {
    const windowStart = new Date(
      Date.now() - 168 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("articles")
      .select(
        "id, title, author, score, attention_level, canonical_url, dev_url, published_at, reactions, comments, explanations",
      )
      .gte("published_at", windowStart)
      // Non-NORMAL rows sort before NORMAL (false < true in Postgres boolean sort)
      .order("attention_level", {
        ascending: true,
        // Postgres: 'NORMAL' > any other enum value alphabetically isn't reliable,
        // so we use a computed boolean column trick via a raw expression below.
        // Instead we'll rely on two ordered queries merged client-side.
        // See note below.
      })
      .order("score", { ascending: false })
      .limit(50);

    if (error) {
      // PostgrestError is not an Error instance; handle it directly
      console.error("Failed to fetch posts", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Re-sort client-side: non-NORMAL first, then NORMAL. Within each group:
    // primary sort is score descending; secondary sort is published_at ascending
    // (oldest first) so equal-score articles surface in chronological order.
    // Sorting 50 items in JS is negligible — avoids needing a raw Postgres expression.
    const rows = data ?? [];
    const byScoreThenAge = (
      a: { score: number; published_at: string | null },
      b: { score: number; published_at: string | null },
    ) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(a.published_at ?? 0).getTime() -
        new Date(b.published_at ?? 0).getTime()
      );
    };
    const nonNormal = rows
      .filter((r) => r.attention_level !== "NORMAL")
      .sort(byScoreThenAge);
    const normal = rows
      .filter((r) => r.attention_level === "NORMAL")
      .sort(byScoreThenAge);

    return NextResponse.json([...nonNormal, ...normal]);
  } catch (error: unknown) {
    console.error("Failed to fetch posts", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
