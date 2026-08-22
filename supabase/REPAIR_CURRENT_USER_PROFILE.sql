-- One-time repair for the current test account after Auth registration succeeds.
-- Run after 005_profiles_bootstrap_and_rls.sql.

WITH target_user AS (
  SELECT id
  FROM auth.users
  WHERE email = '2118645938@qq.com'
  LIMIT 1
)
INSERT INTO public.profiles (
  id,
  ai_credits,
  last_checkin_date,
  consecutive_days,
  is_pro,
  trial_started_at,
  pro_expires_at
)
SELECT
  id,
  0,
  NULL,
  0,
  true,
  NOW(),
  NOW() + INTERVAL '60 days'
FROM target_user
ON CONFLICT (id) DO UPDATE
SET ai_credits = COALESCE(public.profiles.ai_credits, 0),
    last_checkin_date = public.profiles.last_checkin_date,
    consecutive_days = COALESCE(public.profiles.consecutive_days, 0),
    is_pro = true,
    trial_started_at = COALESCE(public.profiles.trial_started_at, NOW()),
    pro_expires_at = CASE
      WHEN public.profiles.pro_expires_at IS NULL OR public.profiles.pro_expires_at < NOW()
        THEN NOW() + INTERVAL '60 days'
      ELSE public.profiles.pro_expires_at
    END;
