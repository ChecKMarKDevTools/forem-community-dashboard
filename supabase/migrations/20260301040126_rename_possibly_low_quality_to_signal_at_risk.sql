-- Rename POSSIBLY_LOW_QUALITY attention level to SIGNAL_AT_RISK.
-- This is a data-only migration; the column type remains TEXT.
UPDATE articles
  SET attention_level = 'SIGNAL_AT_RISK'
  WHERE attention_level = 'POSSIBLY_LOW_QUALITY';
