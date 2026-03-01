import { NextResponse } from "next/server";
import { supabase, isConfigured } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;

  // Trim first so that whitespace-only strings produce NaN, then use
  // Number() + isInteger() to reject floats like "1.5" and alpha-prefixed
  // strings like "1abc" that parseInt would silently truncate to 1.
  const trimmed = rawId.trim();
  const id = trimmed ? Number(trimmed) : Number.NaN;
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // No credentials → post cannot exist; treat as 404 (no console error logged).
  if (!isConfigured()) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  try {
    // Fetch the article
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", id)
      .single();

    if (articleError || !article) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Fetch recent posts by same author (include dev_url and canonical_url for linking)
    const { data: recentPosts, error: recentError } = await supabase
      .from("articles")
      .select(
        "id, title, published_at, score, attention_level, canonical_url, dev_url",
      )
      .eq("author", article.author)
      .neq("id", id)
      .order("published_at", { ascending: false })
      .limit(5);

    if (recentError) {
      // PostgrestError is not an Error instance; use .message directly
      console.error(`Failed to fetch post ${rawId}`, recentError);
      return NextResponse.json({ error: recentError.message }, { status: 500 });
    }

    // Flatten article fields with recent_posts so the Dashboard's PostDetails
    // type (which expects top-level fields + recent_posts) is satisfied.
    return NextResponse.json({
      ...article,
      recent_posts: recentPosts ?? [],
    });
  } catch (error: unknown) {
    console.error(`Unexpected error fetching post ${rawId}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
