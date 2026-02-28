import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select(
        "id, title, author, score, attention_level, canonical_url, published_at, reactions, comments, explanations",
      )
      .order("score", { ascending: false })
      .limit(100);

    if (error) {
      // PostgrestError is not an Error instance; handle it directly
      console.error("Failed to fetch posts", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Failed to fetch posts", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
