ALTER TABLE articles ADD COLUMN IF NOT EXISTS dev_url TEXT;
UPDATE articles SET dev_url = canonical_url WHERE dev_url IS NULL;
