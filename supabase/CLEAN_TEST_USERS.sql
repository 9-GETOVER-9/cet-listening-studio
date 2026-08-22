-- One-time cleanup for failed local registration tests.
-- Run only in Supabase SQL Editor, and only after checking the email list.

BEGIN;

WITH target_users AS (
  SELECT id
  FROM auth.users
  WHERE email IN (
    '2118645938@qq.co',
    '2118645938@qq.com'
  )
)
DELETE FROM public.card_states
WHERE user_id IN (SELECT id FROM target_users);

WITH target_users AS (
  SELECT id
  FROM auth.users
  WHERE email IN (
    '2118645938@qq.co',
    '2118645938@qq.com'
  )
)
DELETE FROM public.notebook_items_sync
WHERE user_id IN (SELECT id FROM target_users);

WITH target_users AS (
  SELECT id
  FROM auth.users
  WHERE email IN (
    '2118645938@qq.co',
    '2118645938@qq.com'
  )
)
UPDATE public.activation_codes
SET used = false,
    used_by = NULL,
    used_at = NULL
WHERE used_by IN (SELECT id FROM target_users);

WITH target_users AS (
  SELECT id
  FROM auth.users
  WHERE email IN (
    '2118645938@qq.co',
    '2118645938@qq.com'
  )
)
DELETE FROM public.profiles
WHERE id IN (SELECT id FROM target_users);

DELETE FROM auth.users
WHERE email IN (
  '2118645938@qq.co',
  '2118645938@qq.com'
);

COMMIT;
