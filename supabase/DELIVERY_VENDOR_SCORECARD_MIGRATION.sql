-- Real merchant response and fulfilment metrics for Delivery Operations.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.merchant_applications') IS NULL
       OR to_regclass('public.merchant_fulfillment_events') IS NULL
       OR to_regclass('public.orders') IS NULL THEN
        RAISE EXCEPTION 'Delivery scorecards require merchant operations and orders.'
            USING HINT = 'Apply FINAL_ESTABLISHMENT_SQL.sql, MERCHANT_OPERATIONS_MIGRATION.sql, and DISPATCH_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS merchant_fulfillment_events_occurred_at_idx
    ON public.merchant_fulfillment_events (occurred_at DESC);

CREATE OR REPLACE VIEW public.merchant_vendor_scorecard_events
WITH (security_invoker = true)
AS
SELECT
    event.id,
    event.application_id,
    event.order_id,
    event.event_type,
    event.occurred_at,
    event.details,
    greatest(
        0,
        extract(epoch FROM (event.occurred_at - orders.created_at))
    )::INTEGER AS response_seconds
FROM public.merchant_fulfillment_events AS event
JOIN public.orders AS orders ON orders.id = event.order_id
WHERE event.event_type IN ('accepted', 'rejected');

CREATE OR REPLACE VIEW public.merchant_vendor_scorecard
WITH (security_invoker = true)
AS
WITH decisions AS (
    SELECT *
    FROM public.merchant_vendor_scorecard_events
),
activity AS (
    SELECT
        event.application_id,
        count(*) FILTER (WHERE event.event_type = 'delivered'
            AND event.occurred_at >= now() - interval '7 days')::INTEGER AS delivered_7d,
        count(*) FILTER (WHERE event.event_type = 'delivered'
            AND event.occurred_at >= now() - interval '30 days')::INTEGER AS delivered_30d,
        count(*) FILTER (WHERE event.event_type = 'exception'
            AND event.occurred_at >= now() - interval '7 days')::INTEGER AS exceptions_7d,
        count(*) FILTER (WHERE event.event_type = 'exception'
            AND event.occurred_at >= now() - interval '30 days')::INTEGER AS exceptions_30d
    FROM public.merchant_fulfillment_events AS event
    GROUP BY event.application_id
)
SELECT
    merchant.id AS application_id,
    merchant.business_name,
    merchant.town,
    merchant.accepting_orders,
    count(decision.order_id) FILTER (WHERE decision.occurred_at >= now() - interval '7 days')::INTEGER AS decisions_7d,
    count(decision.order_id) FILTER (WHERE decision.event_type = 'accepted'
        AND decision.occurred_at >= now() - interval '7 days')::INTEGER AS accepted_7d,
    count(decision.order_id) FILTER (WHERE decision.event_type = 'rejected'
        AND decision.occurred_at >= now() - interval '7 days')::INTEGER AS rejected_7d,
    round(avg(decision.response_seconds) FILTER (WHERE decision.occurred_at >= now() - interval '7 days'))::INTEGER AS avg_response_seconds_7d,
    count(decision.order_id) FILTER (WHERE decision.occurred_at >= now() - interval '30 days')::INTEGER AS decisions_30d,
    count(decision.order_id) FILTER (WHERE decision.event_type = 'accepted'
        AND decision.occurred_at >= now() - interval '30 days')::INTEGER AS accepted_30d,
    count(decision.order_id) FILTER (WHERE decision.event_type = 'rejected'
        AND decision.occurred_at >= now() - interval '30 days')::INTEGER AS rejected_30d,
    round(avg(decision.response_seconds) FILTER (WHERE decision.occurred_at >= now() - interval '30 days'))::INTEGER AS avg_response_seconds_30d,
    coalesce(activity.delivered_7d, 0) AS delivered_7d,
    coalesce(activity.delivered_30d, 0) AS delivered_30d,
    coalesce(activity.exceptions_7d, 0) AS exceptions_7d,
    coalesce(activity.exceptions_30d, 0) AS exceptions_30d
FROM public.merchant_applications AS merchant
LEFT JOIN decisions AS decision ON decision.application_id = merchant.id
LEFT JOIN activity ON activity.application_id = merchant.id
WHERE merchant.status = 'approved'
GROUP BY merchant.id, merchant.business_name, merchant.town, merchant.accepting_orders,
    activity.delivered_7d, activity.delivered_30d, activity.exceptions_7d, activity.exceptions_30d;

CREATE OR REPLACE FUNCTION public.set_merchant_order_availability_admin(
    p_application_id UUID,
    p_accepting_orders BOOLEAN,
    p_actor TEXT,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    previous_value BOOLEAN;
BEGIN
    IF p_accepting_orders IS NULL
       OR p_actor IS NULL OR length(trim(p_actor)) < 1
       OR p_reason IS NULL OR length(trim(p_reason)) < 8 OR length(trim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'A valid availability state, administrator, and reason are required.';
    END IF;

    SELECT accepting_orders INTO previous_value
    FROM public.merchant_applications
    WHERE id = p_application_id AND status = 'approved'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An approved merchant application is required.';
    END IF;

    UPDATE public.merchant_applications
    SET accepting_orders = p_accepting_orders,
        availability_updated_at = now(),
        updated_at = now()
    WHERE id = p_application_id
      AND status = 'approved';

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        'admin_availability_updated',
        trim(p_actor),
        jsonb_build_object(
            'accepting_orders', p_accepting_orders,
            'previous_accepting_orders', previous_value,
            'reason', trim(p_reason)
        )
    );

    RETURN p_accepting_orders;
END;
$$;

REVOKE ALL ON FUNCTION public.set_merchant_order_availability_admin(UUID, BOOLEAN, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_merchant_order_availability_admin(UUID, BOOLEAN, TEXT, TEXT)
    TO service_role;

REVOKE ALL ON public.merchant_vendor_scorecard_events, public.merchant_vendor_scorecard
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.merchant_vendor_scorecard_events, public.merchant_vendor_scorecard
    TO service_role;

COMMIT;
