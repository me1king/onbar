-- Owner-controlled event publication for the isolated Online Bar Ticketing module.
-- Apply after TICKETING_WAVES_MIGRATION.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ticketing_set_event_sales_status(
    p_event_id UUID,
    p_status TEXT,
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
    IF p_status NOT IN ('on_sale', 'scheduled') THEN
        RAISE EXCEPTION 'Event sales status must be on_sale or scheduled.'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event was not found.' USING ERRCODE = 'P0002';
    END IF;

    IF p_status = 'on_sale' THEN
        IF v_event.status NOT IN ('draft', 'scheduled') THEN
            RAISE EXCEPTION 'Only draft or scheduled events can be opened for public sales.'
                USING ERRCODE = 'P0001';
        END IF;
        IF v_event.starts_at <= now() OR v_event.ends_at <= now() THEN
            RAISE EXCEPTION 'The event start and end times must both be in the future before publishing.'
                USING ERRCODE = '22023';
        END IF;
        IF length(trim(v_event.venue_name)) < 2
            OR length(trim(v_event.venue_address)) < 5
            OR length(trim(v_event.city)) < 2 THEN
            RAISE EXCEPTION 'Add the confirmed venue name, full venue address, and city before publishing.'
                USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM public.ticketing_organizers AS organizer
            WHERE organizer.id = v_event.organizer_id
              AND organizer.status = 'approved'
        ) THEN
            RAISE EXCEPTION 'The event organizer must be approved before publishing.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM public.ticketing_ticket_types AS ticket_type
            WHERE ticket_type.event_id = p_event_id
              AND ticket_type.status = 'active'
              AND ticket_type.price_minor > 0
              AND (ticket_type.sales_start_at IS NULL OR ticket_type.sales_start_at <= now())
              AND (ticket_type.sales_end_at IS NULL OR ticket_type.sales_end_at > now())
              AND public.ticketing_ticket_wave_is_open(ticket_type.id)
        ) THEN
            RAISE EXCEPTION 'Configure at least one active, available ticket tier or wave before opening public sales.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_event.status <> 'on_sale' THEN
        RAISE EXCEPTION 'Only an event currently on sale can be paused.'
            USING ERRCODE = 'P0001';
    END IF;

    v_old_state := to_jsonb(v_event);
    UPDATE public.ticketing_events
    SET status = p_status,
        published_at = CASE WHEN p_status = 'on_sale' THEN COALESCE(published_at, now()) ELSE published_at END,
        updated_at = now()
    WHERE id = p_event_id
    RETURNING * INTO v_event;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, before_state, after_state
    ) VALUES (
        COALESCE(p_actor_email, ''),
        CASE WHEN p_status = 'on_sale' THEN 'event.sales_opened' ELSE 'event.sales_paused' END,
        'event', v_event.id::TEXT, v_old_state, to_jsonb(v_event)
    );

    RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_set_event_sales_status(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_set_event_sales_status(UUID, TEXT, TEXT)
    TO service_role;

COMMIT;
