-- Adds owner-managed map pins and guest arrival guidance to Ticketing events.

BEGIN;

ALTER TABLE public.ticketing_events
    ADD COLUMN IF NOT EXISTS venue_latitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS venue_longitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS entrance_guide TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS parking_guide TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS transport_guide TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.ticketing_events'::regclass
          AND conname = 'ticketing_events_venue_coordinates_pair'
    ) THEN
        ALTER TABLE public.ticketing_events
            ADD CONSTRAINT ticketing_events_venue_coordinates_pair
            CHECK (
                (venue_latitude IS NULL AND venue_longitude IS NULL)
                OR (
                    venue_latitude IS NOT NULL
                    AND venue_longitude IS NOT NULL
                    AND venue_latitude BETWEEN -90 AND 90
                    AND venue_longitude BETWEEN -180 AND 180
                )
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_update_event_venue(
    p_event_id UUID,
    p_venue_name TEXT,
    p_venue_address TEXT,
    p_city TEXT,
    p_venue_latitude NUMERIC,
    p_venue_longitude NUMERIC,
    p_entrance_guide TEXT,
    p_parking_guide TEXT,
    p_transport_guide TEXT,
    p_actor_email TEXT
)
RETURNS public.ticketing_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event public.ticketing_events%ROWTYPE;
    v_old_state JSONB;
BEGIN
    IF p_venue_name IS NULL
        OR length(trim(p_venue_name)) NOT BETWEEN 2 AND 180
        OR p_venue_address IS NULL
        OR length(trim(p_venue_address)) NOT BETWEEN 5 AND 500
        OR p_city IS NULL
        OR length(trim(p_city)) NOT BETWEEN 2 AND 100
        OR length(COALESCE(p_entrance_guide, '')) > 2000
        OR length(COALESCE(p_parking_guide, '')) > 2000
        OR length(COALESCE(p_transport_guide, '')) > 2000 THEN
        RAISE EXCEPTION 'Venue details or arrival guidance are invalid.'
            USING ERRCODE = '22023';
    END IF;

    IF (p_venue_latitude IS NULL) <> (p_venue_longitude IS NULL)
        OR (p_venue_latitude IS NOT NULL AND p_venue_latitude NOT BETWEEN -90 AND 90)
        OR (p_venue_longitude IS NOT NULL AND p_venue_longitude NOT BETWEEN -180 AND 180) THEN
        RAISE EXCEPTION 'Enter both valid latitude and longitude coordinates, or leave both empty.'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event was not found.' USING ERRCODE = 'P0002';
    END IF;

    v_old_state := to_jsonb(v_event);
    UPDATE public.ticketing_events
    SET venue_name = trim(p_venue_name),
        venue_address = trim(p_venue_address),
        city = trim(p_city),
        venue_latitude = p_venue_latitude,
        venue_longitude = p_venue_longitude,
        entrance_guide = COALESCE(trim(p_entrance_guide), ''),
        parking_guide = COALESCE(trim(p_parking_guide), ''),
        transport_guide = COALESCE(trim(p_transport_guide), ''),
        updated_at = now()
    WHERE id = p_event_id
    RETURNING * INTO v_event;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, before_state, after_state
    ) VALUES (
        COALESCE(p_actor_email, ''),
        'event.venue_updated',
        'event',
        v_event.id::TEXT,
        v_old_state,
        to_jsonb(v_event)
    );

    RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_update_event_venue(
    UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_update_event_venue(
    UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
