-- Add scanner identification, private recent-scan history, and serialized rate limiting.
-- Apply after TICKETING_SCANNER_MIGRATION.sql.

BEGIN;

ALTER TABLE public.ticketing_checkins
    ADD COLUMN IF NOT EXISTS scanner_name TEXT NOT NULL DEFAULT 'Gate scanner'
        CHECK (length(scanner_name) <= 120),
    ADD COLUMN IF NOT EXISTS scan_method TEXT NOT NULL DEFAULT 'qr'
        CHECK (scan_method IN ('qr', 'manual'));

ALTER TABLE public.ticketing_checkins
    DROP CONSTRAINT IF EXISTS ticketing_checkins_result_check;
ALTER TABLE public.ticketing_checkins
    ADD CONSTRAINT ticketing_checkins_result_check
    CHECK (result IN (
        'accepted', 'already_used', 'invalid', 'refunded', 'revoked',
        'wrong_event', 'unpaid', 'event_closed', 'rate_limited'
    ));

CREATE INDEX IF NOT EXISTS ticketing_checkins_staff_history_idx
    ON public.ticketing_checkins (staff_user_id, event_id, scanned_at DESC);

CREATE OR REPLACE FUNCTION public.ticketing_check_in(
    p_event_id UUID,
    p_credential_hash TEXT,
    p_gate_name TEXT,
    p_staff_user_id UUID,
    p_device_id TEXT,
    p_scanner_name TEXT,
    p_scan_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ticket public.ticketing_tickets%ROWTYPE;
    v_assignment public.ticketing_staff_assignments%ROWTYPE;
    v_result TEXT;
    v_order_status TEXT;
    v_ticket_type TEXT;
    v_event_status TEXT;
    v_doors_open_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_recent_scans INTEGER;
BEGIN
    IF p_event_id IS NULL
       OR p_credential_hash IS NULL
       OR p_credential_hash !~ '^[0-9a-f]{64}$'
       OR p_staff_user_id IS NULL
       OR p_scan_method IS NULL
       OR p_scan_method NOT IN ('qr', 'manual')
       OR char_length(trim(COALESCE(p_device_id, ''))) NOT BETWEEN 1 AND 120
       OR char_length(trim(COALESCE(p_scanner_name, ''))) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Invalid ticket scan request.' USING ERRCODE = '22023';
    END IF;

    SELECT assignment.*
    INTO v_assignment
    FROM public.ticketing_staff_assignments assignment
    WHERE assignment.event_id = p_event_id
      AND assignment.user_id = p_staff_user_id
      AND assignment.role = 'gate_staff'
      AND assignment.active
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active gate-staff assignment is required for this event.'
            USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_gate_name, '') <> COALESCE(v_assignment.gate_name, '') THEN
        RAISE EXCEPTION 'Gate assignment changed. Reload the scanner before scanning.'
            USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::INTEGER
    INTO v_recent_scans
    FROM public.ticketing_checkins scan
    WHERE scan.event_id = p_event_id
      AND scan.staff_user_id = p_staff_user_id
      AND scan.scanned_at > now() - interval '1 minute';

    IF v_recent_scans >= 120 THEN
        v_result := 'rate_limited';
    ELSE
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
                SELECT orders.status, item.ticket_name_snapshot
                INTO v_order_status, v_ticket_type
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
                ELSIF v_ticket.status <> 'issued' THEN
                    v_result := 'invalid';
                ELSE
                    v_result := 'accepted';
                    UPDATE public.ticketing_tickets
                    SET status = 'checked_in', checked_in_at = now()
                    WHERE id = v_ticket.id
                      AND status = 'issued'
                      AND checked_in_at IS NULL;

                    IF NOT FOUND THEN
                        v_result := 'already_used';
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.ticketing_checkins (
        event_id, ticket_id, credential_hash, gate_name, staff_user_id, device_id,
        scanner_name, scan_method, result
    ) VALUES (
        p_event_id,
        CASE WHEN v_result = 'rate_limited' THEN NULL ELSE v_ticket.id END,
        p_credential_hash,
        left(trim(COALESCE(v_assignment.gate_name, '')), 120),
        p_staff_user_id,
        left(trim(p_device_id), 120),
        left(trim(p_scanner_name), 120),
        p_scan_method,
        v_result
    );

    RETURN jsonb_build_object(
        'result', v_result,
        'ticket_reference', CASE WHEN v_result IN ('accepted', 'already_used') THEN v_ticket.ticket_reference ELSE NULL END,
        'ticket_type', CASE WHEN v_result IN ('accepted', 'already_used') THEN v_ticket_type ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_check_in(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_check_in(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT)
    TO service_role;

COMMIT;
