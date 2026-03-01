import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns true when both required Supabase env vars are present.
 * Use this in API routes to return graceful empty responses (200 + [])
 * rather than 500s when the server starts without credentials — e.g. during
 * Lighthouse CI runs or local development without a .env.local file.
 */
export function isConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  );
}

function getClient(): SupabaseClient {
  // Server-side only; SUPABASE_SECRET_KEY bypasses RLS for backend sync.
  // Deferred so Next.js module collection during build does not fail when
  // env vars are absent — createClient is only called at request time.
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing required Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set",
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});
