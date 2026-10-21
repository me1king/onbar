-- Makes paid-order stock deduction transactional and safe to retry from Paystack webhooks.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.deduct_paid_order_inventory(order_id_input BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    order_status TEXT;
    inventory_deducted_at_value TIMESTAMPTZ;
    product_row RECORD;
    variant_row RECORD;
BEGIN
    SELECT status, inventory_deducted_at
    INTO order_status, inventory_deducted_at_value
    FROM public.orders
    WHERE id = order_id_input
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist.', order_id_input;
    END IF;
    IF order_status <> 'Paid' THEN
        RAISE EXCEPTION 'Order % is not paid.', order_id_input;
    END IF;
    IF inventory_deducted_at_value IS NOT NULL THEN
        RETURN FALSE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.order_items WHERE order_id = order_id_input
    ) THEN
        RAISE EXCEPTION 'Paid order % has no items to fulfill.', order_id_input;
    END IF;

    PERFORM product.id
    FROM public.products AS product
    WHERE product.id IN (
        SELECT DISTINCT item.product_id
        FROM public.order_items AS item
        WHERE item.order_id = order_id_input
          AND item.product_id IS NOT NULL
    )
    ORDER BY product.id
    FOR UPDATE;

    FOR product_row IN
        SELECT item.product_id, SUM(item.quantity)::INTEGER AS quantity
        FROM public.order_items AS item
        WHERE item.order_id = order_id_input
          AND item.product_id IS NOT NULL
        GROUP BY item.product_id
        ORDER BY item.product_id
    LOOP
        UPDATE public.products
        SET stock = COALESCE(stock, 0) - product_row.quantity
        WHERE id = product_row.product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % for paid order % does not exist.',
                product_row.product_id, order_id_input;
        END IF;

        FOR variant_row IN
            SELECT item.size, SUM(item.quantity)::INTEGER AS quantity
            FROM public.order_items AS item
            WHERE item.order_id = order_id_input
              AND item.product_id = product_row.product_id
              AND item.size IS NOT NULL
            GROUP BY item.size
        LOOP
            UPDATE public.products
            SET variant_stock = CASE
                WHEN COALESCE(variant_stock, '{}'::JSONB) ? variant_row.size
                THEN jsonb_set(
                    COALESCE(variant_stock, '{}'::JSONB),
                    ARRAY[variant_row.size],
                    to_jsonb(
                        COALESCE(NULLIF(variant_stock ->> variant_row.size, '')::INTEGER, 0)
                        - variant_row.quantity
                    ),
                    true
                )
                ELSE COALESCE(variant_stock, '{}'::JSONB)
            END
            WHERE id = product_row.product_id;
        END LOOP;
    END LOOP;

    UPDATE public.orders
    SET inventory_deducted_at = now()
    WHERE id = order_id_input;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_paid_order_inventory(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_paid_order_inventory(BIGINT)
    TO service_role;
