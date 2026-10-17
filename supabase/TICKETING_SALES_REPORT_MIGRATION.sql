-- Ticketing-only financial reporting and idempotent failed-checkout handling.
-- Apply after TICKETING_COMMERCE_MIGRATION.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ticketing_fail_checkout(
    p_payment_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_attempt public.ticketing_payment_attempts%ROWTYPE;
    v_order public.ticketing_orders%ROWTYPE;
BEGIN
    IF p_payment_reference IS NULL OR length(p_payment_reference) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Invalid ticket payment reference.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
    FROM public.ticketing_payment_attempts
    WHERE provider = 'paystack'
      AND provider_reference = p_payment_reference
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket payment attempt was not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_order
    FROM public.ticketing_orders
    WHERE id = v_attempt.order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket order was not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_attempt.status IN ('succeeded', 'reconciliation_required')
       OR v_order.status IN ('paid', 'reconciliation_required') THEN
        RETURN jsonb_build_object('status', v_order.status, 'order_id', v_order.id, 'already_processed', true);
    END IF;
    IF v_attempt.status = 'failed' AND v_order.status = 'payment_failed' THEN
        RETURN jsonb_build_object('status', 'payment_failed', 'order_id', v_order.id, 'already_processed', true);
    END IF;
    IF v_attempt.status <> 'pending' OR v_order.status <> 'pending_payment' THEN
        RAISE EXCEPTION 'Ticket payment is not pending.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.ticketing_payment_attempts
    SET status = 'failed', updated_at = now()
    WHERE id = v_attempt.id;
    UPDATE public.ticketing_orders
    SET status = 'payment_failed', updated_at = now()
    WHERE id = v_order.id;
    UPDATE public.ticketing_reservations
    SET status = 'released', updated_at = now()
    WHERE id = v_order.reservation_id
      AND status = 'reserved';

    RETURN jsonb_build_object('status', 'payment_failed', 'order_id', v_order.id);
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_fail_checkout(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_fail_checkout(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.ticketing_admin_sales_report(
    p_since TIMESTAMPTZ DEFAULT NULL,
    p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_summary JSONB;
    v_by_event JSONB;
    v_recent_orders JSONB;
    v_refunded_minor NUMERIC;
BEGIN
    IF p_since IS NOT NULL AND p_until IS NOT NULL AND p_since >= p_until THEN
        RAISE EXCEPTION 'The report date range is invalid.' USING ERRCODE = '22023';
    END IF;

    WITH paid_orders AS (
        SELECT orders.id, orders.event_id, orders.reference, orders.currency,
               orders.subtotal_minor, orders.fees_minor, orders.discount_minor,
               orders.total_minor, orders.paid_at, events.title AS event_title
        FROM public.ticketing_orders AS orders
        JOIN public.ticketing_events AS events ON events.id = orders.event_id
        WHERE orders.status = 'paid'
          AND orders.paid_at IS NOT NULL
          AND (p_since IS NULL OR orders.paid_at >= p_since)
          AND (p_until IS NULL OR orders.paid_at < p_until)
    ),
    order_quantities AS (
        SELECT items.order_id, sum(items.quantity)::BIGINT AS quantity
        FROM public.ticketing_order_items AS items
        JOIN paid_orders ON paid_orders.id = items.order_id
        GROUP BY items.order_id
    )
    SELECT jsonb_build_object(
        'paidOrders', count(*)::BIGINT,
        'ticketsSold', COALESCE(sum(order_quantities.quantity), 0)::BIGINT,
        'grossSalesMinor', COALESCE(sum(paid_orders.subtotal_minor), 0)::TEXT,
        'serviceFeesMinor', COALESCE(sum(paid_orders.fees_minor), 0)::TEXT,
        'discountsMinor', COALESCE(sum(paid_orders.discount_minor), 0)::TEXT,
        'collectedMinor', COALESCE(sum(paid_orders.total_minor), 0)::TEXT,
        'currency', 'KES'
    )
    INTO v_summary
    FROM paid_orders
    LEFT JOIN order_quantities ON order_quantities.order_id = paid_orders.id;

    WITH paid_orders AS (
        SELECT orders.id, orders.event_id, orders.currency,
               orders.subtotal_minor, orders.fees_minor, orders.discount_minor,
               orders.total_minor, events.title AS event_title
        FROM public.ticketing_orders AS orders
        JOIN public.ticketing_events AS events ON events.id = orders.event_id
        WHERE orders.status = 'paid'
          AND orders.paid_at IS NOT NULL
          AND (p_since IS NULL OR orders.paid_at >= p_since)
          AND (p_until IS NULL OR orders.paid_at < p_until)
    ),
    order_quantities AS (
        SELECT items.order_id, sum(items.quantity)::BIGINT AS quantity
        FROM public.ticketing_order_items AS items
        JOIN paid_orders ON paid_orders.id = items.order_id
        GROUP BY items.order_id
    )
    SELECT COALESCE(jsonb_agg(event_totals.item ORDER BY event_totals.event_title), '[]'::JSONB)
    INTO v_by_event
    FROM (
        SELECT paid_orders.event_id, paid_orders.event_title,
               jsonb_build_object(
                   'eventId', paid_orders.event_id,
                   'eventTitle', paid_orders.event_title,
                   'paidOrders', count(*)::BIGINT,
                   'ticketsSold', COALESCE(sum(order_quantities.quantity), 0)::BIGINT,
                   'grossSalesMinor', COALESCE(sum(paid_orders.subtotal_minor), 0)::TEXT,
                   'serviceFeesMinor', COALESCE(sum(paid_orders.fees_minor), 0)::TEXT,
                   'discountsMinor', COALESCE(sum(paid_orders.discount_minor), 0)::TEXT,
                   'collectedMinor', COALESCE(sum(paid_orders.total_minor), 0)::TEXT,
                   'currency', 'KES'
               ) AS item
        FROM paid_orders
        LEFT JOIN order_quantities ON order_quantities.order_id = paid_orders.id
        GROUP BY paid_orders.event_id, paid_orders.event_title
    ) AS event_totals;

    WITH paid_orders AS (
        SELECT orders.id, orders.event_id, orders.reference, orders.currency,
               orders.subtotal_minor, orders.fees_minor, orders.discount_minor,
               orders.total_minor, orders.paid_at, events.title AS event_title
        FROM public.ticketing_orders AS orders
        JOIN public.ticketing_events AS events ON events.id = orders.event_id
        WHERE orders.status = 'paid'
          AND orders.paid_at IS NOT NULL
          AND (p_since IS NULL OR orders.paid_at >= p_since)
          AND (p_until IS NULL OR orders.paid_at < p_until)
    ),
    order_quantities AS (
        SELECT items.order_id, sum(items.quantity)::BIGINT AS quantity
        FROM public.ticketing_order_items AS items
        JOIN paid_orders ON paid_orders.id = items.order_id
        GROUP BY items.order_id
    )
    SELECT COALESCE(jsonb_agg(recent.item ORDER BY recent.paid_at DESC), '[]'::JSONB)
    INTO v_recent_orders
    FROM (
        SELECT paid_orders.paid_at,
               jsonb_build_object(
                   'reference', paid_orders.reference,
                   'eventTitle', paid_orders.event_title,
                   'tickets', COALESCE(order_quantities.quantity, 0),
                   'grossSalesMinor', paid_orders.subtotal_minor::TEXT,
                   'serviceFeesMinor', paid_orders.fees_minor::TEXT,
                   'discountsMinor', paid_orders.discount_minor::TEXT,
                   'collectedMinor', paid_orders.total_minor::TEXT,
                   'currency', paid_orders.currency,
                   'paidAt', paid_orders.paid_at
               ) AS item
        FROM paid_orders
        LEFT JOIN order_quantities ON order_quantities.order_id = paid_orders.id
        ORDER BY paid_orders.paid_at DESC
        LIMIT 50
    ) AS recent;

    SELECT COALESCE(sum(refunds.amount_minor), 0)
    INTO v_refunded_minor
    FROM public.ticketing_refunds AS refunds
    JOIN public.ticketing_orders AS orders ON orders.id = refunds.order_id
    WHERE orders.status = 'paid'
      AND refunds.status = 'succeeded'
      AND (p_since IS NULL OR orders.paid_at >= p_since)
      AND (p_until IS NULL OR orders.paid_at < p_until);

    v_summary := v_summary || jsonb_build_object(
        'refundedMinor', v_refunded_minor::TEXT,
        'netAfterRefundsMinor',
            ((v_summary ->> 'collectedMinor')::NUMERIC - v_refunded_minor)::TEXT
    );

    RETURN jsonb_build_object(
        'summary', v_summary,
        'byEvent', v_by_event,
        'recentOrders', v_recent_orders,
        'generatedAt', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_admin_sales_report(TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_admin_sales_report(TIMESTAMPTZ, TIMESTAMPTZ)
    TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
