-- Merchants submit photo-backed stock and payout-price offers for admin review.
-- Apply after MIDNIGHT_MARKET_FOUNDATION.sql and MERCHANT_MASTER_CATALOG_MIGRATION.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mm_merchant_stock_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  photo_path TEXT NOT NULL UNIQUE,
  offered_quantity INTEGER NOT NULL CHECK (offered_quantity BETWEEN 1 AND 1000000),
  offered_merchant_price NUMERIC(12, 2) NOT NULL CHECK (offered_merchant_price > 0),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending_review' AND reviewed_at IS NULL AND reviewed_by_email IS NULL)
    OR (status <> 'pending_review' AND reviewed_at IS NOT NULL AND reviewed_by_email IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS mm_merchant_stock_offers_review_idx
  ON public.mm_merchant_stock_offers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_merchant_stock_offers_merchant_idx
  ON public.mm_merchant_stock_offers (merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_merchant_stock_offer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.mm_merchant_stock_offers(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'approved', 'rejected')),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_merchant_stock_offer_events_offer_idx
  ON public.mm_merchant_stock_offer_events (offer_id, created_at);

ALTER TABLE public.mm_merchant_stock_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_merchant_stock_offer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mm_merchant_stock_offers, public.mm_merchant_stock_offer_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mm_merchant_stock_offers TO service_role;
GRANT SELECT, INSERT ON TABLE public.mm_merchant_stock_offer_events TO service_role;

CREATE OR REPLACE FUNCTION public.mm_reject_stock_offer_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Merchant stock offer history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS mm_merchant_stock_offer_events_append_only
  ON public.mm_merchant_stock_offer_events;
CREATE TRIGGER mm_merchant_stock_offer_events_append_only
  BEFORE UPDATE OR DELETE ON public.mm_merchant_stock_offer_events
  FOR EACH ROW EXECUTE FUNCTION public.mm_reject_stock_offer_event_mutation();

CREATE OR REPLACE FUNCTION public.mm_review_merchant_stock_offer(
  p_offer_id UUID,
  p_action TEXT,
  p_reviewer_email TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  offer_row public.mm_merchant_stock_offers%ROWTYPE;
  product_price NUMERIC(12, 2);
  min_margin NUMERIC(12, 2);
  current_stock INTEGER := 0;
  next_stock INTEGER;
  current_merchant_price NUMERIC(12, 2) := 0;
  current_listed BOOLEAN := false;
  next_status TEXT;
BEGIN
  IF p_offer_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('approve', 'reject')
    OR p_reviewer_email IS NULL OR length(trim(p_reviewer_email)) < 3
    OR p_review_note IS NOT NULL AND length(p_review_note) > 1000
    OR p_action = 'reject' AND length(trim(COALESCE(p_review_note, ''))) < 5 THEN
    RAISE EXCEPTION 'A valid review action and reviewer are required.';
  END IF;

  SELECT * INTO offer_row
  FROM public.mm_merchant_stock_offers
  WHERE id = p_offer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock offer not found.';
  END IF;
  IF offer_row.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Stock offer has already been reviewed.';
  END IF;

  next_status := CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END;

  IF p_action = 'approve' THEN
    PERFORM 1
    FROM public.mm_merchants
    WHERE id = offer_row.merchant_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This merchant is not currently approved.';
    END IF;

    SELECT price INTO product_price
    FROM public.products
    WHERE id = offer_row.product_id
      AND COALESCE(hide_product, false) = false
      AND COALESCE(is_available_now, true) = true
      AND lower(COALESCE(status, 'live')) NOT IN ('draft', 'hidden', 'inactive', 'archived', 'deleted')
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The product is no longer available for sale.';
    END IF;

    SELECT minimum_margin INTO min_margin
    FROM public.mm_catalog_pricing_policy
    WHERE id = true;
    min_margin := COALESCE(min_margin, 30);
    IF product_price - offer_row.offered_merchant_price < min_margin THEN
      RAISE EXCEPTION 'The offered payout price must leave at least KES % below the current customer price.', min_margin;
    END IF;

    SELECT stock, merchant_price, is_listed
      INTO current_stock, current_merchant_price, current_listed
    FROM public.mm_merchant_catalog_items
    WHERE merchant_id = offer_row.merchant_id
      AND product_id = offer_row.product_id
    FOR UPDATE;
    IF NOT FOUND THEN
      current_stock := 0;
      current_merchant_price := 0;
      current_listed := false;
    END IF;
    IF current_stock + offer_row.offered_quantity > 1000000 THEN
      RAISE EXCEPTION 'Approving this offer would exceed the stock limit.';
    END IF;
    next_stock := current_stock + offer_row.offered_quantity;

    INSERT INTO public.mm_merchant_catalog_items (
      merchant_id, product_id, merchant_price, stock, is_listed, updated_by, updated_at
    ) VALUES (
      offer_row.merchant_id, offer_row.product_id, offer_row.offered_merchant_price,
      next_stock, true, offer_row.submitted_by, now()
    )
    ON CONFLICT (merchant_id, product_id) DO UPDATE SET
      merchant_price = EXCLUDED.merchant_price,
      stock = EXCLUDED.stock,
      is_listed = true,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END IF;

  UPDATE public.mm_merchant_stock_offers
  SET status = next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_by_email = lower(trim(p_reviewer_email)),
      reviewed_at = now()
  WHERE id = offer_row.id;

  INSERT INTO public.mm_merchant_stock_offer_events (
    offer_id, actor_email, event_type, details
  ) VALUES (
    offer_row.id,
    lower(trim(p_reviewer_email)),
    next_status,
    jsonb_build_object(
      'note', NULLIF(trim(COALESCE(p_review_note, '')), ''),
      'product_id', offer_row.product_id,
      'offered_quantity', offer_row.offered_quantity,
      'offered_merchant_price', offer_row.offered_merchant_price,
      'stock_before', current_stock,
      'stock_after', CASE WHEN p_action = 'approve' THEN next_stock ELSE current_stock END,
      'merchant_price_before', current_merchant_price,
      'merchant_price_after', CASE WHEN p_action = 'approve' THEN offer_row.offered_merchant_price ELSE current_merchant_price END,
      'was_listed', current_listed
    )
  );

  RETURN jsonb_build_object(
    'id', offer_row.id,
    'status', next_status,
    'stock_before', current_stock,
    'stock_after', CASE WHEN p_action = 'approve' THEN next_stock ELSE current_stock END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_review_merchant_stock_offer(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_review_merchant_stock_offer(UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;
