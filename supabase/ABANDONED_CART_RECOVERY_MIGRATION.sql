-- Align saved-cart storage with checkout recovery and admin campaign fields.
BEGIN;

ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_channel TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS abandoned_carts_customer_email_updated_idx
  ON public.abandoned_carts (lower(customer_email), updated_at DESC)
  WHERE customer_email IS NOT NULL;

COMMIT;
