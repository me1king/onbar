-- Store rider contact email addresses for approval and onboarding communications.
-- Run after DISPATCH_MIGRATION.sql on an existing Supabase project.

DO $$
BEGIN
  IF to_regclass('public.rider_status') IS NULL THEN
    RAISE EXCEPTION 'Rider email communications require public.rider_status.'
      USING HINT = 'Run supabase/DISPATCH_MIGRATION.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.rider_status
  ADD COLUMN IF NOT EXISTS rider_email TEXT;
