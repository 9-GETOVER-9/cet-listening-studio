-- Lifetime invitation codes are single-use and may only be redeemed through
-- the authenticated activate-code Edge Function.
ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'renewal';

-- The old policy exposed every unused code to signed-in and anonymous clients.
-- All code checks and redemptions now stay on the server.
DROP POLICY IF EXISTS "Anyone can view unused codes for validation"
  ON public.activation_codes;
DROP POLICY IF EXISTS "Service role can update codes"
  ON public.activation_codes;
REVOKE ALL ON TABLE public.activation_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activation_codes TO service_role;

-- Membership columns must never be writable through the client-side profiles
-- API. Trusted database functions set this transaction-local flag before an
-- authorized trial or code redemption.
CREATE OR REPLACE FUNCTION public.guard_profile_membership_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  trusted_writer BOOLEAN :=
    coalesce(current_setting('app.allow_profile_membership_write', true) = 'on', false)
    OR coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false)
    OR session_user IN ('postgres', 'supabase_admin');
BEGIN
  IF NOT trusted_writer THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_pro IS DISTINCT FROM false
        OR NEW.pro_expires_at IS NOT NULL
        OR NEW.trial_started_at IS NOT NULL THEN
        RAISE EXCEPTION 'Membership fields are managed by the server';
      END IF;
    ELSIF NEW.is_pro IS DISTINCT FROM OLD.is_pro
      OR NEW.pro_expires_at IS DISTINCT FROM OLD.pro_expires_at
      OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
      RAISE EXCEPTION 'Membership fields are managed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_membership_write ON public.profiles;
CREATE TRIGGER guard_profile_membership_write
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_membership_write();

CREATE OR REPLACE FUNCTION public.start_registered_pro_trial()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_id UUID := auth.uid();
  profile public.profiles%ROWTYPE;
BEGIN
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM set_config('app.allow_profile_membership_write', 'on', true);
  UPDATE public.profiles AS profiles
  SET trial_started_at = clock_timestamp(),
      is_pro = true,
      pro_expires_at = CASE
        WHEN profiles.is_pro = true AND profiles.pro_expires_at IS NULL THEN NULL
        ELSE greatest(coalesce(profiles.pro_expires_at, clock_timestamp()), clock_timestamp()) + interval '60 days'
      END
  WHERE profiles.id = user_id
    AND profiles.trial_started_at IS NULL;

  SELECT * INTO profile
  FROM public.profiles AS profiles
  WHERE profiles.id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for authenticated user';
  END IF;

  RETURN jsonb_build_object(
    'is_pro', profile.is_pro,
    'pro_expires_at', profile.pro_expires_at,
    'trial_started_at', profile.trial_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_registered_pro_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_registered_pro_trial() TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_activation_code(
  p_code TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  redeemed public.activation_codes%ROWTYPE;
  updated_profile_id UUID;
  expires_at TIMESTAMPTZ;
BEGIN
  UPDATE public.activation_codes AS codes
  SET used = true,
      used_by = p_user_id,
      used_at = clock_timestamp()
  WHERE codes.code = upper(trim(p_code))
    AND codes.used = false
    AND (codes.expires_at IS NULL OR codes.expires_at > clock_timestamp())
  RETURNING codes.* INTO redeemed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '邀请码无效、已使用或已过期'
    );
  END IF;

  PERFORM set_config('app.allow_profile_membership_write', 'on', true);
  UPDATE public.profiles AS profiles
  SET is_pro = true,
      pro_expires_at = CASE
        WHEN redeemed.is_lifetime THEN NULL
        WHEN profiles.is_pro = true AND profiles.pro_expires_at IS NULL THEN NULL
        ELSE greatest(coalesce(profiles.pro_expires_at, clock_timestamp()), clock_timestamp())
          + make_interval(days => greatest(redeemed.days, 1))
      END
  WHERE profiles.id = p_user_id
  RETURNING profiles.id, profiles.pro_expires_at INTO updated_profile_id, expires_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for authenticated user';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lifetime', redeemed.is_lifetime,
    'days', CASE WHEN redeemed.is_lifetime THEN NULL ELSE greatest(redeemed.days, 1) END,
    'expiresAt', expires_at,
    'message', CASE WHEN redeemed.is_lifetime
      THEN '已激活终身 Pro 会员'
      ELSE format('成功激活 %s 天 Pro 会员', greatest(redeemed.days, 1))
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_activation_code(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(TEXT, UUID) TO service_role;
