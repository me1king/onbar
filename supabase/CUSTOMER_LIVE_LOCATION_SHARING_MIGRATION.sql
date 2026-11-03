-- Short-lived, anonymous customer location shares for the live operations map.
-- No customer identity, checkout address, or analytics session is stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_live_location_shares (
  share_id UUID PRIMARY KEY,
  latitude NUMERIC(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  precision TEXT NOT NULL DEFAULT 'approximate',
  accuracy_m NUMERIC(8, 2),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
  area TEXT NOT NULL CHECK (char_length(area) BETWEEN 1 AND 100),
  activity TEXT NOT NULL CHECK (activity IN ('browsing', 'checkout', 'ordered')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > last_seen_at)
);

ALTER TABLE public.customer_live_location_shares
  ALTER COLUMN latitude TYPE NUMERIC(9, 6) USING latitude::NUMERIC(9, 6),
  ALTER COLUMN longitude TYPE NUMERIC(9, 6) USING longitude::NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS precision TEXT NOT NULL DEFAULT 'approximate',
  ADD COLUMN IF NOT EXISTS accuracy_m NUMERIC(8, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customer_live_location_shares'::regclass
      AND conname = 'customer_live_location_shares_precision_check'
  ) THEN
    ALTER TABLE public.customer_live_location_shares
      ADD CONSTRAINT customer_live_location_shares_precision_check
      CHECK (precision IN ('approximate', 'exact'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customer_live_location_shares'::regclass
      AND conname = 'customer_live_location_shares_accuracy_check'
  ) THEN
    ALTER TABLE public.customer_live_location_shares
      ADD CONSTRAINT customer_live_location_shares_accuracy_check
      CHECK (accuracy_m IS NULL OR accuracy_m > 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS customer_live_location_shares_expiry_idx
  ON public.customer_live_location_shares (expires_at);
CREATE INDEX IF NOT EXISTS customer_live_location_shares_area_idx
  ON public.customer_live_location_shares (city, area, expires_at);

ALTER TABLE public.customer_live_location_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_live_location_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_live_location_shares TO service_role;

COMMIT;
