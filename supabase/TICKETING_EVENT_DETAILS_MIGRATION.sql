-- Audited owner/admin editing for public event details.
-- Apply after TICKETING_CORE_MIGRATION.sql and TICKETING_LIVE_OPERATIONS_MIGRATION.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ticketing_update_event_details(
    p_event_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_doors_open_at TIMESTAMPTZ,
    p_age_limit SMALLINT,
    p_capacity INTEGER,
    p_cancellation_policy TEXT,
    p_cover_image_url TEXT,
    p_actor_email TEXT,
    p_allow_on_sale BOOLEAN
)
RETURNS public.ticketing_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event public.ticketing_events%ROWTYPE;
    v_old_state JSONB;
    v_allocated BIGINT;
BEGIN
    IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 3 AND 160
        OR p_description IS NULL OR length(p_description) > 10000
        OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at
        OR (p_doors_open_at IS NOT NULL AND p_doors_open_at > p_starts_at)
        OR (p_age_limit IS NOT NULL AND p_age_limit NOT BETWEEN 0 AND 120)
        OR (p_capacity IS NOT NULL AND p_capacity NOT BETWEEN 1 AND 1000000)
        OR p_cancellation_policy IS NULL OR length(p_cancellation_policy) > 5000
        OR (p_cover_image_url IS NOT NULL AND (
            length(p_cover_image_url) > 2048
            OR p_cover_image_url !~ '^https://[^[:space:]]+$'
        )) THEN
        RAISE EXCEPTION 'Event details are invalid.'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF v_event.status NOT IN ('draft', 'scheduled', 'on_sale') THEN
        RAISE EXCEPTION 'Event details cannot be changed in this event state.'
            USING ERRCODE = 'P0001';
    END IF;
    IF v_event.status = 'on_sale' AND NOT COALESCE(p_allow_on_sale, false) THEN
        RAISE EXCEPTION 'Only the platform owner can edit a live event listing.'
            USING ERRCODE = '42501';
    END IF;
    IF v_event.status = 'on_sale'
        AND (p_starts_at <> v_event.starts_at OR p_ends_at <> v_event.ends_at)
        AND (p_starts_at <= now() OR p_ends_at <= now()) THEN
        RAISE EXCEPTION 'A live event date change must keep both event times in the future.'
            USING ERRCODE = '22023';
    END IF;

    IF p_capacity IS NOT NULL THEN
        SELECT COALESCE(SUM(ticket_type.capacity), 0)
        INTO v_allocated
        FROM public.ticketing_ticket_types AS ticket_type
        WHERE ticket_type.event_id = p_event_id
          AND ticket_type.status <> 'archived';
        IF v_allocated > p_capacity THEN
            RAISE EXCEPTION 'Event capacity cannot be lower than the active ticket allocation (%).', v_allocated
                USING ERRCODE = '22023';
        END IF;
    END IF;

    v_old_state := to_jsonb(v_event);
    UPDATE public.ticketing_events
    SET title = trim(p_title),
        description = p_description,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        doors_open_at = p_doors_open_at,
        age_limit = p_age_limit,
        capacity = p_capacity,
        cancellation_policy = p_cancellation_policy,
        cover_image_url = p_cover_image_url,
        updated_at = now()
    WHERE id = p_event_id
    RETURNING * INTO v_event;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, before_state, after_state
    ) VALUES (
        COALESCE(p_actor_email, ''),
        'event.details_updated',
        'event',
        v_event.id::TEXT,
        v_old_state,
        to_jsonb(v_event)
    );

    RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_update_event_details(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, SMALLINT,
    INTEGER, TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_update_event_details(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, SMALLINT,
    INTEGER, TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

COMMIT;
