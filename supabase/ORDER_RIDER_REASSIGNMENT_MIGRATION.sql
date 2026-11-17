-- Apply after DISPATCH_MIGRATION.sql and COD_RIDER_DISPATCH_MIGRATION.sql.
-- Reassignment is deliberately limited to orders that have not left the merchant.
BEGIN;

CREATE OR REPLACE FUNCTION public.reassign_dispatched_order_rider(
    p_order_id BIGINT,
    p_previous_rider_phone TEXT,
    p_rider_phone TEXT,
    p_actor TEXT,
    p_reason TEXT,
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
    vendors UUID[] := ARRAY[]::UUID[];
    new_decision_id BIGINT;
BEGIN
    IF p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RETURN jsonb_build_object('success', false, 'code', 'ACTOR_REQUIRED', 'error', 'An administrator identity is required.');
    END IF;
    IF p_reason IS NULL OR char_length(trim(p_reason)) < 8 OR char_length(trim(p_reason)) > 500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED', 'error', 'Enter a reassignment reason between 8 and 500 characters.');
    END IF;

    SELECT * INTO target_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Order not found.');
    END IF;
    IF target_order.status <> 'Dispatched' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_PRE_PICKUP',
            'error', 'A rider can only be replaced before pickup, while the order is Dispatched.'
        );
    END IF;
    IF target_order.rider_phone IS NULL OR target_order.rider_phone IS DISTINCT FROM p_previous_rider_phone THEN
        RETURN jsonb_build_object('success', false, 'code', 'ASSIGNMENT_CHANGED', 'error', 'The rider assignment changed. Refresh before retrying.');
    END IF;
    IF p_rider_phone IS NULL OR p_rider_phone = target_order.rider_phone THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_UNCHANGED', 'error', 'Choose a different rider.');
    END IF;
    IF NOT coalesce((p_criteria->>'vendor_ready')::BOOLEAN, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FULFILLMENT_UNAVAILABLE',
            'error', 'Merchant fulfillment must remain verified before replacing a rider.'
        );
    END IF;

    IF lower(coalesce(target_order.payment_method, '')) IN ('cod', 'cash on delivery') THEN
        IF target_order.payment_verified_at IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_STATE_CHANGED', 'error', 'The cash-on-delivery payment state changed.');
        END IF;
    ELSIF lower(coalesce(target_order.payment_method, '')) IN ('paystack', 'payhero') THEN
        IF target_order.payment_verified_at IS NULL
           OR target_order.checkout_request_id IS NULL
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
            RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_CONFIRMED', 'error', 'Verified online payment is required.');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_METHOD_UNSUPPORTED', 'error', 'The payment method is not eligible for rider reassignment.');
    END IF;

    PERFORM 1
    FROM public.rider_status
    WHERE rider_phone IN (target_order.rider_phone, p_rider_phone)
    ORDER BY rider_phone
    FOR UPDATE;

    SELECT * INTO target_rider
    FROM public.rider_status
    WHERE rider_phone = p_rider_phone
    FOR UPDATE;
    IF NOT FOUND OR coalesce(target_rider.verification_status, '') <> 'Verified' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_NOT_VERIFIED', 'error', 'Only verified riders can be assigned.');
    END IF;
    IF coalesce(target_rider.status, '') NOT IN ('Idle', 'Delivering') THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_OFFLINE', 'error', 'The replacement rider is not online and available.');
    END IF;
    IF target_rider.updated_at IS NULL OR target_rider.updated_at < now() - INTERVAL '15 minutes' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_STALE', 'error', 'The replacement rider has no recent heartbeat.');
    END IF;

    SELECT count(*)::INTEGER INTO active_load
    FROM public.orders
    WHERE rider_phone = p_rider_phone
      AND status IN ('Dispatched', 'Out for Delivery');
    max_load := greatest(coalesce(target_rider.max_deliveries, 3), 1);
    IF active_load >= max_load THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_AT_CAPACITY', 'error', 'The replacement rider is at the active delivery limit.');
    END IF;

    IF jsonb_typeof(p_criteria->'selected_vendor_ids') = 'array' THEN
        SELECT coalesce(array_agg(value::UUID), ARRAY[]::UUID[])
        INTO vendors
        FROM jsonb_array_elements_text(p_criteria->'selected_vendor_ids') AS value;
    END IF;

    UPDATE public.orders
    SET rider_name = target_rider.rider_name,
        rider_phone = target_rider.rider_phone,
        updated_at = now()
    WHERE id = target_order.id;

    UPDATE public.rider_status
    SET status = 'Delivering', updated_at = now()
    WHERE rider_phone = target_rider.rider_phone;

    UPDATE public.rider_status old_rider
    SET status = 'Idle', updated_at = now()
    WHERE old_rider.rider_phone = target_order.rider_phone
      AND old_rider.status = 'Delivering'
      AND NOT EXISTS (
          SELECT 1 FROM public.orders remaining
          WHERE remaining.rider_phone = old_rider.rider_phone
            AND remaining.id <> target_order.id
            AND remaining.status IN ('Dispatched', 'Out for Delivery')
      );

    INSERT INTO public.dispatch_decisions (
        order_id, selected_rider_phone, selected_rider_name, selected_vendor_ids,
        decision_type, criteria, chosen_by, override_reason
    ) VALUES (
        target_order.id, target_rider.rider_phone, target_rider.rider_name, vendors,
        'admin_override',
        coalesce(p_criteria, '{}'::JSONB)
            || jsonb_build_object('reassigned_from_rider_phone', target_order.rider_phone),
        trim(p_actor),
        trim(p_reason)
    ) RETURNING id INTO new_decision_id;

    RETURN jsonb_build_object(
        'success', true,
        'decision_id', new_decision_id,
        'order_id', target_order.id,
        'previous_rider_phone', target_order.rider_phone,
        'rider_phone', target_rider.rider_phone,
        'rider_name', target_rider.rider_name,
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_dispatched_order_rider(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_dispatched_order_rider(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB)
    TO service_role;

COMMIT;
