-- Consent-gated first-party customer page journey visibility for authorized admins.
-- Apply after FINAL_ESTABLISHMENT_SQL.sql and SECURITY_HARDENING_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.customer_sessions') IS NULL
     OR to_regclass('public.analytics_events') IS NULL THEN
    RAISE EXCEPTION 'Live customer journeys require customer_sessions and analytics_events.'
      USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.customer_sessions
  ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analytics_consent_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customer_sessions_consented_last_seen_idx
  ON public.customer_sessions (last_seen_at DESC)
  WHERE analytics_consent = true;

COMMIT;
