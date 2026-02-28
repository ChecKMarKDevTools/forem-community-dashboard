-- RLS Policies
--
-- Service role (SUPABASE_SECRET_KEY) bypasses RLS automatically — no policies
-- needed for the server-side cron/API layer.
--
-- Anon role (publishable key) is restricted as follows:
--   articles   → SELECT only (Forem data is already public)
--   commenters → SELECT only (Forem data is already public)
--   users      → no access  (internal scoring/metadata, not for public consumption)

-- articles: read-only for anon
CREATE POLICY "articles_anon_select"
  ON articles
  FOR SELECT
  TO anon
  USING (true);

-- commenters: read-only for anon
CREATE POLICY "commenters_anon_select"
  ON commenters
  FOR SELECT
  TO anon
  USING (true);

-- users: no anon policy → deny-all by default (RLS enabled, no matching policy)
