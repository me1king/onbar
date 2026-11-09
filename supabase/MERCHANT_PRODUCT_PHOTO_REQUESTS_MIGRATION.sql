-- Merchant requests for missing or replacement photos on shared catalog products.
-- Photo requests are submitted by the server with the service role; no client
-- policies are added to this table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.photo_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('missing', 'replace')),
  note TEXT,
  submitted_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A previous draft schema keyed requests by vendor_id. Keep its existing rows
-- intact while new requests are scoped to the owning merchant application.
ALTER TABLE public.photo_requests
  ADD COLUMN IF NOT EXISTS application_id UUID
  REFERENCES public.merchant_applications(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'photo_requests'
      AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE public.photo_requests ALTER COLUMN vendor_id DROP NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS photo_requests_status_created_idx
  ON public.photo_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS photo_requests_one_pending_per_merchant_product_idx
  ON public.photo_requests (application_id, product_id)
  WHERE status = 'pending';

ALTER TABLE public.photo_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
