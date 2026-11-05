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

CREATE TABLE IF NOT EXISTS public.rider_onboarding_sessions (
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

CREATE INDEX IF NOT EXISTS rider_onboarding_sessions_phone_idx
  ON public.rider_onboarding_sessions (rider_phone, updated_at DESC);
CREATE INDEX IF NOT EXISTS rider_onboarding_sessions_expiry_idx
  ON public.rider_onboarding_sessions (expires_at);

ALTER TABLE public.rider_onboarding_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_onboarding_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_onboarding_sessions TO service_role;

COMMIT;
