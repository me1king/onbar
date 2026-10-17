-- Event-scoped staff access and server-enforced admission checks for the OnBar scanner.
-- Apply after TICKETING_CORE_MIGRATION.sql.

BEGIN;

ALTER TABLE public.ticketing_checkins
    DROP CONSTRAINT IF EXISTS ticketing_checkins_result_check;
ALTER TABLE public.ticketing_checkins
    ADD CONSTRAINT ticketing_checkins_result_check
    CHECK (result IN (
        'accepted', 'already_used', 'invalid', 'refunded', 'revoked',
        'wrong_event', 'unpaid', 'event_closed'
    ));

CREATE INDEX IF NOT EXISTS ticketing_staff_active_event_user_idx
    ON public.ticketing_staff_assignments (user_id, event_id)
    WHERE active AND role = 'gate_staff';

CREATE OR REPLACE FUNCTION public.ticketing_check_in(
    p_event_id UUID,
    p_credential_hash TEXT,
    p_gate_name TEXT DEFAULT '',
    p_staff_user_id UUID DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ticket public.ticketing_tickets%ROWTYPE;
    v_result TEXT;
    v_order_status TEXT;
    v_event_status TEXT;
    v_doors_open_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
BEGIN
    IF p_event_id IS NULL OR p_credential_hash IS NULL OR p_credential_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid ticket credential.' USING ERRCODE = '22023';
    END IF;
    IF p_staff_user_id IS NULL THEN
        RAISE EXCEPTION 'Active gate-staff assignment is required for this event.'
            USING ERRCODE = '42501';
    END IF;
    PERFORM 1
    FROM public.ticketing_staff_assignments assignment
    WHERE assignment.event_id = p_event_id
      AND assignment.user_id = p_staff_user_id
      AND assignment.role = 'gate_staff'
      AND assignment.active
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active gate-staff assignment is required for this event.'
            USING ERRCODE = '42501';
    END IF;

    SELECT event.status, COALESCE(event.doors_open_at, event.starts_at), event.ends_at
    INTO v_event_status, v_doors_open_at, v_ends_at
    FROM public.ticketing_events event
    WHERE event.id = p_event_id
    FOR SHARE;
    IF NOT FOUND OR v_event_status NOT IN ('on_sale', 'sold_out')
       OR now() < v_doors_open_at OR now() >= v_ends_at THEN
        v_result := 'event_closed';
    ELSE
        SELECT ticket.*
        INTO v_ticket
        FROM public.ticketing_tickets ticket
        WHERE ticket.credential_hash = p_credential_hash
        FOR UPDATE OF ticket;

        IF NOT FOUND THEN
            v_result := 'invalid';
        ELSE
            SELECT orders.status
            INTO v_order_status
            FROM public.ticketing_order_items item
            JOIN public.ticketing_orders orders ON orders.id = item.order_id
            WHERE item.id = v_ticket.order_item_id;

            IF v_ticket.event_id <> p_event_id THEN
                v_result := 'wrong_event';
            ELSIF v_order_status IS DISTINCT FROM 'paid' THEN
                v_result := 'unpaid';
            ELSIF v_ticket.status = 'checked_in' THEN
                v_result := 'already_used';
            ELSIF v_ticket.status = 'refunded' THEN
                v_result := 'refunded';
            ELSIF v_ticket.status IN ('revoked', 'transferred') THEN
                v_result := 'revoked';
            ELSE
                v_result := 'accepted';
                UPDATE public.ticketing_tickets
                SET status = 'checked_in', checked_in_at = now()
                WHERE id = v_ticket.id;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.ticketing_checkins (
        event_id, ticket_id, credential_hash, gate_name, staff_user_id, device_id, result
    ) VALUES (
        p_event_id, v_ticket.id, p_credential_hash, left(trim(COALESCE(p_gate_name, '')), 120),
        p_staff_user_id, left(trim(COALESCE(p_device_id, '')), 120), v_result
    );

    RETURN jsonb_build_object(
        'result', v_result,
        'ticket_reference', CASE WHEN v_result IN ('accepted', 'already_used') THEN v_ticket.ticket_reference ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_check_in(UUID, TEXT, TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_check_in(UUID, TEXT, TEXT, UUID, TEXT)
    TO service_role;

COMMIT;
