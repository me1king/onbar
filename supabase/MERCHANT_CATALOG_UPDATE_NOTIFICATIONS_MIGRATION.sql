-- Publish new admin catalog products into compatible approved merchant workspaces.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql and the product catalog migrations.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NULL
     OR to_regclass('public.merchant_application_events') IS NULL
     OR to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'Merchant catalog update prerequisites are missing.'
      USING HINT = 'Apply MERCHANT_OPERATIONS_MIGRATION.sql and the product catalog migrations first.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_catalog_update_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL CHECK (char_length(trim(product_name)) BETWEEN 1 AND 300),
  category TEXT,
  listed_price NUMERIC(12, 2) NOT NULL CHECK (listed_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  UNIQUE (application_id, product_id),
  CHECK (
    (status = 'pending' AND acknowledged_at IS NULL AND acknowledged_by IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS merchant_catalog_update_notifications_pending_idx
  ON public.merchant_catalog_update_notifications (application_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.merchant_catalog_update_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.merchant_catalog_update_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.merchant_catalog_update_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.notify_approved_merchants_of_new_product(
  p_product_id BIGINT,
  p_actor TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  merchant_row public.merchant_applications%ROWTYPE;
  notification_id UUID;
  updated_count INTEGER := 0;
  offers JSONB;
  product_category TEXT;
  product_is_food BOOLEAN;
  product_is_beverage BOOLEAN;
  merchant_can_offer BOOLEAN;
BEGIN
  IF p_product_id IS NULL OR p_product_id < 1
     OR p_actor IS NULL OR char_length(trim(p_actor)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'A valid catalog product and admin identity are required.';
  END IF;

  SELECT * INTO product_row
  FROM public.products
  WHERE id = p_product_id
    AND COALESCE(hide_product, false) = false
    AND lower(COALESCE(status, 'live')) NOT IN ('draft', 'hidden', 'inactive', 'archived', 'deleted');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active customer catalog product can be published to merchants.';
  END IF;

  product_category := lower(concat_ws(' ', product_row.category, product_row.sub_category));
  product_is_food := (
    COALESCE(product_row.is_bite, false)
    OR COALESCE(product_row.is_snack, false)
    OR product_category ~ '(food|meal|street|burger|wings|sides|snack|munch|crisps|chocolate|nuts)'
  ) AND product_category !~ '(wine|beer|whiskey|whisky|vodka|gin|rum|tequila|brandy|cognac|champagne|liqueur|spirit)';
  product_is_beverage := (
    product_category ~ '(beverage|drink|alcohol|wine|beer|whiskey|whisky|vodka|gin|rum|tequila|brandy|cognac|champagne|liqueur|spirit|soft drink|energy|water|juice|coffee|tea|mixer)'
  ) AND NOT (
    COALESCE(product_row.is_bite, false)
    OR COALESCE(product_row.is_snack, false)
    OR COALESCE(product_row.is_souvenir, false)
    OR product_category ~ '(food|meal|street|burger|wings|sides|snack|munch|crisps|chocolate|nuts|souvenir|gift|merch|apparel|clothing|accessor|glassware|tumbler|flask|barware|opener)'
  );

  FOR merchant_row IN
    SELECT *
    FROM public.merchant_applications
    WHERE status = 'approved'
    FOR UPDATE
  LOOP
    merchant_can_offer := CASE
      WHEN merchant_row.business_type IN ('kitchen', 'restaurant', 'food_vendor')
        OR merchant_row.vendor_type = 'street_food' THEN product_is_food
      WHEN (merchant_row.business_type = 'bar' AND merchant_row.vendor_type = 'retailer')
        OR merchant_row.business_type = 'supplier'
        OR merchant_row.vendor_type = 'wholesaler' THEN product_is_beverage
      ELSE false
    END;
    IF NOT merchant_can_offer THEN
      CONTINUE;
    END IF;

    INSERT INTO public.merchant_catalog_update_notifications (
      application_id, product_id, product_name, category, listed_price
    ) VALUES (
      merchant_row.id, product_row.id, product_row.name,
      product_row.category, GREATEST(COALESCE(product_row.price, 0), 0)
    )
    ON CONFLICT (application_id, product_id) DO NOTHING
    RETURNING id INTO notification_id;
    IF notification_id IS NULL THEN
      CONTINUE;
    END IF;

    offers := CASE
      WHEN jsonb_typeof(merchant_row.offered_goods_pricing) = 'array'
        THEN merchant_row.offered_goods_pricing
      ELSE '[]'::JSONB
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(offers) AS existing(offer)
      WHERE existing.offer->>'product_id' = product_row.id::TEXT
    ) THEN
      offers := offers || jsonb_build_array(jsonb_build_object(
        'product_id', product_row.id,
        'product_name', product_row.name,
        'price', GREATEST(COALESCE(product_row.price, 0), 0),
        'currency', 'KES',
        'category', product_row.category,
        'sub_category', product_row.sub_category,
        'is_bite', COALESCE(product_row.is_bite, false),
        'is_snack', COALESCE(product_row.is_snack, false),
        'is_souvenir', COALESCE(product_row.is_souvenir, false),
        'listed_price', GREATEST(COALESCE(product_row.price, 0), 0),
        'selling_price', GREATEST(COALESCE(product_row.price, 0), 0),
        'spread', 0,
        'margin_percent', 0,
        'sizes', COALESCE(to_jsonb(product_row)->'sizes', '[]'::JSONB),
        'image_url', to_jsonb(product_row)->'image_url',
        'variant_prices', COALESCE(to_jsonb(product_row)->'variant_prices', '{}'::JSONB)
      ));
      UPDATE public.merchant_applications
      SET offered_goods_pricing = offers,
          offered_goods = CASE
            WHEN product_row.name = ANY(COALESCE(offered_goods, ARRAY[]::TEXT[])) THEN offered_goods
            ELSE array_append(COALESCE(offered_goods, ARRAY[]::TEXT[]), product_row.name)
          END,
          updated_at = now()
      WHERE id = merchant_row.id;
    END IF;

    INSERT INTO public.merchant_application_events (
      application_id, event_type, actor, details
    ) VALUES (
      merchant_row.id, 'new_product_available', trim(p_actor),
      jsonb_build_object(
        'notification_id', notification_id,
        'product_id', product_row.id,
        'product_name', product_row.name,
        'category', product_row.category,
        'listed_price', GREATEST(COALESCE(product_row.price, 0), 0)
      )
    );
    updated_count := updated_count + 1;
    notification_id := NULL;
  END LOOP;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_merchant_catalog_update(
  p_application_id UUID,
  p_notification_id UUID,
  p_actor TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  notification public.merchant_catalog_update_notifications%ROWTYPE;
BEGIN
  IF p_application_id IS NULL OR p_notification_id IS NULL
     OR p_actor IS NULL OR char_length(trim(p_actor)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'A valid merchant catalog notification and account are required.';
  END IF;

  UPDATE public.merchant_catalog_update_notifications
  SET status = 'acknowledged',
      acknowledged_at = now(),
      acknowledged_by = trim(p_actor)
  WHERE id = p_notification_id
    AND application_id = p_application_id
    AND status = 'pending'
  RETURNING * INTO notification;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.merchant_application_events (
    application_id, event_type, actor, details
  ) VALUES (
    p_application_id, 'catalog_update_acknowledged', trim(p_actor),
    jsonb_build_object(
      'notification_id', notification.id,
      'product_id', notification.product_id,
      'product_name', notification.product_name
    )
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_approved_merchants_of_new_product(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acknowledge_merchant_catalog_update(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_approved_merchants_of_new_product(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_merchant_catalog_update(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
