CREATE OR REPLACE FUNCTION public.request_merchant_catalog_price(
    p_application_id UUID,
    p_product_id BIGINT,
    p_price NUMERIC,
    p_expected_price NUMERIC,
    p_variant TEXT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    application_row public.merchant_applications%ROWTYPE;
    offer JSONB;
    updated_offers JSONB;
    current_catalog_price NUMERIC(12, 2);
    variant_prices JSONB;
    beverage_specs JSONB;
    product_sizes TEXT[];
BEGIN
    IF p_application_id IS NULL
       OR p_product_id IS NULL OR p_product_id < 1
       OR p_price IS NULL OR p_price <= 0 OR p_price > 10000000
       OR p_price <> round(p_price, 2)
       OR p_expected_price IS NULL OR p_expected_price < 0 OR p_expected_price > 10000000
       OR p_expected_price <> round(p_expected_price, 2)
       OR char_length(coalesce(p_variant, '')) > 100
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'A valid product, KES price, and merchant identity are required.';
    END IF;

    SELECT *
    INTO application_row
    FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only an approved merchant can propose a catalog price.';
    END IF;

    SELECT product.price, product.variant_prices,
           coalesce(product.beverage_specs, '{}'::JSONB), product.sizes
    INTO current_catalog_price, variant_prices, beverage_specs, product_sizes
    FROM public.products product
    WHERE product.id = p_product_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This catalog product no longer exists.';
    END IF;
    variant_prices := coalesce(
        variant_prices,
        beverage_specs#>'{variant_prices}',
        '{}'::JSONB
    );
    IF p_variant IS NOT NULL THEN
        IF NOT (p_variant = ANY(coalesce(product_sizes, ARRAY[]::TEXT[]))) THEN
            RAISE EXCEPTION 'Choose a valid product size before requesting a price change.';
        END IF;
        current_catalog_price := coalesce(
            (variant_prices->>p_variant)::NUMERIC(12, 2),
            current_catalog_price
        );
    END IF;
    IF current_catalog_price <> p_expected_price THEN
        RAISE EXCEPTION 'The catalog price changed. Refresh the catalog and try again.';
    END IF;

    SELECT entry.value
    INTO offer
    FROM jsonb_array_elements(coalesce(application_row.offered_goods_pricing, '[]'::JSONB)) AS entry(value)
    WHERE entry.value->>'product_id' = p_product_id::TEXT;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This product is not in the merchant approved catalog.';
    END IF;
    IF offer ? 'pending_price' THEN
        RAISE EXCEPTION 'A price proposal for this product is already waiting for OnBar review.';
    END IF;
    IF p_price = current_catalog_price THEN
        RAISE EXCEPTION 'The proposed price is already the current catalog price.';
    END IF;

    SELECT jsonb_agg(
        CASE
            WHEN entry.value->>'product_id' = p_product_id::TEXT
            THEN jsonb_set(
                jsonb_set(
                    entry.value,
                    '{pending_price}',
                    to_jsonb(p_price),
                    true
                ),
                '{pending_base_price}',
                to_jsonb(current_catalog_price),
                true
            ) || jsonb_build_object('pending_price_submitted_at', now())
              || CASE WHEN p_variant IS NULL THEN '{}'::JSONB
                      ELSE jsonb_build_object('pending_variant', p_variant) END
            ELSE entry.value
        END
        ORDER BY entry.ordinality
    )
    INTO updated_offers
    FROM jsonb_array_elements(coalesce(application_row.offered_goods_pricing, '[]'::JSONB))
         WITH ORDINALITY AS entry(value, ordinality);

    UPDATE public.merchant_applications
    SET offered_goods_pricing = updated_offers,
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        'offer_price_updated',
        trim(p_actor),
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', offer->>'product_name',
            'previous_catalog_price', current_catalog_price,
            'variant', p_variant,
            'proposed_price', p_price,
            'requires_admin_review', true
        )
    );

    RETURN jsonb_build_object(
        'product_id', p_product_id,
        'current_catalog_price', current_catalog_price,
        'variant', p_variant,
        'proposed_price', p_price,
        'status', 'pending_review'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_merchant_offer_price(
    p_application_id UUID,
    p_product_id BIGINT,
    p_decision TEXT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    application_row public.merchant_applications%ROWTYPE;
    offer JSONB;
    updated_offers JSONB;
    proposal NUMERIC(12, 2);
    expected_price NUMERIC(12, 2);
    current_catalog_price NUMERIC(12, 2);
    product_name TEXT;
    pending_variant TEXT;
    variant_prices JSONB;
    beverage_specs JSONB;
    product_sizes TEXT[];
BEGIN
    IF p_application_id IS NULL
       OR p_product_id IS NULL OR p_product_id < 1
       OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject')
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'A valid application, product, review decision, and admin identity are required.';
    END IF;

    SELECT *
    INTO application_row
    FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The merchant application is no longer approved.';
    END IF;

    SELECT entry.value
    INTO offer
    FROM jsonb_array_elements(coalesce(application_row.offered_goods_pricing, '[]'::JSONB)) AS entry(value)
    WHERE entry.value->>'product_id' = p_product_id::TEXT;
    IF NOT FOUND OR NOT (offer ? 'pending_price') THEN
        RAISE EXCEPTION 'There is no pending price proposal for this product.';
    END IF;

    proposal := (offer->>'pending_price')::NUMERIC(12, 2);
    expected_price := (offer->>'pending_base_price')::NUMERIC(12, 2);
    product_name := offer->>'product_name';
    pending_variant := offer->>'pending_variant';

    SELECT product.price, product.variant_prices,
           coalesce(product.beverage_specs, '{}'::JSONB), product.sizes
    INTO current_catalog_price, variant_prices, beverage_specs, product_sizes
    FROM public.products product
    WHERE product.id = p_product_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This catalog product no longer exists.';
    END IF;
    variant_prices := coalesce(
        variant_prices,
        beverage_specs#>'{variant_prices}',
        '{}'::JSONB
    );
    IF pending_variant IS NOT NULL THEN
        current_catalog_price := coalesce(
            (variant_prices->>pending_variant)::NUMERIC(12, 2),
            current_catalog_price
        );
    END IF;

    IF p_decision = 'approve' THEN
        IF pending_variant IS NOT NULL
           AND NOT (pending_variant = ANY(coalesce(product_sizes, ARRAY[]::TEXT[]))) THEN
            RAISE EXCEPTION 'The requested product size is no longer available. Reject the proposal and ask the merchant to submit a fresh request.';
        END IF;
        IF current_catalog_price <> expected_price THEN
            RAISE EXCEPTION 'The catalog price changed after this proposal was submitted. Reject it and ask the merchant to submit a fresh proposal.';
        END IF;
        IF pending_variant IS NULL THEN
            UPDATE public.products SET price = proposal WHERE id = p_product_id;
        ELSE
            UPDATE public.products AS product
            SET variant_prices = coalesce(
                product.variant_prices,
                beverage_specs#>'{variant_prices}',
                '{}'::JSONB
            ) || jsonb_build_object(pending_variant, proposal)
            WHERE product.id = p_product_id;
        END IF;
    END IF;

    SELECT jsonb_agg(
        CASE
            WHEN entry.value->>'product_id' = p_product_id::TEXT THEN
                (entry.value - 'pending_price' - 'pending_base_price' - 'pending_price_submitted_at' - 'pending_variant')
                || CASE WHEN p_decision = 'approve' AND pending_variant IS NULL
                        THEN jsonb_build_object('price', proposal) ELSE '{}'::JSONB END
            ELSE entry.value
        END
        ORDER BY entry.ordinality
    )
    INTO updated_offers
    FROM jsonb_array_elements(coalesce(application_row.offered_goods_pricing, '[]'::JSONB))
         WITH ORDINALITY AS entry(value, ordinality);

    UPDATE public.merchant_applications
    SET offered_goods_pricing = updated_offers,
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        CASE WHEN p_decision = 'approve' THEN 'offer_price_approved' ELSE 'offer_price_rejected' END,
        trim(p_actor),
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', product_name,
            'decision', p_decision,
            'previous_catalog_price', current_catalog_price,
            'variant', pending_variant,
            'proposed_price', proposal,
            'catalog_price_updated', p_decision = 'approve'
        )
    );

    RETURN jsonb_build_object(
        'application_id', p_application_id,
        'product_id', p_product_id,
        'product_name', product_name,
        'decision', p_decision,
        'previous_catalog_price', current_catalog_price,
        'variant', pending_variant,
        'catalog_price', CASE WHEN p_decision = 'approve' THEN proposal ELSE current_catalog_price END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.request_merchant_catalog_price(UUID, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_merchant_offer_price(UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_merchant_catalog_price(UUID, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_merchant_offer_price(UUID, BIGINT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
