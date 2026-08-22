-- Fix Auth user deletion failures caused by public tables referencing auth.users.
-- Run this in Supabase SQL Editor before deleting test users from Auth > Users.

-- profiles.id should be the same UUID as auth.users.id. If a test auth user is
-- deleted, its app profile must be deleted too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_id_fkey;

    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Learning sync rows are user-owned data. They should disappear with the user.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'card_states'
  ) THEN
    ALTER TABLE public.card_states
      DROP CONSTRAINT IF EXISTS card_states_user_id_fkey;

    ALTER TABLE public.card_states
      ADD CONSTRAINT card_states_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notebook_items_sync'
  ) THEN
    ALTER TABLE public.notebook_items_sync
      DROP CONSTRAINT IF EXISTS notebook_items_sync_user_id_fkey;

    ALTER TABLE public.notebook_items_sync
      ADD CONSTRAINT notebook_items_sync_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Activation codes are audit/renewal records. Keep the code row, but clear the
-- user reference when a test user is deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activation_codes'
  ) THEN
    ALTER TABLE public.activation_codes
      DROP CONSTRAINT IF EXISTS activation_codes_used_by_fkey;

    ALTER TABLE public.activation_codes
      ADD CONSTRAINT activation_codes_used_by_fkey
      FOREIGN KEY (used_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
