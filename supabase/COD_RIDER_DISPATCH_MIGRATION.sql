-- Enable dispatch for confirmed Cash-on-Delivery orders.
-- Apply after DISPATCH_MIGRATION.sql and MERCHANT_OPERATIONS_MIGRATION.sql.
-- COD remains unpaid until the assigned verified rider records doorstep payment.

CREATE OR REPLACE FUNCTION public.allocate_tracked_product_on_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_order public.orders%ROWTYPE;
    has_payment_proof BOOLEAN := false;
    remaining_quantity INTEGER := coalesce(NEW.quantity, 1);
    batch_record RECORD;
    available_quantity INTEGER;
    allocation_quantity INTEGER;
    has_tracked_batches BOOLEAN;
BEGIN
    IF NEW.product_id IS NULL OR remaining_quantity < 1 THEN
        RETURN NEW;
    END IF;

    SELECT orders.* INTO parent_order
    FROM public.orders orders
    WHERE orders.id = NEW.order_id;

    IF NOT FOUND
       OR NOT (
           (
               lower(coalesce(parent_order.payment_method, '')) = 'cod'
               AND lower(coalesce(parent_order.status, '')) IN ('pending', 'placed', 'confirmed')
               AND parent_order.payment_verified_at IS NULL
           )
           OR (
               lower(coalesce(parent_order.status, '')) = 'paid'
               AND parent_order.payment_verified_at IS NOT NULL
               AND lower(coalesce(parent_order.payment_method, '')) IN ('paystack', 'payhero')
           )
       )
       OR parent_order.latitude IS NULL
       OR parent_order.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    IF lower(coalesce(parent_order.payment_method, '')) = 'cod' THEN
        has_payment_proof := true;
    ELSE
        EXECUTE
            'SELECT EXISTS (
                SELECT 1
                FROM public.payment_confirmations confirmation
                WHERE confirmation.order_id = $1
                  AND confirmation.provider = CASE
                      WHEN lower($4) = ''payhero'' THEN ''PayHero''
                      ELSE ''Paystack''
                  END
                  AND confirmation.reference = $2
                  AND confirmation.amount_kobo = round($3 * 100)::BIGINT
                  AND confirmation.currency = ''KES''
            )'
        INTO has_payment_proof
        USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price, parent_order.payment_method;
    END IF;

    IF NOT has_payment_proof THEN
        RETURN NEW;
    END IF;

    SELECT greatest(
        coalesce(NEW.quantity, 1)
        - coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0),
        0
    )::INTEGER
    INTO remaining_quantity
    FROM public.merchant_order_item_trace trace
    JOIN public.merchant_product_batches traced_batch ON traced_batch.id = trace.batch_id
    JOIN public.merchant_applications traced_merchant ON traced_merchant.id = traced_batch.application_id
    LEFT JOIN LATERAL (
        SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
        FROM public.merchant_inventory_movements movement
        WHERE movement.batch_id = trace.batch_id
          AND movement.order_item_id = trace.order_item_id
          AND movement.movement_type = 'returned'
          AND movement.note = 'Returned for offline merchant redistribution'
    ) returned ON true
    WHERE trace.order_item_id = NEW.id
      AND traced_merchant.status = 'approved'
      AND (traced_batch.expiry_at IS NULL OR traced_batch.expiry_at >= CURRENT_DATE)
      AND NOT EXISTS (
          SELECT 1 FROM public.merchant_batch_holds hold
          WHERE hold.batch_id = traced_batch.id AND hold.released_at IS NULL
      )
      AND (
          (
              traced_merchant.accepting_orders
              AND public.merchant_is_open(traced_merchant.operating_hours, now())
              AND NOT EXISTS (
                  SELECT 1 FROM public.merchant_fulfillment_events rejected
                  WHERE rejected.order_id = parent_order.id
                    AND rejected.application_id = traced_merchant.id
                    AND rejected.event_type = 'rejected'
              )
          )
          OR EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events accepted
              WHERE accepted.order_id = parent_order.id
                AND accepted.application_id = traced_merchant.id
                AND accepted.event_type = 'accepted'
          )
      );
    IF remaining_quantity <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_product_batches
        WHERE product_id = NEW.product_id
    ) INTO has_tracked_batches;
    IF NOT has_tracked_batches THEN
        RETURN NEW;
    END IF;

    FOR batch_record IN
        SELECT b.id, b.expiry_at, b.received_at
        FROM public.merchant_product_batches b
        JOIN public.merchant_applications application ON application.id = b.application_id
        WHERE b.product_id = NEW.product_id
          AND application.status = 'approved'
          AND application.accepting_orders
          AND public.merchant_is_open(application.operating_hours, now())
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events rejected
              WHERE rejected.order_id = parent_order.id
                AND rejected.application_id = application.id
                AND rejected.event_type = 'rejected'
          )
          AND application.latitude IS NOT NULL
          AND application.longitude IS NOT NULL
          AND application.delivery_radius_km IS NOT NULL
          AND 6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - parent_order.latitude) / 2), 2)
              + cos(radians(parent_order.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - parent_order.longitude) / 2), 2)
          )) <= application.delivery_radius_km
          AND (b.expiry_at IS NULL OR b.expiry_at >= CURRENT_DATE)
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_batch_holds hold
              WHERE hold.batch_id = b.id AND hold.released_at IS NULL
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_document_requirements requirement
              WHERE requirement.is_active
                AND requirement.is_required
                AND requirement.id = (
                    SELECT candidate.id
                    FROM public.merchant_document_requirements candidate
                    WHERE candidate.document_type = requirement.document_type
                      AND candidate.business_type IN ('*', application.business_type)
                      AND candidate.county IN ('*', lower(application.county))
                    ORDER BY
                      (candidate.business_type = application.business_type)::INTEGER * 2
                      + (candidate.county = lower(application.county))::INTEGER * 3 DESC
                    LIMIT 1
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(application.documents) document
                    WHERE document->>'type' = requirement.document_type
                      AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::DATE >= CURRENT_DATE)
                )
          )
        ORDER BY
          6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - parent_order.latitude) / 2), 2)
              + cos(radians(parent_order.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - parent_order.longitude) / 2), 2)
          )),
          b.expiry_at NULLS LAST,
          b.received_at,
          b.id
        FOR UPDATE OF b
    LOOP
        SELECT coalesce(sum(quantity_delta), 0)::INTEGER
        INTO available_quantity
        FROM public.merchant_inventory_movements
        WHERE batch_id = batch_record.id;

        IF available_quantity <= 0 THEN
            CONTINUE;
        END IF;
        allocation_quantity := least(remaining_quantity, available_quantity);
        INSERT INTO public.merchant_order_item_trace (
            order_item_id, batch_id, quantity, created_by
        ) VALUES (
            NEW.id, batch_record.id, allocation_quantity, 'dispatch allocation'
        );
        remaining_quantity := remaining_quantity - allocation_quantity;
        EXIT WHEN remaining_quantity = 0;
    END LOOP;

    IF remaining_quantity > 0
       AND lower(coalesce(parent_order.payment_method, '')) <> 'cod' THEN
        RAISE EXCEPTION 'Insufficient in-range merchant stock for paid order item %.', NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_paid_order_rider(
    p_order_id BIGINT,
    p_rider_phone TEXT,
    p_actor TEXT,
    p_is_override BOOLEAN DEFAULT false,
    p_override_reason TEXT DEFAULT NULL,
    p_criteria JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_order public.orders%ROWTYPE;
    target_rider public.rider_status%ROWTYPE;
    active_load INTEGER;
    max_load INTEGER;
    new_decision_id BIGINT;
    vendors UUID[];
BEGIN
    SELECT * INTO target_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Order not found.');
    END IF;

    IF lower(coalesce(target_order.payment_method, '')) IN ('cod', 'cash on delivery') THEN
        IF lower(coalesce(target_order.status, '')) <> 'confirmed'
           OR target_order.payment_verified_at IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'COD_ORDER_NOT_DISPATCHABLE',
                'error', 'Cash-on-delivery dispatch requires a confirmed order that has not already been marked paid.'
            );
        END IF;
    ELSE
        IF lower(coalesce(target_order.status, '')) <> 'paid'
           OR target_order.payment_verified_at IS NULL
           OR lower(coalesce(target_order.payment_method, '')) NOT IN ('paystack', 'payhero') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'PAYMENT_NOT_CONFIRMED',
                'error', 'Online dispatch is limited to server-verified Paystack or PayHero orders.'
            );
        END IF;
        IF target_order.checkout_request_id IS NULL
           OR NOT EXISTS (
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
           ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'PAYMENT_PROOF_MISSING',
                'error', 'A server-verified online payment record is required before dispatch.'
            );
        END IF;
    END IF;

    IF target_order.rider_phone IS NOT NULL
       AND target_order.status IN ('Dispatched', 'Out for Delivery', 'Delivered') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_ASSIGNED', 'error', 'This order already has a rider assignment.');
    END IF;

    IF coalesce(p_is_override, false) AND length(trim(coalesce(p_override_reason, ''))) < 8 THEN
        RETURN jsonb_build_object('success', false, 'code', 'OVERRIDE_REASON_REQUIRED', 'error', 'Enter an override reason of at least 8 characters.');
    END IF;
    IF NOT coalesce((p_criteria->>'vendor_ready')::BOOLEAN, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FULFILLMENT_UNAVAILABLE',
            'error', 'Vendor fulfillment must be verified before assigning any rider. A rider override does not bypass merchant, stock, or acceptance checks.'
        );
    END IF;

    SELECT * INTO target_rider
    FROM public.rider_status
    WHERE rider_phone = p_rider_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_NOT_FOUND', 'error', 'Selected rider was not found.');
    END IF;
    IF coalesce(target_rider.verification_status, '') <> 'Verified' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_NOT_VERIFIED', 'error', 'Only verified riders can be assigned.');
    END IF;
    IF coalesce(target_rider.status, '') NOT IN ('Idle', 'Delivering') THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_OFFLINE', 'error', 'Selected rider is not online and available.');
    END IF;
    IF target_rider.updated_at IS NULL OR target_rider.updated_at < now() - INTERVAL '15 minutes' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_STALE', 'error', 'Selected rider has no recent online heartbeat.');
    END IF;

    SELECT count(*)::INTEGER INTO active_load
    FROM public.orders
    WHERE rider_phone = p_rider_phone
      AND status IN ('Dispatched', 'Out for Delivery');
    max_load := greatest(coalesce(target_rider.max_deliveries, 3), 1);
    IF active_load >= max_load THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_AT_CAPACITY', 'error', 'Selected rider is at the active delivery limit.');
    END IF;

    vendors := ARRAY[]::UUID[];
    IF jsonb_typeof(p_criteria->'selected_vendor_ids') = 'array' THEN
        SELECT coalesce(array_agg(value::UUID), ARRAY[]::UUID[])
        INTO vendors
        FROM jsonb_array_elements_text(p_criteria->'selected_vendor_ids') AS value;
    END IF;

    UPDATE public.orders
    SET rider_name = target_rider.rider_name,
        rider_phone = target_rider.rider_phone,
        status = 'Dispatched',
        updated_at = now()
    WHERE id = target_order.id;

    UPDATE public.rider_status
    SET status = 'Delivering', updated_at = now()
    WHERE rider_phone = target_rider.rider_phone;

    INSERT INTO public.dispatch_decisions (
        order_id, selected_rider_phone, selected_rider_name, selected_vendor_ids,
        decision_type, criteria, chosen_by, override_reason
    ) VALUES (
        target_order.id, target_rider.rider_phone, target_rider.rider_name, vendors,
        CASE WHEN coalesce(p_is_override, false) THEN 'admin_override' ELSE 'recommended' END,
        coalesce(p_criteria, '{}'::JSONB),
        coalesce(nullif(trim(p_actor), ''), 'admin'),
        CASE WHEN coalesce(p_is_override, false) THEN trim(p_override_reason) ELSE NULL END
    ) RETURNING id INTO new_decision_id;

    RETURN jsonb_build_object(
        'success', true,
        'decision_id', new_decision_id,
        'order_id', target_order.id,
        'rider_phone', target_rider.rider_phone,
        'rider_name', target_rider.rider_name,
        'decision_type', CASE WHEN coalesce(p_is_override, false) THEN 'admin_override' ELSE 'recommended' END,
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_paid_order_rider(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_paid_order_rider(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO service_role;
