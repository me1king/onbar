-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql, DISPATCH_MIGRATION.sql, and
-- COD_RIDER_DISPATCH_MIGRATION.sql.
-- Replaces dispatch retry with complete per-line reporting and lets admins
-- save verified merchant service radii alongside pickup coordinates.

CREATE OR REPLACE FUNCTION public.update_merchant_dispatch_settings(
    p_application_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_delivery_radius_km NUMERIC,
    p_actor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_application_id IS NULL
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'A merchant and administrator identity are required.';
    END IF;
    IF (p_latitude IS NULL) <> (p_longitude IS NULL)
       OR (p_latitude IS NOT NULL AND p_latitude NOT BETWEEN -90 AND 90)
       OR (p_longitude IS NOT NULL AND p_longitude NOT BETWEEN -180 AND 180) THEN
        RAISE EXCEPTION 'Provide both valid coordinates or clear both values.';
    END IF;
    IF p_delivery_radius_km IS NOT NULL
       AND p_delivery_radius_km NOT BETWEEN 0 AND 500 THEN
        RAISE EXCEPTION 'Delivery radius must be between 0 and 500 km.';
    END IF;

    UPDATE public.merchant_applications
    SET latitude = p_latitude,
        longitude = p_longitude,
        delivery_radius_km = p_delivery_radius_km,
        updated_at = now()
    WHERE id = p_application_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant application not found.';
    END IF;

    INSERT INTO public.merchant_application_events (
        application_id, event_type, actor, details
    ) VALUES (
        p_application_id,
        'dispatch_location_updated',
        trim(p_actor),
        jsonb_build_object(
            'latitude', p_latitude,
            'longitude', p_longitude,
            'delivery_radius_km', p_delivery_radius_km,
            'updated_at', now()
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_merchant_dispatch_settings(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_dispatch_settings(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.retry_paid_order_merchant_allocation(
    p_order_id BIGINT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_order public.orders%ROWTYPE;
    item_record RECORD;
    allocated_quantity INTEGER;
    retried_items INTEGER := 0;
    unallocated_items JSONB := '[]'::JSONB;
    blocker_reason TEXT;
BEGIN
    IF p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RAISE EXCEPTION 'An administrator identity is required to retry merchant allocation.';
    END IF;
    SELECT * INTO target_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Order not found.');
    END IF;
    IF NOT (
       (
         lower(coalesce(target_order.payment_method, '')) = 'cod'
         AND lower(coalesce(target_order.status, '')) IN ('pending', 'placed', 'confirmed')
       )
       OR (
         lower(coalesce(target_order.status, '')) = 'paid'
         AND target_order.payment_verified_at IS NOT NULL
         AND lower(coalesce(target_order.payment_method, '')) IN ('paystack', 'payhero')
         AND target_order.checkout_request_id IS NOT NULL
         AND EXISTS (
             SELECT 1
             FROM public.payment_confirmations confirmation
             WHERE confirmation.order_id = target_order.id
               AND confirmation.provider = CASE
                   WHEN lower(target_order.payment_method) = 'payhero' THEN 'PayHero'
                   ELSE 'Paystack'
               END
               AND confirmation.reference = target_order.checkout_request_id
               AND confirmation.amount_kobo = round(target_order.total_price * 100)::BIGINT
               AND confirmation.currency = 'KES'
         )
       )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_ELIGIBLE',
            'error', 'Only an active COD order or a server-verified online order can be redistributed.'
        );
    END IF;
    IF target_order.rider_phone IS NOT NULL
       AND target_order.status IN ('Dispatched', 'Out for Delivery', 'Delivered') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_ALREADY_DISPATCHED',
            'error', 'Merchant allocation cannot be changed after rider dispatch.'
        );
    END IF;

    FOR item_record IN
        SELECT item.id, item.product_id, coalesce(item.quantity, 1)::INTEGER AS quantity,
               product.name AS product_name
        FROM public.order_items item
        LEFT JOIN public.products product ON product.id = item.product_id
        WHERE item.order_id = target_order.id
        ORDER BY item.id
    LOOP
        retried_items := retried_items + 1;
        IF item_record.product_id IS NULL THEN
            unallocated_items := unallocated_items || jsonb_build_array(jsonb_build_object(
                'order_item_id', item_record.id,
                'product_id', NULL,
                'product_name', 'Unlinked order item',
                'requested_quantity', item_record.quantity,
                'allocated_quantity', 0,
                'reason', format(
                    'Order line %s has no catalog product. Verify the customer order before correcting or cancelling it.',
                    item_record.id
                )
            ));
            CONTINUE;
        END IF;

        INSERT INTO public.merchant_inventory_movements (
            batch_id, movement_type, quantity_delta, order_id, order_item_id, actor, note
        )
        SELECT traced.batch_id,
               'returned',
               (traced.traced_quantity - coalesce(previous_return.returned_quantity, 0))::INTEGER,
               target_order.id,
               item_record.id,
               trim(p_actor),
               'Returned for offline merchant redistribution'
        FROM (
            SELECT trace.batch_id, sum(trace.quantity)::INTEGER AS traced_quantity
            FROM public.merchant_order_item_trace trace
            WHERE trace.order_item_id = item_record.id
            GROUP BY trace.batch_id
        ) traced
        JOIN public.merchant_product_batches batch ON batch.id = traced.batch_id
        JOIN public.merchant_applications application ON application.id = batch.application_id
        LEFT JOIN LATERAL (
            SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS returned_quantity
            FROM public.merchant_inventory_movements movement
            WHERE movement.batch_id = traced.batch_id
              AND movement.order_item_id = item_record.id
              AND movement.movement_type = 'returned'
              AND movement.note = 'Returned for offline merchant redistribution'
        ) previous_return ON true
        WHERE application.status = 'approved'
          AND (
              NOT application.accepting_orders
              OR NOT public.merchant_is_open(application.operating_hours, now())
              OR EXISTS (
                  SELECT 1
                  FROM public.merchant_fulfillment_events rejected
                  WHERE rejected.order_id = target_order.id
                    AND rejected.application_id = application.id
                    AND rejected.event_type = 'rejected'
              )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_fulfillment_events accepted
              WHERE accepted.order_id = target_order.id
                AND accepted.application_id = application.id
                AND accepted.event_type = 'accepted'
          )
          AND traced.traced_quantity > coalesce(previous_return.returned_quantity, 0);

        BEGIN
            UPDATE public.order_items
            SET quantity = item_record.quantity
            WHERE id = item_record.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Merchant allocation retry for order item % did not complete: %',
                item_record.id, SQLERRM;
        END;

        SELECT coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0)::INTEGER
        INTO allocated_quantity
        FROM public.merchant_order_item_trace trace
        JOIN public.merchant_product_batches batch ON batch.id = trace.batch_id
        JOIN public.merchant_applications application ON application.id = batch.application_id
        LEFT JOIN LATERAL (
            SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
            FROM public.merchant_inventory_movements movement
            WHERE movement.batch_id = trace.batch_id
              AND movement.order_item_id = trace.order_item_id
              AND movement.movement_type = 'returned'
              AND movement.note = 'Returned for offline merchant redistribution'
        ) returned ON true
        WHERE trace.order_item_id = item_record.id
          AND application.status = 'approved'
          AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_batch_holds hold
              WHERE hold.batch_id = batch.id AND hold.released_at IS NULL
          )
          AND (
              (
                  application.accepting_orders
                  AND public.merchant_is_open(application.operating_hours, now())
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.merchant_fulfillment_events rejected
                      WHERE rejected.order_id = target_order.id
                        AND rejected.application_id = application.id
                        AND rejected.event_type = 'rejected'
                  )
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.merchant_fulfillment_events accepted
                  WHERE accepted.order_id = target_order.id
                    AND accepted.application_id = application.id
                    AND accepted.event_type = 'accepted'
              )
          );

        IF allocated_quantity < item_record.quantity THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_applications application
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(application.offered_goods_pricing) = 'array'
                            THEN application.offered_goods_pricing
                        ELSE '[]'::JSONB
                    END
                ) AS offers(offer)
                WHERE application.status = 'approved'
                  AND offers.offer->>'product_id' = item_record.product_id::TEXT
            ) THEN
                blocker_reason := 'No approved merchant currently offers this product in its catalog.';
            ELSIF NOT EXISTS (
                SELECT 1
                FROM public.merchant_product_batches batch
                JOIN public.merchant_applications application ON application.id = batch.application_id
                WHERE batch.product_id = item_record.product_id
                  AND application.status = 'approved'
                  AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.merchant_batch_holds hold
                      WHERE hold.batch_id = batch.id AND hold.released_at IS NULL
                  )
                  AND (
                      SELECT coalesce(sum(movement.quantity_delta), 0)
                      FROM public.merchant_inventory_movements movement
                      WHERE movement.batch_id = batch.id
                  ) > 0
            ) THEN
                blocker_reason := 'No positive, sellable stock is recorded at an approved merchant. Record a verified quantity and retry.';
            ELSE
                blocker_reason := 'Stock exists but is not eligible for this order. Check merchant hours, acceptance, pickup pin, delivery radius, holds, expiry, and compliance.';
            END IF;

            unallocated_items := unallocated_items || jsonb_build_array(jsonb_build_object(
                'order_item_id', item_record.id,
                'product_id', item_record.product_id,
                'product_name', coalesce(item_record.product_name, format('Product %s', item_record.product_id)),
                'requested_quantity', item_record.quantity,
                'allocated_quantity', allocated_quantity,
                'reason', blocker_reason
            ));
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', target_order.id,
        'retried_items', retried_items,
        'fully_allocated', retried_items > 0 AND jsonb_array_length(unallocated_items) = 0,
        'unallocated_items', unallocated_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.retry_paid_order_merchant_allocation(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_paid_order_merchant_allocation(BIGINT, TEXT)
    TO service_role;

CREATE TABLE IF NOT EXISTS public.dispatch_order_line_repairs (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_item_id BIGINT NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
    previous_product_id BIGINT,
    corrected_product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    saved_unit_price NUMERIC NOT NULL,
    customer_confirmation_note TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_order_line_repairs_order_idx
    ON public.dispatch_order_line_repairs(order_id, created_at DESC);
ALTER TABLE public.dispatch_order_line_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dispatch_order_line_repairs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dispatch_order_line_repairs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dispatch_order_line_repairs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.repair_unlinked_order_item(
    p_order_item_id BIGINT,
    p_product_id BIGINT,
    p_customer_confirmation_note TEXT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    item_row public.order_items%ROWTYPE;
    order_row public.orders%ROWTYPE;
    initial_order_id public.order_items.order_id%TYPE;
    product_row public.products%ROWTYPE;
    repair_id BIGINT;
BEGIN
    IF p_order_item_id IS NULL OR p_product_id IS NULL
       OR char_length(trim(coalesce(p_actor, ''))) < 1
       OR char_length(trim(coalesce(p_customer_confirmation_note, ''))) NOT BETWEEN 8 AND 500 THEN
        RAISE EXCEPTION 'A product, administrator identity, and customer-confirmation note of 8 to 500 characters are required.';
    END IF;

    SELECT order_id
    INTO initial_order_id
    FROM public.order_items
    WHERE id = p_order_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item not found.';
    END IF;

    SELECT * INTO order_row
    FROM public.orders
    WHERE id = initial_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent order not found.';
    END IF;

    SELECT * INTO item_row
    FROM public.order_items
    WHERE id = p_order_item_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item not found.';
    END IF;
    IF item_row.order_id <> order_row.id THEN
        RAISE EXCEPTION 'Order item changed while it was being reviewed.';
    END IF;
    IF item_row.product_id IS NOT NULL THEN
        RAISE EXCEPTION 'This order item is already linked to a catalog product.';
    END IF;
    IF coalesce(item_row.quantity, 0) < 1
       OR item_row.unit_price IS NULL
       OR item_row.unit_price < 0 THEN
        RAISE EXCEPTION 'Order item quantity or saved checkout price is invalid and requires manual review.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.merchant_order_item_trace trace
        WHERE trace.order_item_id = item_row.id
    ) OR EXISTS (
        SELECT 1 FROM public.merchant_inventory_movements movement
        WHERE movement.order_item_id = item_row.id
    ) THEN
        RAISE EXCEPTION 'This order item has inventory history. It cannot be repaired through this flow.';
    END IF;

    IF order_row.rider_phone IS NOT NULL
       OR lower(coalesce(order_row.status, '')) IN ('dispatched', 'out for delivery', 'delivered', 'cancelled', 'refunded') THEN
        RAISE EXCEPTION 'Only an unassigned, active order can have an unlinked item corrected.';
    END IF;
    IF NOT (
        (lower(coalesce(order_row.payment_method, '')) IN ('cod', 'cash on delivery')
            AND lower(coalesce(order_row.status, '')) = 'confirmed'
            AND order_row.payment_verified_at IS NULL)
        OR (
            lower(coalesce(order_row.status, '')) = 'paid'
            AND order_row.payment_verified_at IS NOT NULL
            AND lower(coalesce(order_row.payment_method, '')) IN ('paystack', 'payhero')
            AND order_row.checkout_request_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.payment_confirmations confirmation
                WHERE confirmation.order_id = order_row.id
                  AND confirmation.provider = CASE
                      WHEN lower(order_row.payment_method) = 'payhero' THEN 'PayHero'
                      ELSE 'Paystack'
                  END
                  AND confirmation.reference = order_row.checkout_request_id
                  AND confirmation.amount_kobo = round(order_row.total_price * 100)::BIGINT
                  AND confirmation.currency = 'KES'
            )
        )
    ) THEN
        RAISE EXCEPTION 'Only a confirmed COD order or a server-verified online order can be corrected for dispatch.';
    END IF;

    SELECT * INTO product_row
    FROM public.products
    WHERE id = p_product_id
      AND status = 'Live';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Choose a live catalog product.';
    END IF;

    INSERT INTO public.dispatch_order_line_repairs (
        order_id, order_item_id, previous_product_id, corrected_product_id,
        quantity, saved_unit_price, customer_confirmation_note, actor
    ) VALUES (
        order_row.id, item_row.id, item_row.product_id, product_row.id,
        item_row.quantity, item_row.unit_price,
        trim(p_customer_confirmation_note), trim(p_actor)
    )
    RETURNING id INTO repair_id;

    UPDATE public.order_items
    SET product_id = product_row.id
    WHERE id = item_row.id
      AND product_id IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item changed while it was being reviewed.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'repair_id', repair_id,
        'order_id', order_row.id,
        'order_item_id', item_row.id,
        'product_id', product_row.id,
        'product_name', product_row.name,
        'quantity', item_row.quantity,
        'saved_unit_price', item_row.unit_price
    );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_unlinked_order_item(BIGINT, BIGINT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_unlinked_order_item(BIGINT, BIGINT, TEXT, TEXT)
    TO service_role;

NOTIFY pgrst, 'reload schema';
