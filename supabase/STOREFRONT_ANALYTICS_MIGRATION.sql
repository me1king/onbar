-- Consent-gated storefront traffic and conversion reporting.
-- Apply after FINAL_ESTABLISHMENT_SQL.sql and LIVE_CUSTOMER_JOURNEY_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.customer_sessions') IS NULL
     OR to_regclass('public.analytics_events') IS NULL
     OR to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Storefront analytics requires customer_sessions, analytics_events, and orders.'
      USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql and LIVE_CUSTOMER_JOURNEY_MIGRATION.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.customer_sessions
  ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analytics_consent_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS attribution_id TEXT,
  ADD COLUMN IF NOT EXISTS content_variant TEXT;

CREATE INDEX IF NOT EXISTS customer_sessions_consented_created_idx
  ON public.customer_sessions (created_at DESC)
  WHERE analytics_consent = true;

CREATE INDEX IF NOT EXISTS analytics_events_session_created_idx
  ON public.analytics_events (session_id, created_at)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_session_created_idx
  ON public.orders (session_id, created_at)
  WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_storefront_analytics(
  p_from TIMESTAMPTZ,
  p_until TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_from IS NULL OR p_until IS NULL OR p_until <= p_from
     OR p_until - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'Invalid storefront analytics date range.';
  END IF;

  RETURN (
    WITH eligible_sessions AS MATERIALIZED (
      SELECT
        s.id,
        s.user_id,
        s.anonymous_id,
        s.created_at,
        s.source_channel,
        s.campaign_id,
        s.total_active_time_sec,
        s.device_info,
        COALESCE(NULLIF(s.source_channel, ''), 'Direct') AS source,
        COALESCE(NULLIF(s.device_info #>> '{attribution,medium}', ''), 'Unspecified') AS medium,
        COALESCE(
          NULLIF(s.device_info #>> '{attribution,campaign}', ''),
          NULLIF(s.campaign_id, ''),
          'Unattributed'
        ) AS campaign
      FROM public.customer_sessions s
      WHERE s.analytics_consent IS TRUE
        AND s.created_at >= p_from
        AND s.created_at < p_until
    ),
    event_scope AS MATERIALIZED (
      SELECT
        e.event_name,
        e.session_id,
        e.page_url,
        e.payload,
        e.created_at
      FROM public.analytics_events e
      JOIN eligible_sessions s ON s.id = e.session_id
      WHERE e.created_at >= p_from
        AND e.created_at < p_until
    ),
    session_events AS (
      SELECT
        s.id,
        count(*) FILTER (WHERE e.event_name = 'PAGE_VIEW') AS page_views
      FROM eligible_sessions s
      LEFT JOIN event_scope e ON e.session_id = s.id
      GROUP BY s.id
    ),
    completed_orders AS MATERIALIZED (
      SELECT
        o.id,
        o.session_id,
        o.total_price,
        s.source,
        s.medium,
        s.campaign,
        o.created_at
      FROM public.orders o
      JOIN eligible_sessions s ON s.id = o.session_id
      WHERE o.created_at >= p_from
        AND o.created_at < p_until
        AND lower(COALESCE(o.status, '')) IN ('paid', 'delivered')
    ),
    source_sessions AS (
      SELECT source, medium, count(*) AS sessions
      FROM eligible_sessions
      GROUP BY source, medium
    ),
    source_orders AS (
      SELECT
        source,
        medium,
        count(*) AS orders,
        count(DISTINCT session_id) AS converted_sessions,
        COALESCE(sum(total_price), 0) AS revenue
      FROM completed_orders
      GROUP BY source, medium
    ),
    order_sessions AS (
      SELECT session_id, count(*) AS orders, COALESCE(sum(total_price), 0) AS revenue
      FROM completed_orders
      GROUP BY session_id
    ),
    campaign_sessions AS (
      SELECT source, medium, campaign, count(*) AS sessions
      FROM eligible_sessions
      WHERE campaign <> 'Unattributed'
      GROUP BY source, medium, campaign
    ),
    campaign_orders AS (
      SELECT
        source,
        medium,
        campaign,
        count(*) AS orders,
        count(DISTINCT session_id) AS converted_sessions,
        COALESCE(sum(total_price), 0) AS revenue
      FROM completed_orders
      WHERE campaign <> 'Unattributed'
      GROUP BY source, medium, campaign
    ),
    page_views AS (
      SELECT
        COALESCE(NULLIF(e.payload->>'url', ''), e.page_url, '(unknown)') AS page,
        count(*) AS views,
        count(DISTINCT e.session_id) AS sessions
      FROM event_scope e
      WHERE e.event_name = 'PAGE_VIEW'
      GROUP BY 1
    ),
    page_dwell AS (
      SELECT
        COALESCE(NULLIF(e.payload->>'url', ''), e.page_url, '(unknown)') AS page,
        avg(LEAST((e.payload->>'dwell_time_ms')::NUMERIC, 86400000) / 1000) AS average_seconds
      FROM event_scope e
      WHERE e.event_name = 'TIME_ON_PAGE'
        AND e.payload->>'dwell_time_ms' ~ '^[0-9]+([.][0-9]+)?$'
      GROUP BY 1
    ),
    session_dwell AS (
      SELECT
        e.session_id,
        sum(LEAST((e.payload->>'dwell_time_ms')::NUMERIC, 86400000) / 1000) AS dwell_seconds
      FROM event_scope e
      WHERE e.event_name = 'TIME_ON_PAGE'
        AND e.payload->>'dwell_time_ms' ~ '^[0-9]+([.][0-9]+)?$'
      GROUP BY e.session_id
    ),
    device_sessions AS (
      SELECT
        CASE
          WHEN COALESCE(s.device_info->>'ua', '') ~* 'ipad|tablet' THEN 'Tablet'
          WHEN COALESCE(s.device_info->>'ua', '') ~* 'mobile|android|iphone|ipod' THEN 'Mobile'
          WHEN COALESCE(s.device_info->>'ua', '') = '' THEN 'Unknown'
          ELSE 'Desktop'
        END AS device,
        count(*) AS sessions
      FROM eligible_sessions s
      GROUP BY 1
    ),
    funnel AS (
      SELECT
        count(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'PAGE_VIEW') AS visitors,
        count(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'PRODUCT_VIEW') AS product_viewers,
        count(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'ADD_TO_CART') AS cart_sessions,
        count(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'CHECKOUT_START') AS checkout_sessions
      FROM event_scope e
    ),
    days AS (
      SELECT generate_series(
        date_trunc('day', p_from AT TIME ZONE 'Africa/Nairobi'),
        date_trunc('day', (p_until - INTERVAL '1 microsecond') AT TIME ZONE 'Africa/Nairobi'),
        INTERVAL '1 day'
      )::DATE AS day
    ),
    daily_sessions AS (
      SELECT (s.created_at AT TIME ZONE 'Africa/Nairobi')::DATE AS day, count(*) AS sessions
      FROM eligible_sessions s
      GROUP BY 1
    ),
    daily_events AS (
      SELECT
        (e.created_at AT TIME ZONE 'Africa/Nairobi')::DATE AS day,
        count(*) FILTER (WHERE e.event_name = 'PAGE_VIEW') AS page_views
      FROM event_scope e
      GROUP BY 1
    ),
    daily_orders AS (
      SELECT
        (o.created_at AT TIME ZONE 'Africa/Nairobi')::DATE AS day,
        count(*) AS orders,
        COALESCE(sum(o.total_price), 0) AS revenue
      FROM completed_orders o
      GROUP BY 1
    ),
    summary AS (
      SELECT
        count(*) AS sessions,
        count(DISTINCT COALESCE(s.user_id::TEXT, s.anonymous_id, s.id)) AS visitors,
        COALESCE((SELECT count(*) FROM event_scope e WHERE e.event_name = 'PAGE_VIEW'), 0) AS page_views,
        COALESCE((SELECT count(*) FROM completed_orders), 0) AS orders,
        COALESCE((SELECT count(*) FROM order_sessions), 0) AS converted_sessions,
        COALESCE((SELECT sum(total_price) FROM completed_orders), 0) AS revenue,
        round(avg(COALESCE(sd.dwell_seconds, NULLIF(s.total_active_time_sec, 0), 0))) AS average_session_seconds,
        round(avg(NULLIF(s.total_active_time_sec, 0))) AS average_active_seconds,
        count(*) FILTER (WHERE COALESCE(se.page_views, 0) = 1) AS single_page_sessions
      FROM eligible_sessions s
      LEFT JOIN session_events se ON se.id = s.id
      LEFT JOIN session_dwell sd ON sd.session_id = s.id
    )
    SELECT jsonb_build_object(
      'summary', (
        SELECT jsonb_build_object(
          'sessions', sessions,
          'visitors', visitors,
          'pageViews', page_views,
          'orders', orders,
          'convertedSessions', converted_sessions,
          'revenue', revenue,
          'averageSessionSeconds', COALESCE(average_session_seconds, 0),
          'averageActiveSeconds', COALESCE(average_active_seconds, 0),
          'singlePageSessions', single_page_sessions,
          'conversionRate', CASE WHEN sessions > 0
            THEN round(converted_sessions * 100.0 / sessions, 2) ELSE 0 END,
          'singlePageRate', CASE WHEN sessions > 0
            THEN round(single_page_sessions * 100.0 / sessions, 2) ELSE 0 END
        )
        FROM summary
      ),
      'daily', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date', d.day,
          'sessions', COALESCE(s.sessions, 0),
          'pageViews', COALESCE(e.page_views, 0),
          'orders', COALESCE(o.orders, 0),
          'revenue', COALESCE(o.revenue, 0)
        ) ORDER BY d.day)
        FROM days d
        LEFT JOIN daily_sessions s ON s.day = d.day
        LEFT JOIN daily_events e ON e.day = d.day
        LEFT JOIN daily_orders o ON o.day = d.day
      ), '[]'::JSONB),
      'sources', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'source', s.source,
          'medium', s.medium,
          'sessions', s.sessions,
          'convertedSessions', s.converted_sessions,
          'orders', s.orders,
          'revenue', s.revenue,
          'conversionRate', CASE WHEN s.sessions > 0
            THEN round(s.converted_sessions * 100.0 / s.sessions, 2) ELSE 0 END
        ) ORDER BY s.sessions DESC, s.source)
        FROM (
          SELECT
            ss.source,
            ss.medium,
            ss.sessions,
            COALESCE(so.converted_sessions, 0) AS converted_sessions,
            COALESCE(so.orders, 0) AS orders,
            COALESCE(so.revenue, 0) AS revenue
          FROM source_sessions ss
          LEFT JOIN source_orders so USING (source, medium)
          ORDER BY ss.sessions DESC, ss.source
          LIMIT 50
        ) s
      ), '[]'::JSONB),
      'campaigns', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'source', s.source,
          'medium', s.medium,
          'campaign', s.campaign,
          'sessions', s.sessions,
          'convertedSessions', s.converted_sessions,
          'orders', s.orders,
          'revenue', s.revenue,
          'conversionRate', CASE WHEN s.sessions > 0
            THEN round(s.converted_sessions * 100.0 / s.sessions, 2) ELSE 0 END
        ) ORDER BY s.sessions DESC, s.campaign)
        FROM (
          SELECT
            cs.source,
            cs.medium,
            cs.campaign,
            cs.sessions,
            COALESCE(co.converted_sessions, 0) AS converted_sessions,
            COALESCE(co.orders, 0) AS orders,
            COALESCE(co.revenue, 0) AS revenue
          FROM campaign_sessions cs
          LEFT JOIN campaign_orders co USING (source, medium, campaign)
          ORDER BY cs.sessions DESC, cs.campaign
          LIMIT 50
        ) s
      ), '[]'::JSONB),
      'pages', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'page', p.page,
          'views', p.views,
          'sessions', p.sessions,
          'averageSeconds', COALESCE(d.average_seconds, 0)
        ) ORDER BY p.views DESC, p.page)
        FROM (SELECT * FROM page_views ORDER BY views DESC LIMIT 10) p
        LEFT JOIN page_dwell d ON d.page = p.page
      ), '[]'::JSONB),
      'devices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('device', device, 'sessions', sessions)
          ORDER BY sessions DESC, device)
        FROM device_sessions
      ), '[]'::JSONB),
      'funnel', (
        SELECT jsonb_build_object(
          'visitors', visitors,
          'productViewers', product_viewers,
          'cartSessions', cart_sessions,
          'checkoutSessions', checkout_sessions,
          'purchasers', (SELECT count(DISTINCT session_id) FROM completed_orders)
        )
        FROM funnel
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_storefront_analytics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_analytics(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
