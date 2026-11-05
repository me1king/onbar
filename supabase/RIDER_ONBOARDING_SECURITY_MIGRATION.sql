-- Install after DISPATCH_MIGRATION.sql and ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql.
-- The public rider onboarding page submits verification through the server API;
-- rider_status remains inaccessible to browser roles.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.rider_status') IS NULL THEN
    RAISE EXCEPTION 'Rider onboarding requires public.rider_status.'
      USING HINT = 'Run supabase/DISPATCH_MIGRATION.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.rider_status
  ADD COLUMN IF NOT EXISTS id_number TEXT,
  ADD COLUMN IF NOT EXISTS license_number TEXT,
  ADD COLUMN IF NOT EXISTS plate_number TEXT,
  ADD COLUMN IF NOT EXISTS rider_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS rider_email TEXT,
  ADD COLUMN IF NOT EXISTS biometric_key JSONB;

REVOKE ALL ON public.rider_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_status TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rider-verifications',
  'rider-verifications',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png']::TEXT[];

DROP POLICY IF EXISTS rider_verifications_are_private ON storage.objects;
CREATE POLICY rider_verifications_are_private
  ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'rider-verifications')
  WITH CHECK (bucket_id <> 'rider-verifications');

COMMIT;
