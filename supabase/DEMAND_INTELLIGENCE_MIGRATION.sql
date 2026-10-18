-- Stores only a customer-approved area; exact browser coordinates are never persisted here.
CREATE TABLE IF NOT EXISTS public.customer_location_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    anonymous_id TEXT,
    country TEXT NOT NULL,
    county TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    location_source TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customer_location_preferences_identity_check
        CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_location_preferences_user_uidx
    ON public.customer_location_preferences (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_location_preferences_anonymous_uidx
    ON public.customer_location_preferences (anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_location_preferences_area_idx
    ON public.customer_location_preferences (country, county, city, area);

ALTER TABLE public.customer_sessions
    ADD COLUMN IF NOT EXISTS location_preference_id UUID
        REFERENCES public.customer_location_preferences(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS location_country TEXT,
    ADD COLUMN IF NOT EXISTS location_county TEXT,
    ADD COLUMN IF NOT EXISTS location_city TEXT,
    ADD COLUMN IF NOT EXISTS location_area TEXT;

CREATE TABLE IF NOT EXISTS public.market_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    phone TEXT,
    country TEXT NOT NULL DEFAULT 'Kenya',
    county TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    notification_consent BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'storefront',
    status TEXT NOT NULL DEFAULT 'WAITLIST',
    notified_at TIMESTAMPTZ,
    converted_to_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT market_waitlist_notification_consent_check CHECK (notification_consent = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS market_waitlist_email_area_uidx
    ON public.market_waitlist (lower(email), lower(city), lower(area));
CREATE INDEX IF NOT EXISTS market_waitlist_location_created_idx
    ON public.market_waitlist (country, county, city, area, created_at DESC);

CREATE TABLE IF NOT EXISTS public.waitlist_demand_locations (
    waitlist_id UUID PRIMARY KEY REFERENCES public.market_waitlist(id) ON DELETE CASCADE,
    latitude NUMERIC(6, 3) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(7, 3) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m NUMERIC(7, 2) NOT NULL CHECK (accuracy_m > 0 AND accuracy_m <= 250),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_demand_locations_grid_idx
    ON public.waitlist_demand_locations (latitude, longitude);
ALTER TABLE public.waitlist_demand_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_demand_locations FROM anon, authenticated;
GRANT ALL ON public.waitlist_demand_locations TO service_role;

ALTER TABLE public.customer_location_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_location_preferences FROM anon, authenticated;
REVOKE ALL ON public.market_waitlist FROM anon, authenticated;
GRANT ALL ON public.customer_location_preferences TO service_role;
GRANT ALL ON public.market_waitlist TO service_role;

CREATE OR REPLACE FUNCTION public.link_customer_location_preference(
    p_anonymous_id TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    anonymous_preference public.customer_location_preferences%ROWTYPE;
    account_preference public.customer_location_preferences%ROWTYPE;
BEGIN
    SELECT * INTO anonymous_preference
    FROM public.customer_location_preferences
    WHERE anonymous_id = p_anonymous_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO account_preference
    FROM public.customer_location_preferences
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.customer_location_preferences
        SET user_id = p_user_id, updated_at = now()
        WHERE id = anonymous_preference.id;
        RETURN TRUE;
    END IF;

    IF account_preference.id = anonymous_preference.id THEN
        RETURN TRUE;
    END IF;

    UPDATE public.customer_sessions
    SET location_preference_id = account_preference.id
    WHERE anonymous_id = p_anonymous_id;

    UPDATE public.customer_location_preferences
    SET anonymous_id = NULL,
        country = anonymous_preference.country,
        county = anonymous_preference.county,
        city = anonymous_preference.city,
        area = anonymous_preference.area,
        location_source = anonymous_preference.location_source,
        consented_at = anonymous_preference.consented_at,
        updated_at = now()
    WHERE id = account_preference.id;

    DELETE FROM public.customer_location_preferences
    WHERE id = anonymous_preference.id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_location_preference(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_location_preference(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_demand_intelligence(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
    SELECT now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90))) AS since_at,
           now() - make_interval(days => 2 * greatest(1, least(coalesce(p_days, 30), 90))) AS previous_since_at
),
locations AS (
    SELECT DISTINCT country, county, city, area
    FROM public.customer_location_preferences
    UNION
    SELECT DISTINCT country, county, city, area
    FROM public.market_waitlist
),
metrics AS (
    SELECT
        loc.country,
        loc.county,
        loc.city,
        loc.area,
        (SELECT count(DISTINCT coalesce(pref.user_id::TEXT, pref.anonymous_id))
         FROM public.customer_location_preferences pref
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
        ) AS known_visitors,
        (SELECT count(*)
         FROM public.profiles prof
         JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
        ) AS total_users,
        (SELECT count(*)
         FROM public.profiles prof
         JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
           AND prof.created_at >= b.since_at
        ) AS new_signups,
        (SELECT count(DISTINCT coalesce(sess.user_id::TEXT, sess.anonymous_id, sess.id))
         FROM public.customer_sessions sess
         LEFT JOIN public.customer_location_preferences pref
           ON pref.id = sess.location_preference_id
           OR (sess.location_preference_id IS NULL AND (
               (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
               OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
           ))
         CROSS JOIN bounds b
         WHERE (coalesce(sess.location_country, pref.country),
                coalesce(sess.location_county, pref.county),
                coalesce(sess.location_city, pref.city),
                coalesce(sess.location_area, pref.area))
               = (loc.country, loc.county, loc.city, loc.area)
           AND sess.last_seen_at >= b.since_at
        ) AS active_users,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
        ) AS waitlist_signups,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         CROSS JOIN bounds b
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND waitlist.created_at >= b.since_at
        ) AS recent_waitlist_signups,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         CROSS JOIN bounds b
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND waitlist.created_at >= b.previous_since_at
           AND waitlist.created_at < b.since_at
        ) AS previous_waitlist_signups,
        (SELECT count(*)
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS orders,
        (SELECT count(DISTINCT coalesce(ord.user_id::TEXT, sess.anonymous_id, sess.id::TEXT))
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS converted_customers,
        (SELECT coalesce(sum(ord.total_price), 0)
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS revenue,
        (SELECT coalesce(jsonb_object_agg(source_channel, session_count), '{}'::JSONB)
         FROM (
             SELECT coalesce(nullif(sess.source_channel, ''), 'Direct') AS source_channel,
                    count(DISTINCT sess.id) AS session_count
             FROM public.customer_sessions sess
             LEFT JOIN public.customer_location_preferences pref
               ON pref.id = sess.location_preference_id
               OR (sess.location_preference_id IS NULL AND (
                   (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
                   OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
               ))
             CROSS JOIN bounds b
             WHERE (coalesce(sess.location_country, pref.country),
                    coalesce(sess.location_county, pref.county),
                    coalesce(sess.location_city, pref.city),
                    coalesce(sess.location_area, pref.area))
                   = (loc.country, loc.county, loc.city, loc.area)
               AND sess.created_at >= b.since_at
             GROUP BY 1
         ) sources
        ) AS traffic_sources
    FROM locations loc
)
SELECT jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 90)),
    'locations', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'country', country,
            'county', county,
            'city', city,
            'area', area,
            'knownVisitors', known_visitors,
            'totalUsers', total_users,
            'newSignups', new_signups,
            'activeUsers', active_users,
            'waitlistSignups', waitlist_signups,
            'recentWaitlistSignups', recent_waitlist_signups,
            'previousWaitlistSignups', previous_waitlist_signups,
            'orders', orders,
            'revenue', revenue,
            'conversionRate', CASE WHEN active_users > 0 THEN round(converted_customers::NUMERIC * 100 / active_users, 1) ELSE 0 END,
            'trafficSources', traffic_sources
        ) ORDER BY waitlist_signups DESC, orders DESC)
        FROM metrics
    ), '[]'::JSONB),
    'waitlistContacts', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'email', email,
            'phone', phone,
            'country', country,
            'county', county,
            'city', city,
            'area', area,
            'source', source,
            'status', status,
            'createdAt', created_at
        ) ORDER BY created_at DESC)
        FROM (
            SELECT id, email, phone, country, county, city, area, source, status, created_at
            FROM public.market_waitlist
            WHERE notification_consent = true
            ORDER BY created_at DESC
            LIMIT 500
        ) contacts
    ), '[]'::JSONB),
    'dailyTrend', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'date', trend_date,
            'activeSessions', active_sessions,
            'newSignups', new_signups,
            'waitlistSignups', waitlist_signups
        ) ORDER BY trend_date)
        FROM (
            SELECT
                dates.day::DATE AS trend_date,
                (SELECT count(DISTINCT sess.id)
                 FROM public.customer_sessions sess
                 JOIN public.customer_location_preferences pref
                   ON pref.id = sess.location_preference_id
                   OR (sess.location_preference_id IS NULL AND (
                       (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
                       OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
                   ))
                 WHERE sess.created_at::DATE = dates.day::DATE
                ) AS active_sessions,
                (SELECT count(*)
                 FROM public.profiles prof
                 JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
                 WHERE prof.created_at::DATE = dates.day::DATE
                ) AS new_signups,
                (SELECT count(*)
                 FROM public.market_waitlist waitlist
                 WHERE waitlist.created_at::DATE = dates.day::DATE
                ) AS waitlist_signups
            FROM generate_series(
                current_date - (greatest(1, least(coalesce(p_days, 30), 90)) - 1),
                current_date,
                interval '1 day'
            ) dates(day)
        ) trend
    ), '[]'::JSONB)
);
$$;

REVOKE ALL ON FUNCTION public.get_demand_intelligence(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_demand_intelligence(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
