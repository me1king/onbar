BEGIN;

DO $$
BEGIN
    IF to_regclass('public.analytics_events') IS NULL THEN
        RAISE EXCEPTION 'Game Night analytics requires public.analytics_events. Apply FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS analytics_events_game_night_funnel_idx
    ON public.analytics_events (created_at DESC, event_name, session_id)
    WHERE event_name IN (
        'GAME_NIGHT_STARTED',
        'GAME_NIGHT_MODE_SELECTED',
        'GAME_NIGHT_ROOM_CREATED',
        'GAME_NIGHT_ROOM_JOINED',
        'GAME_NIGHT_ACTION',
        'GAME_NIGHT_ENDED'
    ) OR (event_name = 'PAGE_VIEW' AND page_url = '/card-games');

CREATE OR REPLACE FUNCTION public.get_game_night_analytics(
    from_input TIMESTAMPTZ,
    to_input TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result JSONB;
BEGIN
    IF from_input IS NULL OR to_input IS NULL OR from_input >= to_input THEN
        RAISE EXCEPTION 'A valid Game Night analytics date range is required.';
    END IF;

    WITH event_rows AS MATERIALIZED (
        SELECT event_name, session_id, anonymous_id, page_url, payload, created_at
        FROM public.analytics_events
        WHERE created_at >= from_input
          AND created_at < to_input
          AND (
              (event_name = 'PAGE_VIEW' AND page_url = '/card-games')
              OR event_name IN (
                  'GAME_NIGHT_STARTED',
                  'GAME_NIGHT_MODE_SELECTED',
                  'GAME_NIGHT_ROOM_CREATED',
                  'GAME_NIGHT_ROOM_JOINED',
                  'GAME_NIGHT_ACTION',
                  'GAME_NIGHT_ENDED'
              )
          )
    ),
    totals AS (
        SELECT
            COUNT(*) FILTER (
                WHERE event_name = 'PAGE_VIEW' AND page_url = '/card-games'
            ) AS page_views,
            COUNT(DISTINCT COALESCE(NULLIF(anonymous_id, ''), session_id)) FILTER (
                WHERE (event_name = 'PAGE_VIEW' AND page_url = '/card-games')
                   OR event_name = 'GAME_NIGHT_STARTED'
            ) AS unique_visitors,
            COUNT(DISTINCT session_id) FILTER (
                WHERE (event_name = 'PAGE_VIEW' AND page_url = '/card-games')
                   OR event_name = 'GAME_NIGHT_STARTED'
            ) AS visitor_sessions,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_STARTED') AS game_starts,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'GAME_NIGHT_STARTED') AS started_sessions,
            COUNT(DISTINCT COALESCE(NULLIF(anonymous_id, ''), session_id)) FILTER (
                WHERE event_name = 'GAME_NIGHT_STARTED'
            ) AS started_visitors,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ACTION') AS game_actions,
            COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'GAME_NIGHT_ACTION') AS active_players,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ROOM_CREATED') AS rooms_created,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ROOM_JOINED') AS rooms_joined,
            COUNT(DISTINCT session_id) FILTER (
                WHERE event_name IN ('GAME_NIGHT_ROOM_CREATED', 'GAME_NIGHT_ROOM_JOINED')
            ) AS online_players,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ENDED') AS games_ended
        FROM event_rows
    ),
    days AS (
        SELECT generate_series(
            date_trunc('day', from_input),
            date_trunc('day', to_input),
            interval '1 day'
        )::DATE AS day
    ),
    daily AS (
        SELECT
            days.day,
            COUNT(event_rows.event_name) FILTER (WHERE event_rows.event_name = 'PAGE_VIEW') AS page_views,
            COUNT(event_rows.event_name) FILTER (WHERE event_rows.event_name = 'GAME_NIGHT_STARTED') AS game_starts,
            COUNT(event_rows.event_name) FILTER (WHERE event_rows.event_name = 'GAME_NIGHT_ACTION') AS game_actions
        FROM days
        LEFT JOIN event_rows ON event_rows.created_at::DATE = days.day
        GROUP BY days.day
    ),
    modes AS (
        SELECT
            payload->>'mode' AS mode,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_MODE_SELECTED') AS selections,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_STARTED') AS starts,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ACTION') AS actions,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ROOM_CREATED') AS rooms_created,
            COUNT(*) FILTER (WHERE event_name = 'GAME_NIGHT_ROOM_JOINED') AS rooms_joined
        FROM event_rows
        WHERE event_name <> 'PAGE_VIEW'
          AND NULLIF(payload->>'mode', '') IS NOT NULL
        GROUP BY payload->>'mode'
    ),
    actions AS (
        SELECT payload->>'action' AS action, COUNT(*) AS count
        FROM event_rows
        WHERE event_name = 'GAME_NIGHT_ACTION'
          AND NULLIF(payload->>'action', '') IS NOT NULL
        GROUP BY payload->>'action'
    )
    SELECT jsonb_build_object(
        'totals', (
            SELECT jsonb_build_object(
                'page_views', page_views,
                'unique_visitors', unique_visitors,
                'visitor_sessions', visitor_sessions,
                'game_starts', game_starts,
                'started_sessions', started_sessions,
                'started_visitors', started_visitors,
                'start_conversion_rate', CASE
                    WHEN unique_visitors = 0 THEN 0
                    ELSE ROUND(100.0 * started_visitors / unique_visitors, 1)
                END,
                'game_actions', game_actions,
                'active_players', active_players,
                'rooms_created', rooms_created,
                'rooms_joined', rooms_joined,
                'online_players', online_players,
                'games_ended', games_ended
            )
            FROM totals
        ),
        'daily', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'date', to_char(day, 'YYYY-MM-DD'),
                'page_views', page_views,
                'game_starts', game_starts,
                'game_actions', game_actions
            ) ORDER BY day), '[]'::JSONB)
            FROM daily
        ),
        'modes', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'mode', mode,
                'selections', selections,
                'starts', starts,
                'actions', actions,
                'rooms_created', rooms_created,
                'rooms_joined', rooms_joined
            ) ORDER BY mode), '[]'::JSONB)
            FROM modes
        ),
        'actions', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'action', action,
                'count', count
            ) ORDER BY count DESC, action), '[]'::JSONB)
            FROM actions
        )
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_game_night_analytics(TIMESTAMPTZ, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_night_analytics(TIMESTAMPTZ, TIMESTAMPTZ)
    TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
