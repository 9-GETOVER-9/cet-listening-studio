-- Ensure app profile rows exist and can be managed by the signed-in owner.
-- Run this in Supabase SQL Editor if Pro trial or check-in fails after login.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_credits INTEGER DEFAULT 0,
  last_checkin_date DATE,
  consecutive_days INTEGER DEFAULT 0,
  is_pro BOOLEAN DEFAULT false,
  pro_expires_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  active_session_id TEXT
);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS ai_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_checkin_date DATE,
ADD COLUMN IF NOT EXISTS consecutive_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS active_session_id TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_owner_select'
  ) THEN
    CREATE POLICY profiles_owner_select ON public.profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_owner_insert'
  ) THEN
    CREATE POLICY profiles_owner_insert ON public.profiles
      FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_owner_update'
  ) THEN
    CREATE POLICY profiles_owner_update ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- Backfill profile rows for existing Auth users that do not have one yet.
INSERT INTO public.profiles (id, created_at)
SELECT users.id, COALESCE(users.created_at, NOW())
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE profiles.id IS NULL
ON CONFLICT (id) DO NOTHING;
