import { NextRequest, NextResponse } from "next/server";

const CORS_ALLOW_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type, Authorization";

function resolveAllowedOrigin(
  origin: string | null,
  allowedOrigins: readonly string[],
): string | null {
  if (origin !== null && allowedOrigins.includes(origin)) {
    return origin;
  }
  return null;
}

export function proxy(request: NextRequest): NextResponse {
  const allowedOrigins: readonly string[] = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = request.headers.get("origin");
  const allowedOrigin = resolveAllowedOrigin(origin, allowedOrigins);

  if (request.method === "OPTIONS") {
    const headers = new Headers();
    if (allowedOrigin !== null) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
      headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
      headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
      headers.set("Vary", "Origin");
    }
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  if (allowedOrigin !== null) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
    response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
