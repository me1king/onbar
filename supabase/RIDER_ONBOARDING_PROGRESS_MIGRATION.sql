-- Private, resumable rider onboarding progress.
-- Run after DISPATCH_MIGRATION.sql and RIDER_ONBOARDING_SECURITY_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.rider_status') IS NULL THEN
    RAISE EXCEPTION 'Rider onboarding requires public.rider_status.'
      USING HINT = 'Run supabase/DISPATCH_MIGRATION.sql first.';
  END IF;
END;
$$;

-- Use a separate table from the legacy rider_onboarding_sessions table,
-- whose phone-primary-key/FK schema is not suitable for pre-application drafts.
CREATE TABLE IF NOT EXISTS public.rider_onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_phone TEXT NOT NULL CHECK (rider_phone ~ '^[17][0-9]{8}$'),
  session_token_hash TEXT NOT NULL UNIQUE CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
  current_step TEXT NOT NULL CHECK (current_step IN (
    'phone', 'identity', 'vehicle', 'verification', 'agreement', 'biometrics', 'pending', 'success'
  )),
  form_data JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(form_data) = 'object' AND octet_length(form_data::TEXT) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS rider_onboarding_progress_phone_idx
  ON public.rider_onboarding_progress (rider_phone, updated_at DESC);
CREATE INDEX IF NOT EXISTS rider_onboarding_progress_expiry_idx
  ON public.rider_onboarding_progress (expires_at);

ALTER TABLE public.rider_onboarding_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_onboarding_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_onboarding_progress TO service_role;

COMMIT;
