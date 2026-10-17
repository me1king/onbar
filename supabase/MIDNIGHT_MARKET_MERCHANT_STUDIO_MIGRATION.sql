-- Merchant Studio product lifecycle and Drip Control compatibility.
-- Apply after MIDNIGHT_MARKET_FOUNDATION.sql.

BEGIN;

ALTER TABLE public.mm_merchants
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

UPDATE public.mm_merchants AS merchant
SET contact_name = application.contact_name,
    contact_email = application.contact_email,
    contact_phone = application.contact_phone
FROM public.mm_merchant_applications AS application
WHERE merchant.slug = application.requested_slug
  AND application.status = 'approved'
  AND (merchant.contact_name IS NULL OR merchant.contact_email IS NULL OR merchant.contact_phone IS NULL);

ALTER TABLE public.mm_products
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS delivery_information TEXT,
  ADD COLUMN IF NOT EXISTS return_policy TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_email TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.mm_product_variants
  ADD COLUMN IF NOT EXISTS sale_price_minor BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mm_variant_sale_price_valid'
      AND conrelid = 'public.mm_product_variants'::regclass
  ) THEN
    ALTER TABLE public.mm_product_variants
      ADD CONSTRAINT mm_variant_sale_price_valid
      CHECK (sale_price_minor IS NULL OR (sale_price_minor > 0 AND sale_price_minor < price_minor));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.mm_product_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('merchant', 'admin')),
  actor_email TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'edited', 'published', 'rejected', 'archived', 'returned_to_review')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_product_review_events_product_idx
  ON public.mm_product_review_events (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.mm_product_variants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_inventory_movements_merchant_idx
  ON public.mm_inventory_movements (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_inventory_movements_product_idx
  ON public.mm_inventory_movements (product_id, created_at DESC);

ALTER TABLE public.mm_product_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mm_product_review_events, public.mm_inventory_movements FROM anon, authenticated;
GRANT ALL ON TABLE public.mm_product_review_events, public.mm_inventory_movements TO service_role;

CREATE OR REPLACE FUNCTION public.mm_create_product_listing(
  p_user_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_category_slug TEXT,
  p_storage_path TEXT,
  p_alt_text TEXT,
  p_size TEXT,
  p_color TEXT,
  p_price_minor BIGINT,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_category_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
BEGIN
  SELECT membership.merchant_id INTO v_merchant_id
  FROM public.mm_merchant_memberships AS membership
  JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'manager')
    AND merchant.status = 'approved'
  ORDER BY membership.created_at
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'An approved merchant membership is required to create a listing.';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 2 AND 180
    OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(p_slug) > 180
    OR length(coalesce(p_description, '')) > 3000
    OR length(coalesce(p_size, '')) > 80
    OR length(coalesce(p_color, '')) > 80
    OR length(coalesce(p_alt_text, '')) > 200
    OR p_price_minor IS NULL OR p_price_minor < 100 OR p_price_minor > 10000000000
    OR p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'Check the product details, price and stock.';
  END IF;

  SELECT id INTO v_category_id
  FROM public.mm_categories
  WHERE slug = p_category_slug AND active = true;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Choose an active marketplace category.';
  END IF;

  INSERT INTO public.mm_products (merchant_id, category_id, name, slug, description, status)
  VALUES (v_merchant_id, v_category_id, trim(p_name), p_slug, NULLIF(trim(p_description), ''), 'pending_review')
  RETURNING id INTO v_product_id;

  INSERT INTO public.mm_product_media (product_id, storage_path, alt_text, sort_order)
  VALUES (v_product_id, p_storage_path, NULLIF(trim(p_alt_text), ''), 0);

  INSERT INTO public.mm_product_variants (product_id, size, color, price_minor, currency, active)
  VALUES (v_product_id, NULLIF(trim(p_size), ''), NULLIF(trim(p_color), ''), p_price_minor, 'KES', true)
  RETURNING id INTO v_variant_id;

  INSERT INTO public.mm_inventory (variant_id, quantity_available, quantity_reserved)
  VALUES (v_variant_id, p_quantity, 0);

  IF p_quantity > 0 THEN
    INSERT INTO public.mm_inventory_movements (
      merchant_id, product_id, variant_id, actor_user_id, actor_email,
      quantity_delta, quantity_before, quantity_after, note
    ) VALUES (
      v_merchant_id, v_product_id, v_variant_id, p_user_id,
      (SELECT email FROM auth.users WHERE id = p_user_id),
      p_quantity, 0, p_quantity, 'Initial stock recorded when listing was submitted.'
    );
  END IF;

  INSERT INTO public.mm_product_review_events (
    product_id, actor_type, actor_email, event_type, from_status, to_status
  ) VALUES (
    v_product_id, 'merchant',
    (SELECT email FROM auth.users WHERE id = p_user_id),
    'submitted', NULL, 'pending_review'
  );

  RETURN jsonb_build_object('id', v_product_id, 'status', 'pending_review');
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_product_listing(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_product_listing(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_update_product_listing(
  p_user_id UUID,
  p_merchant_id UUID,
  p_product_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_category_slug TEXT,
  p_storage_path TEXT,
  p_alt_text TEXT,
  p_size TEXT,
  p_color TEXT,
  p_price_minor BIGINT,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  variant_row public.mm_product_variants%ROWTYPE;
  inventory_row public.mm_inventory%ROWTYPE;
  v_category_id UUID;
  old_storage_path TEXT;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 2 AND 180
    OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(p_slug) > 180
    OR length(coalesce(p_description, '')) > 3000
    OR length(coalesce(p_size, '')) > 80
    OR length(coalesce(p_color, '')) > 80
    OR length(coalesce(p_alt_text, '')) > 200
    OR p_price_minor IS NULL OR p_price_minor < 100 OR p_price_minor > 10000000000
    OR p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'Check the product details, price and stock.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mm_merchant_memberships AS membership
    JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
    WHERE membership.merchant_id = p_merchant_id
      AND membership.user_id = p_user_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'manager')
      AND merchant.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved merchant membership is required.';
  END IF;

  SELECT * INTO product_row
  FROM public.mm_products
  WHERE id = p_product_id AND merchant_id = p_merchant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product does not belong to your boutique.';
  END IF;

  SELECT id INTO v_category_id
  FROM public.mm_categories
  WHERE slug = p_category_slug AND active = true;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Choose an active marketplace category.';
  END IF;

  SELECT * INTO variant_row
  FROM public.mm_product_variants
  WHERE product_id = p_product_id AND active = true
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product has no active variant to update.';
  END IF;

  SELECT * INTO inventory_row
  FROM public.mm_inventory
  WHERE variant_id = variant_row.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product inventory could not be found.';
  END IF;
  IF p_quantity < inventory_row.quantity_reserved THEN
    RAISE EXCEPTION 'Stock cannot be set below the quantity already reserved.';
  END IF;

  SELECT storage_path INTO old_storage_path
  FROM public.mm_product_media
  WHERE product_id = p_product_id
  ORDER BY sort_order, created_at
  LIMIT 1;

  UPDATE public.mm_products
  SET name = trim(p_name),
      slug = p_slug,
      description = NULLIF(trim(coalesce(p_description, '')), ''),
      category_id = v_category_id,
      status = 'pending_review',
      review_note = NULL,
      reviewed_by_email = NULL,
      reviewed_at = NULL,
      updated_at = now()
  WHERE id = p_product_id;

  UPDATE public.mm_product_variants
  SET size = NULLIF(trim(coalesce(p_size, '')), ''),
      color = NULLIF(trim(coalesce(p_color, '')), ''),
      price_minor = p_price_minor,
      sale_price_minor = NULL
  WHERE id = variant_row.id;

  UPDATE public.mm_inventory
  SET quantity_available = p_quantity,
      updated_at = now()
  WHERE variant_id = variant_row.id;

  IF p_quantity <> inventory_row.quantity_available THEN
    INSERT INTO public.mm_inventory_movements (
      merchant_id, product_id, variant_id, actor_user_id, actor_email,
      quantity_delta, quantity_before, quantity_after, note
    ) VALUES (
      p_merchant_id, p_product_id, variant_row.id, p_user_id,
      (SELECT email FROM auth.users WHERE id = p_user_id),
      p_quantity - inventory_row.quantity_available,
      inventory_row.quantity_available, p_quantity, 'Stock updated during product resubmission.'
    );
  END IF;

  IF p_storage_path IS NOT NULL THEN
    IF old_storage_path IS NULL THEN
      INSERT INTO public.mm_product_media (product_id, storage_path, alt_text, sort_order)
      VALUES (p_product_id, p_storage_path, NULLIF(trim(p_alt_text), ''), 0);
    ELSE
      UPDATE public.mm_product_media
      SET storage_path = p_storage_path,
          alt_text = NULLIF(trim(p_alt_text), '')
      WHERE product_id = p_product_id
        AND storage_path = old_storage_path;
    END IF;
  END IF;

  INSERT INTO public.mm_product_review_events (
    product_id, actor_type, actor_email, event_type, from_status, to_status
  ) VALUES (
    p_product_id, 'merchant',
    (SELECT email FROM auth.users WHERE id = p_user_id),
    'edited', product_row.status, 'pending_review'
  );

  RETURN jsonb_build_object(
    'id', p_product_id,
    'status', 'pending_review',
    'oldStoragePath', CASE WHEN p_storage_path IS NOT NULL THEN old_storage_path ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_update_product_listing(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_update_product_listing(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_archive_product_listing(
  p_user_id UUID,
  p_merchant_id UUID,
  p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  previous_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.mm_merchant_memberships AS membership
    JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
    WHERE membership.merchant_id = p_merchant_id
      AND membership.user_id = p_user_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'manager')
      AND merchant.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved merchant membership is required.';
  END IF;

  SELECT * INTO product_row
  FROM public.mm_products
  WHERE id = p_product_id
    AND merchant_id = p_merchant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing does not belong to your boutique.';
  END IF;
  previous_status := product_row.status;

  UPDATE public.mm_products
  SET status = 'archived',
      review_note = 'Archived by the merchant.',
      updated_at = now()
  WHERE id = p_product_id
    AND merchant_id = p_merchant_id
    AND status <> 'archived'
  RETURNING * INTO product_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing does not belong to your boutique or is already archived.';
  END IF;

  INSERT INTO public.mm_product_review_events (
    product_id, actor_type, actor_email, event_type, from_status, to_status, note
  ) VALUES (
    p_product_id, 'merchant',
    (SELECT email FROM auth.users WHERE id = p_user_id),
    'archived', previous_status, 'archived', 'Archived by the merchant.'
  );

  RETURN jsonb_build_object('id', p_product_id, 'status', 'archived');
END;
$$;

REVOKE ALL ON FUNCTION public.mm_archive_product_listing(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_archive_product_listing(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_admin_set_product_status(
  p_product_id UUID,
  p_status TEXT,
  p_actor_email TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  previous_status TEXT;
BEGIN
  IF p_status NOT IN ('pending_review', 'published', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Choose a valid product review outcome.';
  END IF;
  IF p_status IN ('rejected', 'archived') AND length(trim(coalesce(p_review_note, ''))) < 5 THEN
    RAISE EXCEPTION 'Please provide a reason of at least five characters.';
  END IF;
  IF length(coalesce(p_review_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Review notes must be 1000 characters or fewer.';
  END IF;

  SELECT * INTO product_row
  FROM public.mm_products
  WHERE id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing no longer exists.';
  END IF;
  previous_status := product_row.status;

  IF NOT (
    (previous_status = 'pending_review' AND p_status IN ('published', 'rejected', 'archived'))
    OR (previous_status = 'published' AND p_status = 'archived')
    OR (previous_status = 'rejected' AND p_status = 'pending_review')
    OR (previous_status = 'archived' AND p_status IN ('pending_review', 'published'))
  ) THEN
    RAISE EXCEPTION 'This listing has already been reviewed or cannot be moved to that status.';
  END IF;

  IF p_status = 'published' AND (
    NOT EXISTS (
      SELECT 1 FROM public.mm_merchants
      WHERE id = product_row.merchant_id AND status = 'approved'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.mm_product_variants
      WHERE product_id = p_product_id AND active = true
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.mm_product_media
      WHERE product_id = p_product_id
    )
  ) THEN
    RAISE EXCEPTION 'The boutique must be approved and the listing must have an active variant and product photo.';
  END IF;

  UPDATE public.mm_products
  SET status = p_status,
      review_note = CASE WHEN p_status IN ('rejected', 'archived') THEN trim(p_review_note) ELSE NULL END,
      reviewed_by_email = NULLIF(trim(p_actor_email), ''),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO product_row;

  INSERT INTO public.mm_product_review_events (
    product_id, actor_type, actor_email, event_type, from_status, to_status, note
  ) VALUES (
    p_product_id, 'admin', NULLIF(trim(p_actor_email), ''),
    CASE p_status
      WHEN 'pending_review' THEN 'returned_to_review'
      WHEN 'published' THEN 'published'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'archived'
    END,
    previous_status, p_status, NULLIF(trim(p_review_note), '')
  );

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
    'product_' || p_status,
    'product',
    p_product_id::TEXT,
    jsonb_build_object('from_status', previous_status, 'review_note', NULLIF(trim(p_review_note), ''))
  );

  RETURN jsonb_build_object('id', product_row.id, 'status', product_row.status, 'review_note', product_row.review_note);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_admin_set_product_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_set_product_status(UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
