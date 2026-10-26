-- Run this in Supabase SQL Editor as a project administrator.
-- It creates 10 one-time codes by default and returns their values once.
-- Save the result privately; never commit generated codes to the repository.
WITH candidates AS (
  SELECT 'LIFE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 15)) AS code
  FROM generate_series(1, 10)
), inserted AS (
  INSERT INTO public.activation_codes (code, days, is_lifetime, used)
  SELECT code, 30, true, false
  FROM candidates
  ON CONFLICT (code) DO NOTHING
  RETURNING code
)
SELECT code FROM inserted ORDER BY code;
