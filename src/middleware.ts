import { type NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * Next.js edge middleware — applied to all /api/* requests.
 *
 * Handles CORS preflight (OPTIONS) and injects Access-Control-Allow-Origin on
 * non-preflight responses. Allowed origins are read from the ALLOWED_ORIGINS
 * environment variable (comma-separated). The deploy.sh script sets this to
 * the Cloud Run service URL and any CUSTOM_DOMAIN at deploy time.
 *
 * See src/proxy.ts for the implementation.
 */
export function middleware(request: NextRequest) {
  return proxy(request);
}

export { config } from "@/proxy";
