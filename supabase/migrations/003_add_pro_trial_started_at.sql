-- Add a one-time marker for the 60-day Pro trial.
-- Existing profile rows are marked as already evaluated so returning users do
-- not receive an unintended new trial after this migration.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

UPDATE profiles
SET trial_started_at = COALESCE(created_at, NOW())
WHERE trial_started_at IS NULL;

