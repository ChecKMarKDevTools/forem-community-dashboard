import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client === null) {
    // Server-side only; SUPABASE_SECRET_KEY bypasses RLS for backend sync.
    // Deferred so Next.js module collection during build does not fail when
    // env vars are absent — createClient is only called at request time.
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});
