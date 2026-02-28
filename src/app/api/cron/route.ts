import { NextResponse } from "next/server";
import { syncArticles } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncArticles(5);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Cron sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
