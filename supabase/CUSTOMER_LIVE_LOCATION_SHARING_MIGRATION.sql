-- Short-lived, anonymous customer location shares for the live operations map.
-- No customer identity, checkout address, or analytics session is stored here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_live_location_shares (
  share_id UUID PRIMARY KEY,
  latitude NUMERIC(6, 3) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(7, 3) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
  area TEXT NOT NULL CHECK (char_length(area) BETWEEN 1 AND 100),
  activity TEXT NOT NULL CHECK (activity IN ('browsing', 'checkout', 'ordered')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > last_seen_at)
);

CREATE INDEX IF NOT EXISTS customer_live_location_shares_expiry_idx
  ON public.customer_live_location_shares (expires_at);
CREATE INDEX IF NOT EXISTS customer_live_location_shares_area_idx
  ON public.customer_live_location_shares (city, area, expires_at);

ALTER TABLE public.customer_live_location_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_live_location_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_live_location_shares TO service_role;

COMMIT;
