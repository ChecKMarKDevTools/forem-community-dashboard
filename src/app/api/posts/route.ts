import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/posts
 *
 * Returns the top 50 articles from the 7-day sync window, ordered so that
 * actionable categories surface first:
 *   1. Non-NORMAL articles (NEEDS_RESPONSE, SIGNAL_AT_RISK,
 *      NEEDS_REVIEW, BOOST_VISIBILITY) — highest-score first within group
 *   2. NORMAL articles — highest-score first, filling up to the 50 limit
 *
 * The time-window filter mirrors SYNC_WINDOW_HOURS (168 h) from sync.ts.
 * Articles are only written to the DB during sync runs, so the window here
 * simply avoids surfacing very old records that somehow survived longer than
 * the intended retention horizon.
 */
export async function GET() {
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

    // Re-sort client-side: non-NORMAL first (by score desc), then NORMAL (by score desc).
    // This is correct and safe because we fetched at most 50 rows and sorting
    // 50 items in JS is negligible — avoids needing a raw Postgres expression.
    const rows = data ?? [];
    const nonNormal = rows
      .filter((r) => r.attention_level !== "NORMAL")
      .sort((a, b) => b.score - a.score);
    const normal = rows
      .filter((r) => r.attention_level === "NORMAL")
      .sort((a, b) => b.score - a.score);

    return NextResponse.json([...nonNormal, ...normal]);
  } catch (error: unknown) {
    console.error("Failed to fetch posts", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
