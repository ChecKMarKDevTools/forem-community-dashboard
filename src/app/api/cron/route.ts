import { NextResponse } from "next/server";
import { ForemClient } from "@/lib/forem";
import { syncArticles } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const articles = await ForemClient.getLatestArticles(1, 100);
    const result = await syncArticles(articles);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Cron sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
