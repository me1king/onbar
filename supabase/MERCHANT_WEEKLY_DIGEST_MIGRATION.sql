-- Consent-controlled merchant email digest preferences and idempotent delivery history.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.merchant_weekly_digest_preferences (
  application_id UUID PRIMARY KEY
    REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL
    CHECK (char_length(trim(recipient_email)) BETWEEN 3 AND 320),
  enabled BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR consented_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.merchant_weekly_digest_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error TEXT CHECK (error IS NULL OR char_length(error) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, week_start)
);

CREATE INDEX IF NOT EXISTS merchant_weekly_digest_pending_idx
  ON public.merchant_weekly_digest_preferences (enabled, updated_at);

ALTER TABLE public.merchant_weekly_digest_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_weekly_digest_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_weekly_digest_preferences,
  public.merchant_weekly_digest_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_weekly_digest_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.merchant_weekly_digest_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_merchant_weekly_digest(
  p_application_id UUID,
  p_week_start DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  delivery_id UUID;
BEGIN
  INSERT INTO public.merchant_weekly_digest_deliveries (
    application_id, week_start, status, attempt_count, last_attempt_at
  ) VALUES (
    p_application_id, p_week_start, 'sending', 1, now()
  )
  ON CONFLICT (application_id, week_start) DO UPDATE SET
    status = 'sending',
    attempt_count = merchant_weekly_digest_deliveries.attempt_count + 1,
    last_attempt_at = now(),
    error = NULL
  WHERE merchant_weekly_digest_deliveries.attempt_count < 3
    AND (
      merchant_weekly_digest_deliveries.status = 'failed'
        AND merchant_weekly_digest_deliveries.last_attempt_at < now() - INTERVAL '15 minutes'
      OR merchant_weekly_digest_deliveries.status = 'sending'
        AND merchant_weekly_digest_deliveries.last_attempt_at < now() - INTERVAL '10 minutes'
    )
  RETURNING id INTO delivery_id;

  RETURN delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_merchant_weekly_digest(UUID, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_weekly_digest(UUID, DATE)
  TO service_role;

COMMIT;
