-- Hourly customer traffic and order demand plus approved merchant schedules.
-- Run after FINAL_ESTABLISHMENT_SQL.sql and MERCHANT_OPERATIONS_MIGRATION.sql.

DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(required.table_name, ', ')
    INTO missing_tables
    FROM (VALUES
        ('public.analytics_events'),
        ('public.orders'),
        ('public.customer_sessions'),
        ('public.merchant_applications')
    ) AS required(table_name)
    WHERE to_regclass(required.table_name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Customer time analytics requires core tables: %.', missing_tables
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql and supabase/MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'customer_sessions'
          AND column_name = 'analytics_consent'
    ) THEN
        RAISE EXCEPTION 'Customer time analytics requires customer_sessions.analytics_consent.'
            USING HINT = 'Run supabase/SECURITY_HARDENING_MIGRATION.sql and supabase/LIVE_CUSTOMER_JOURNEY_MIGRATION.sql first.';
    END IF;

    IF to_regprocedure('public.merchant_is_open(jsonb,timestamp with time zone)') IS NULL THEN
        RAISE EXCEPTION 'Customer time analytics requires public.merchant_is_open(jsonb, timestamptz).'
            USING HINT = 'Run supabase/MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS analytics_events_customer_funnel_idx
    ON public.analytics_events (event_name, created_at DESC, session_id)
    WHERE event_name IN ('PAGE_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_START')
      AND session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_time_created_at_idx
    ON public.orders (created_at DESC);

CREATE OR REPLACE FUNCTION public.get_customer_time_insights(p_days INTEGER DEFAULT 90)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH bounds AS (
    SELECT
        greatest(1, least(coalesce(p_days, 90), 90)) AS days,
        (date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi')
            - make_interval(days => greatest(1, least(coalesce(p_days, 90), 90))))
            AT TIME ZONE 'Africa/Nairobi' AS since_at,
        date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi')
            AT TIME ZONE 'Africa/Nairobi' AS period_end
),
calendar AS (
    SELECT (date_values.value AT TIME ZONE 'Africa/Nairobi')::DATE AS local_date
    FROM bounds
    CROSS JOIN LATERAL generate_series(
        bounds.since_at,
        bounds.period_end - interval '1 day',
        interval '1 day'
    ) AS date_values(value)
),
weekday_samples AS (
    SELECT extract(isodow FROM local_date)::INTEGER AS weekday, count(*)::INTEGER AS sample_days
    FROM calendar
    GROUP BY 1
),
weekdays AS (
    SELECT day_number.weekday, coalesce(samples.sample_days, 0) AS sample_days
    FROM generate_series(1, 7) AS day_number(weekday)
    LEFT JOIN weekday_samples samples USING (weekday)
),
hours AS (
    SELECT generate_series(0, 23) AS hour
),
consented_sessions AS (
    SELECT DISTINCT event.session_id
    FROM public.analytics_events event
    JOIN public.customer_sessions customer_session
      ON customer_session.id = event.session_id
     AND customer_session.analytics_consent = true
    CROSS JOIN bounds
    WHERE event.event_name = 'PAGE_VIEW'
      AND event.session_id IS NOT NULL
      AND event.created_at >= bounds.since_at
      AND event.created_at < bounds.period_end
),
visit_buckets AS (
    SELECT
        (event.created_at AT TIME ZONE 'Africa/Nairobi')::DATE AS local_date,
        extract(hour FROM event.created_at AT TIME ZONE 'Africa/Nairobi')::INTEGER AS hour,
        count(DISTINCT event.session_id)::NUMERIC AS visitors
    FROM public.analytics_events event
    JOIN consented_sessions session ON session.session_id = event.session_id
    CROSS JOIN bounds
    WHERE event.event_name = 'PAGE_VIEW'
      AND event.session_id IS NOT NULL
      AND event.created_at >= bounds.since_at
      AND event.created_at < bounds.period_end
    GROUP BY 1, 2
),
order_buckets AS (
    SELECT
        (order_record.created_at AT TIME ZONE 'Africa/Nairobi')::DATE AS local_date,
        extract(hour FROM order_record.created_at AT TIME ZONE 'Africa/Nairobi')::INTEGER AS hour,
        count(*) FILTER (
            WHERE lower(coalesce(order_record.status, '')) NOT IN ('cancelled', 'canceled', 'failed')
        )::NUMERIC AS orders,
        coalesce(sum(order_record.total_price) FILTER (
            WHERE lower(coalesce(order_record.status, '')) IN ('paid', 'delivered')
        ), 0)::NUMERIC AS revenue
    FROM public.orders order_record
    CROSS JOIN bounds
    WHERE order_record.created_at >= bounds.since_at
      AND order_record.created_at < bounds.period_end
    GROUP BY 1, 2
),
daily_activity AS (
    SELECT
        calendar.local_date,
        extract(isodow FROM calendar.local_date)::INTEGER AS weekday,
        hours.hour,
        coalesce(visits.visitors, 0)::NUMERIC AS visitors,
        coalesce(orders.orders, 0)::NUMERIC AS orders,
        coalesce(orders.revenue, 0)::NUMERIC AS revenue
    FROM calendar
    CROSS JOIN hours
    LEFT JOIN visit_buckets visits
        ON visits.local_date = calendar.local_date
       AND visits.hour = hours.hour
    LEFT JOIN order_buckets orders
        ON orders.local_date = calendar.local_date
       AND orders.hour = hours.hour
),
heatmap_values AS (
    SELECT
        activity.weekday,
        activity.hour,
        round(sum(activity.visitors) / weekday.sample_days, 1) AS visitors,
        round(sum(activity.orders) / weekday.sample_days, 1) AS orders,
        round(sum(activity.revenue) / weekday.sample_days, 2) AS revenue
    FROM daily_activity activity
    JOIN weekdays weekday
      ON weekday.weekday = activity.weekday
     AND weekday.sample_days > 0
    GROUP BY activity.weekday, activity.hour, weekday.sample_days
),
hourly AS (
    SELECT
        activity.hour,
        round(sum(activity.visitors) / bounds.days, 1) AS visitors,
        round(sum(activity.orders) / bounds.days, 1) AS orders,
        round(sum(activity.revenue) / bounds.days, 2) AS revenue
    FROM daily_activity activity
    CROSS JOIN bounds
    GROUP BY activity.hour, bounds.days
),
weekday_totals AS (
    SELECT
        activity.weekday,
        weekday.sample_days,
        round(sum(activity.visitors) / weekday.sample_days, 1) AS visitors,
        round(sum(activity.orders) / weekday.sample_days, 1) AS orders,
        round(sum(activity.revenue) / weekday.sample_days, 2) AS revenue
    FROM daily_activity activity
    JOIN weekdays weekday
      ON weekday.weekday = activity.weekday
     AND weekday.sample_days > 0
    GROUP BY activity.weekday, weekday.sample_days
),
funnel_counts AS (
    SELECT
        (SELECT count(*) FROM consented_sessions) AS visitors,
        count(DISTINCT event.session_id) FILTER (WHERE event.event_name = 'PRODUCT_VIEW') AS product_viewers,
        count(DISTINCT event.session_id) FILTER (WHERE event.event_name = 'ADD_TO_CART') AS cart_sessions,
        count(DISTINCT event.session_id) FILTER (WHERE event.event_name = 'CHECKOUT_START') AS checkout_sessions,
        (SELECT count(DISTINCT order_record.session_id)
         FROM public.orders order_record
         JOIN consented_sessions session ON session.session_id = order_record.session_id
         CROSS JOIN bounds
         WHERE order_record.created_at >= bounds.since_at
           AND order_record.created_at < bounds.period_end
           AND lower(coalesce(order_record.status, '')) IN ('paid', 'delivered')
        ) AS paying_sessions
    FROM public.analytics_events event
    JOIN consented_sessions session ON session.session_id = event.session_id
    CROSS JOIN bounds
    WHERE event.created_at >= bounds.since_at
      AND event.created_at < bounds.period_end
      AND event.event_name IN ('PAGE_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_START')
),
traffic_sources AS (
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object('source', source, 'sessions', sessions)
            ORDER BY sessions DESC, source
        ),
        '[]'::JSONB
    ) AS entries
    FROM (
        SELECT
            CASE
                WHEN lower(trim(coalesce(customer_session.source_channel, ''))) = 'direct'
                    THEN 'Unattributed (legacy source)'
                ELSE coalesce(nullif(trim(customer_session.source_channel), ''), 'Unattributed')
            END AS source,
            count(DISTINCT session.session_id) AS sessions
        FROM consented_sessions session
        LEFT JOIN public.customer_sessions customer_session ON customer_session.id = session.session_id
        GROUP BY 1
    ) sources
),
shops AS (
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', application.id,
                'name', coalesce(nullif(application.trading_name, ''), application.business_name),
                'acceptingOrders', application.accepting_orders,
                'openNow', public.merchant_is_open(application.operating_hours, now()),
                'operatingHours', application.operating_hours
            )
            ORDER BY coalesce(nullif(application.trading_name, ''), application.business_name)
        ),
        '[]'::JSONB
    ) AS entries
    FROM public.merchant_applications application
    WHERE application.status = 'approved'
)
SELECT jsonb_build_object(
    'days', bounds.days,
    'timezone', 'Africa/Nairobi',
    'hours', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'hour', hourly.hour,
                'visitors', hourly.visitors,
                'orders', hourly.orders,
                'revenue', hourly.revenue
            )
            ORDER BY hourly.hour
        )
        FROM hourly
    ),
    'heatmap', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'weekday', weekday.weekday,
                'hour', hours.hour,
                'visitors', coalesce(heatmap_values.visitors, 0),
                'orders', coalesce(heatmap_values.orders, 0),
                'revenue', coalesce(heatmap_values.revenue, 0)
            )
            ORDER BY weekday.weekday, hours.hour
        )
        FROM weekdays weekday
        CROSS JOIN hours
        LEFT JOIN heatmap_values
            ON heatmap_values.weekday = weekday.weekday
           AND heatmap_values.hour = hours.hour
    ),
    'weekdays', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'weekday', weekdays.weekday,
                'sampleDays', weekdays.sample_days,
                'visitors', coalesce(weekday_totals.visitors, 0),
                'orders', coalesce(weekday_totals.orders, 0),
                'revenue', coalesce(weekday_totals.revenue, 0)
            )
            ORDER BY weekdays.weekday
        )
        FROM weekdays
        LEFT JOIN weekday_totals USING (weekday)
    ),
    'funnel', (
        SELECT jsonb_build_array(
            jsonb_build_object(
                'label', 'Visited storefront',
                'sessions', funnel.visitors,
                'percentage', CASE WHEN funnel.visitors = 0 THEN NULL ELSE 100.0 END
            ),
            jsonb_build_object(
                'label', 'Viewed a product',
                'sessions', funnel.product_viewers,
                'percentage', CASE WHEN funnel.visitors = 0 THEN NULL ELSE round(100.0 * funnel.product_viewers / funnel.visitors, 1) END
            ),
            jsonb_build_object(
                'label', 'Added to cart',
                'sessions', funnel.cart_sessions,
                'percentage', CASE WHEN funnel.visitors = 0 THEN NULL ELSE round(100.0 * funnel.cart_sessions / funnel.visitors, 1) END
            ),
            jsonb_build_object(
                'label', 'Started checkout',
                'sessions', funnel.checkout_sessions,
                'percentage', CASE WHEN funnel.visitors = 0 THEN NULL ELSE round(100.0 * funnel.checkout_sessions / funnel.visitors, 1) END
            ),
            jsonb_build_object(
                'label', 'Paid or delivered',
                'sessions', funnel.paying_sessions,
                'percentage', CASE WHEN funnel.visitors = 0 THEN NULL ELSE round(100.0 * funnel.paying_sessions / funnel.visitors, 1) END
            )
        )
        FROM funnel_counts funnel
    ),
    'trafficSources', traffic_sources.entries,
    'shops', shops.entries
)
FROM bounds
CROSS JOIN shops
CROSS JOIN traffic_sources;
$$;

REVOKE ALL ON FUNCTION public.get_customer_time_insights(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_time_insights(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
