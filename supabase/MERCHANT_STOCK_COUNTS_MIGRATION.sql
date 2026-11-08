-- Merchant-entered counts use the same batch and movement ledger as dispatch.
ALTER TABLE public.merchant_product_batches
    ADD COLUMN IF NOT EXISTS excise_stamp_confirmed BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.merchant_product_stock_summary AS
WITH movement_totals AS (
    SELECT
        movement.batch_id,
        greatest(sum(movement.quantity_delta), 0)::INTEGER AS available_quantity,
        max(movement.created_at) AS updated_at
    FROM public.merchant_inventory_movements movement
    GROUP BY movement.batch_id
),
active_holds AS (
    SELECT hold.batch_id
    FROM public.merchant_batch_holds hold
    WHERE hold.released_at IS NULL
    GROUP BY hold.batch_id
)
SELECT
    application.id AS application_id,
    application.business_name,
    application.merchant_code,
    batch.product_id,
    sum(CASE
        WHEN hold.batch_id IS NULL
          AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
        THEN coalesce(movement.available_quantity, 0)
        ELSE 0
    END)::INTEGER AS available_quantity,
    max(movement.updated_at) AS updated_at
FROM public.merchant_product_batches batch
JOIN public.merchant_applications application
  ON application.id = batch.application_id
LEFT JOIN movement_totals movement
  ON movement.batch_id = batch.id
LEFT JOIN active_holds hold
  ON hold.batch_id = batch.id
WHERE application.status = 'approved'
GROUP BY application.id, application.business_name, application.merchant_code, batch.product_id;

REVOKE ALL ON public.merchant_product_stock_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.merchant_product_stock_summary TO service_role;

CREATE OR REPLACE FUNCTION public.set_merchant_product_stock(
    p_application_id UUID,
    p_product_id BIGINT,
    p_quantity INTEGER,
    p_lot_code TEXT,
    p_supplier_name TEXT,
    p_expiry_at DATE,
    p_excise_stamp_confirmed BOOLEAN,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    merchant_row public.merchant_applications%ROWTYPE;
    batch_row RECORD;
    target_quantity INTEGER := p_quantity;
    current_quantity INTEGER := 0;
    difference INTEGER;
    remaining_quantity INTEGER;
    adjustment_quantity INTEGER;
    batch_id UUID;
    existing_batch public.merchant_product_batches%ROWTYPE;
    is_alcohol_retailer BOOLEAN;
BEGIN
    IF p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 1000000
       OR p_product_id IS NULL OR p_product_id < 1
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'A valid product, available stock count, and merchant identity are required.';
    END IF;

    SELECT *
    INTO merchant_row
    FROM public.merchant_applications
    WHERE id = p_application_id
      AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only an approved merchant can update stock.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(merchant_row.offered_goods_pricing, '[]'::JSONB)) AS offers(offer)
        WHERE offers.offer->>'product_id' = p_product_id::TEXT
    ) THEN
        RAISE EXCEPTION 'This product is not in the merchant approved catalog.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
        RAISE EXCEPTION 'The selected catalog product no longer exists.';
    END IF;

    is_alcohol_retailer := merchant_row.business_type = 'bar'
        AND merchant_row.vendor_type = 'retailer';
    IF p_expiry_at IS NOT NULL AND p_expiry_at < CURRENT_DATE THEN
        RAISE EXCEPTION 'Expiry date cannot be in the past.';
    END IF;

    PERFORM 1
    FROM public.merchant_product_batches batch
    WHERE batch.application_id = p_application_id
      AND batch.product_id = p_product_id
    ORDER BY batch.id
    FOR UPDATE;

    SELECT coalesce(sum(greatest(coalesce(stock.available_quantity, 0), 0)), 0)::INTEGER
    INTO current_quantity
    FROM public.merchant_product_batches batch
    LEFT JOIN LATERAL (
        SELECT sum(movement.quantity_delta)::INTEGER AS available_quantity
        FROM public.merchant_inventory_movements movement
        WHERE movement.batch_id = batch.id
    ) stock ON true
    WHERE batch.application_id = p_application_id
      AND batch.product_id = p_product_id
      AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
      AND NOT EXISTS (
          SELECT 1 FROM public.merchant_batch_holds hold
          WHERE hold.batch_id = batch.id AND hold.released_at IS NULL
      );

    difference := target_quantity - current_quantity;
    IF difference = 0 THEN
        RETURN jsonb_build_object(
            'product_id', p_product_id,
            'previous_available', current_quantity,
            'available', current_quantity,
            'changed', false
        );
    END IF;

    IF difference > 0 THEN
        IF char_length(trim(coalesce(p_lot_code, ''))) NOT BETWEEN 1 AND 120 THEN
            RAISE EXCEPTION 'Enter the actual lot or batch code for added stock.';
        END IF;
        IF is_alcohol_retailer AND coalesce(p_excise_stamp_confirmed, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'Confirm the excise stamp for this alcohol stock lot.';
        END IF;

        SELECT *
        INTO existing_batch
        FROM public.merchant_product_batches
        WHERE application_id = p_application_id
          AND product_id = p_product_id
          AND lot_code = trim(p_lot_code)
        FOR UPDATE;

        IF FOUND THEN
            IF (existing_batch.expiry_at IS NOT NULL AND existing_batch.expiry_at < CURRENT_DATE)
               OR (p_expiry_at IS NOT NULL AND existing_batch.expiry_at IS DISTINCT FROM p_expiry_at)
               OR EXISTS (
                   SELECT 1 FROM public.merchant_batch_holds hold
                   WHERE hold.batch_id = existing_batch.id AND hold.released_at IS NULL
               ) THEN
                RAISE EXCEPTION 'That lot is expired, held, or has different expiry details. Use a new lot code.';
            END IF;
            IF is_alcohol_retailer AND existing_batch.excise_stamp_confirmed IS NOT TRUE THEN
                RAISE EXCEPTION 'That lot has no saved excise-stamp attestation. Use a new lot code.';
            END IF;

            INSERT INTO public.merchant_inventory_movements (
                batch_id, movement_type, quantity_delta, actor, note
            ) VALUES (
                existing_batch.id, 'adjusted', difference, trim(p_actor),
                format('Merchant stock count increased from %s to %s', current_quantity, target_quantity)
            );
        ELSE
            INSERT INTO public.merchant_product_batches (
                application_id, product_id, lot_code, supplier_name, expiry_at,
                quantity_received, storage_notes, created_by, excise_stamp_confirmed
            ) VALUES (
                p_application_id, p_product_id, trim(p_lot_code),
                nullif(trim(coalesce(p_supplier_name, '')), ''), p_expiry_at,
                difference, 'Added from merchant stock count.', trim(p_actor),
                coalesce(p_excise_stamp_confirmed, false)
            )
            RETURNING id INTO batch_id;

            INSERT INTO public.merchant_inventory_movements (
                batch_id, movement_type, quantity_delta, actor, note
            ) VALUES (
                batch_id, 'received', difference, trim(p_actor),
                format('Merchant stock count increased from %s to %s', current_quantity, target_quantity)
            );
        END IF;
    ELSE
        remaining_quantity := -difference;
        FOR batch_row IN
            SELECT
                batch.id,
                greatest(coalesce(sum(movement.quantity_delta), 0), 0)::INTEGER AS available_quantity
            FROM public.merchant_product_batches batch
            LEFT JOIN public.merchant_inventory_movements movement
              ON movement.batch_id = batch.id
            WHERE batch.application_id = p_application_id
              AND batch.product_id = p_product_id
              AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
              AND NOT EXISTS (
                  SELECT 1 FROM public.merchant_batch_holds hold
                  WHERE hold.batch_id = batch.id AND hold.released_at IS NULL
              )
            GROUP BY batch.id, batch.received_at
            HAVING sum(coalesce(movement.quantity_delta, 0)) > 0
            ORDER BY batch.received_at, batch.id
        LOOP
            EXIT WHEN remaining_quantity = 0;
            adjustment_quantity := least(remaining_quantity, batch_row.available_quantity);
            IF adjustment_quantity <= 0 THEN
                CONTINUE;
            END IF;

            INSERT INTO public.merchant_inventory_movements (
                batch_id, movement_type, quantity_delta, actor, note
            ) VALUES (
                batch_row.id, 'adjusted', -adjustment_quantity, trim(p_actor),
                format('Merchant stock count decreased from %s to %s', current_quantity, target_quantity)
            );
            remaining_quantity := remaining_quantity - adjustment_quantity;
        END LOOP;

        IF remaining_quantity > 0 THEN
            RAISE EXCEPTION 'Available stock changed while saving. Refresh the catalog and try again.';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'product_id', p_product_id,
        'previous_available', current_quantity,
        'available', target_quantity,
        'changed', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_merchant_product_stock(UUID, BIGINT, INTEGER, TEXT, TEXT, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_merchant_product_stock(UUID, BIGINT, INTEGER, TEXT, TEXT, DATE, BOOLEAN, TEXT) TO service_role;
