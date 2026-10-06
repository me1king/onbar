-- Correct behavioral metrics and stop session navigation from resetting engagement.

ALTER TABLE public.customer_sessions
    ADD COLUMN IF NOT EXISTS active_time_tracking_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS active_heartbeat_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_active_time_sec INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_active_date DATE;

-- Older totals were unreliable: the former heartbeat did not record interactions
-- and page navigation could reset totals. Start trustworthy measurement at migration time.
UPDATE public.customer_sessions
SET total_active_time_sec = 0,
    active_time_tracking_started_at = now(),
    daily_active_time_sec = 0,
    active_heartbeat_count = 0,
    daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
WHERE active_time_tracking_started_at IS NULL;

ALTER TABLE public.customer_sessions
    ALTER COLUMN total_active_time_sec SET DEFAULT 0,
    ALTER COLUMN active_time_tracking_started_at SET DEFAULT now(),
    ALTER COLUMN active_heartbeat_count SET DEFAULT 0,
    ALTER COLUMN daily_active_time_sec SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_customer_aggregate_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.customer_aggregate_metrics (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO UPDATE SET
        total_sessions = (
            SELECT COUNT(*)
            FROM public.customer_sessions
            WHERE user_id = NEW.user_id
        ),
        total_active_time_sec = COALESCE((
            SELECT SUM(total_active_time_sec)
            FROM public.customer_sessions
            WHERE user_id = NEW.user_id
        ), 0),
        total_pages_viewed = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PAGE_VIEW'
        ),
        total_products_viewed = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PRODUCT_VIEW'
        ),
        total_clicks = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'UI_INTERACTION'
        ),
        updated_at = now();

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_presence_heartbeat(
    p_session_id TEXT,
    p_page TEXT,
    p_product_id BIGINT,
    p_active_ms INTEGER,
    p_visible BOOLEAN,
    p_cart_value NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.customer_sessions
    SET current_page = p_page,
        last_seen_at = now(),
        total_active_time_sec = COALESCE(total_active_time_sec, 0)
            + CASE WHEN p_visible THEN GREATEST(COALESCE(p_active_ms, 0), 0) / 1000 ELSE 0 END,
        daily_active_time_sec = CASE
            WHEN daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
                THEN COALESCE(daily_active_time_sec, 0)
            ELSE 0
        END + CASE WHEN p_visible THEN GREATEST(COALESCE(p_active_ms, 0), 0) / 1000 ELSE 0 END,
        active_heartbeat_count = CASE
            WHEN daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
                THEN COALESCE(active_heartbeat_count, 0)
            ELSE 0
        END + CASE WHEN p_visible AND COALESCE(p_active_ms, 0) > 0 THEN 1 ELSE 0 END,
        daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE,
        session_status = CASE WHEN p_visible THEN 'ACTIVE' ELSE 'IDLE' END,
        cart_value = GREATEST(COALESCE(p_cart_value, 0), 0)
    WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_behavioral_metrics()
RETURNS TABLE (
    live_users BIGINT,
    events_today BIGINT,
    avg_active_sec NUMERIC,
    cart_rate NUMERIC,
    cart_sessions BIGINT,
    visitor_sessions BIGINT,
    rage_clicks_24h BIGINT,
    zero_results_24h BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH visitor_sessions AS (
        SELECT DISTINCT ae.session_id
        FROM public.analytics_events ae
        WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'
          AND ae.session_id IS NOT NULL
          AND ae.event_name = 'PAGE_VIEW'
    ),
    traffic AS (
        SELECT
            (SELECT count(*) FROM visitor_sessions) AS visitor_sessions,
            (SELECT count(DISTINCT ae.session_id)
             FROM public.analytics_events ae
             WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'
               AND ae.event_name = 'ADD_TO_CART'
               AND ae.session_id IN (SELECT session_id FROM visitor_sessions)) AS cart_sessions
    ),
    engagement AS (
        SELECT avg(cs.daily_active_time_sec)::NUMERIC AS avg_active_sec
        FROM public.customer_sessions cs
        WHERE cs.daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
          AND cs.active_heartbeat_count > 0
    )
    SELECT
        (SELECT count(*) FROM public.customer_sessions cs
         WHERE cs.last_seen_at >= now() - interval '5 minutes')::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi')::BIGINT,
        engagement.avg_active_sec,
        CASE WHEN traffic.visitor_sessions = 0 THEN NULL
             ELSE round(100.0 * traffic.cart_sessions / traffic.visitor_sessions, 1)
        END,
        traffic.cart_sessions::BIGINT,
        traffic.visitor_sessions::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.event_name = 'RAGE_CLICK'
           AND ae.created_at >= now() - interval '24 hours')::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.event_name = 'ZERO_RESULTS'
           AND ae.created_at >= now() - interval '24 hours')::BIGINT
    FROM traffic
    CROSS JOIN engagement;
$$;

REVOKE ALL ON FUNCTION public.get_behavioral_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_behavioral_metrics() TO service_role;
