-- Merchant-selected rider connections. Riders must accept while signed in to
-- their own verified account before a connection becomes active.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NULL
     OR to_regclass('public.rider_status') IS NULL THEN
    RAISE EXCEPTION 'Merchant and rider onboarding migrations are required first.'
      USING HINT = 'Run MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql first.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_rider_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
  rider_phone TEXT NOT NULL CHECK (rider_phone ~ '^[17][0-9]{8}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (application_id, rider_phone),
  CHECK (status <> 'accepted' OR accepted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS merchant_rider_invites_phone_status_idx
  ON public.merchant_rider_invites (rider_phone, status, created_at DESC);

ALTER TABLE public.merchant_rider_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_rider_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_rider_invites TO service_role;

COMMIT;
