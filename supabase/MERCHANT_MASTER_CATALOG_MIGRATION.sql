-- Merchant-specific selection, payout price and stock for the shared master catalog.
-- Apply after MIDNIGHT_MARKET_FOUNDATION.sql and the products schema migrations.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_bite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_snack BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_souvenir BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_available_now BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_product BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.mm_catalog_pricing_policy (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  minimum_margin NUMERIC(12, 2) NOT NULL DEFAULT 30 CHECK (minimum_margin >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.mm_catalog_pricing_policy (id, minimum_margin)
VALUES (true, 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mm_merchant_catalog_items (
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (merchant_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 1000000),
  is_listed BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, product_id)
);

CREATE INDEX IF NOT EXISTS mm_merchant_catalog_product_idx
  ON public.mm_merchant_catalog_items (product_id, is_listed, stock);

CREATE TABLE IF NOT EXISTS public.mm_merchant_catalog_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_state JSONB,
  new_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_merchant_catalog_events_merchant_idx
  ON public.mm_merchant_catalog_events (merchant_id, created_at DESC);

ALTER TABLE public.mm_catalog_pricing_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_merchant_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_merchant_catalog_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mm_catalog_pricing_policy,
  public.mm_merchant_catalog_items,
  public.mm_merchant_catalog_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mm_catalog_pricing_policy TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mm_merchant_catalog_items TO service_role;
GRANT SELECT, INSERT ON TABLE public.mm_merchant_catalog_events TO service_role;

CREATE OR REPLACE FUNCTION public.mm_reject_catalog_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Merchant catalog history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS mm_merchant_catalog_events_append_only
  ON public.mm_merchant_catalog_events;
CREATE TRIGGER mm_merchant_catalog_events_append_only
  BEFORE UPDATE OR DELETE ON public.mm_merchant_catalog_events
  FOR EACH ROW EXECUTE FUNCTION public.mm_reject_catalog_event_mutation();

CREATE OR REPLACE FUNCTION public.mm_save_merchant_catalog_items(
  p_user_id UUID,
  p_merchant_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item JSONB;
  product_id_value BIGINT;
  merchant_price_value NUMERIC(12, 2);
  stock_value INTEGER;
  listed_value BOOLEAN;
  customer_price_value NUMERIC(12, 2);
  minimum_margin_value NUMERIC(12, 2);
  old_state JSONB;
  saved_count INTEGER := 0;
BEGIN
  IF p_user_id IS NULL OR p_merchant_id IS NULL
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'Submit between 1 and 500 catalog changes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mm_merchant_memberships AS membership
    JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
    WHERE membership.user_id = p_user_id
      AND membership.merchant_id = p_merchant_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'manager')
      AND merchant.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An active owner or manager membership is required.';
  END IF;

  SELECT minimum_margin INTO minimum_margin_value
  FROM public.mm_catalog_pricing_policy
  WHERE id = true;
  minimum_margin_value := COALESCE(minimum_margin_value, 30);

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(item) <> 'object'
      OR COALESCE(item->>'product_id', '') !~ '^[1-9][0-9]{0,17}$'
      OR COALESCE(item->>'merchant_price', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      OR COALESCE(item->>'stock', '') !~ '^[0-9]{1,7}$'
      OR jsonb_typeof(item->'is_listed') <> 'boolean' THEN
      RAISE EXCEPTION 'A catalog item contains invalid price, stock or selection data.';
    END IF;

    product_id_value := (item->>'product_id')::BIGINT;
    merchant_price_value := (item->>'merchant_price')::NUMERIC(12, 2);
    stock_value := (item->>'stock')::INTEGER;
    listed_value := (item->>'is_listed')::BOOLEAN;

    IF stock_value > 1000000 OR merchant_price_value > 100000000 THEN
      RAISE EXCEPTION 'Catalog stock or merchant price exceeds the allowed limit.';
    END IF;

    SELECT price INTO customer_price_value
    FROM public.products
    WHERE id = product_id_value
      AND COALESCE(hide_product, false) = false
      AND COALESCE(is_available_now, true) = true
      AND lower(COALESCE(status, 'live')) NOT IN ('draft', 'hidden', 'inactive', 'archived', 'deleted');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected master catalog product is unavailable.';
    END IF;

    IF listed_value AND (
      merchant_price_value <= 0
      OR customer_price_value IS NULL
      OR customer_price_value - merchant_price_value < minimum_margin_value
    ) THEN
      RAISE EXCEPTION 'Merchant price must leave at least KES % below the platform customer price.', minimum_margin_value;
    END IF;

    SELECT jsonb_build_object(
      'merchant_price', merchant_price,
      'stock', stock,
      'is_listed', is_listed
    ) INTO old_state
    FROM public.mm_merchant_catalog_items
    WHERE merchant_id = p_merchant_id AND product_id = product_id_value;

    INSERT INTO public.mm_merchant_catalog_items (
      merchant_id, product_id, merchant_price, stock, is_listed, updated_by, updated_at
    ) VALUES (
      p_merchant_id, product_id_value, merchant_price_value, stock_value, listed_value, p_user_id, now()
    )
    ON CONFLICT (merchant_id, product_id) DO UPDATE SET
      merchant_price = EXCLUDED.merchant_price,
      stock = EXCLUDED.stock,
      is_listed = EXCLUDED.is_listed,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

    INSERT INTO public.mm_merchant_catalog_events (
      merchant_id, product_id, actor_user_id, previous_state, new_state
    ) VALUES (
      p_merchant_id,
      product_id_value,
      p_user_id,
      old_state,
      jsonb_build_object(
        'merchant_price', merchant_price_value,
        'customer_price', customer_price_value,
        'stock', stock_value,
        'is_listed', listed_value
      )
    );
    saved_count := saved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'saved', saved_count,
    'minimum_margin', minimum_margin_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_save_merchant_catalog_items(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_save_merchant_catalog_items(UUID, UUID, JSONB)
  TO service_role;

COMMIT;
