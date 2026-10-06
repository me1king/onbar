-- Prevent anonymous customer sessions from inserting NULL aggregate keys.
-- Safe to run on the existing project; replaces the function used by its trigger.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.customer_sessions') IS NULL
       OR to_regclass('public.customer_aggregate_metrics') IS NULL
       OR to_regclass('public.analytics_events') IS NULL THEN
        RAISE EXCEPTION 'Customer aggregate fix requires customer_sessions, customer_aggregate_metrics, and analytics_events.'
            USING HINT = 'Run the core schema migration first.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_aggregate_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Anonymous sessions have no profile row and cannot be keyed in customer aggregates.
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
        total_pages_viewed = COALESCE((
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PAGE_VIEW'
        ), 0),
        total_products_viewed = COALESCE((
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PRODUCT_VIEW'
        ), 0),
        total_clicks = COALESCE((
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'UI_INTERACTION'
        ), 0),
        updated_at = now();

    RETURN NEW;
END;
$$;

COMMIT;
