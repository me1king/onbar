-- Verified Paystack checkout and ticket issuance for the isolated ticketing tables.
-- Apply after the core, service-fee, waves, and scanner migrations.
BEGIN;

-- The checkout function below creates KES-only payment attempts and omits this
-- value in its insert, so the schema default must match the supported currency.
ALTER TABLE public.ticketing_payment_attempts
    ALTER COLUMN currency SET DEFAULT 'KES';

ALTER TABLE public.ticketing_orders
    ADD COLUMN IF NOT EXISTS access_token_hash TEXT;

ALTER TABLE public.ticketing_tickets
    ADD COLUMN IF NOT EXISTS credential_ciphertext TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ticketing_orders_access_token_hash_idx
    ON public.ticketing_orders (access_token_hash)
    WHERE access_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ticketing_create_checkout(
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_buyer_email TEXT,
    p_buyer_name TEXT,
    p_idempotency_key TEXT,
    p_access_token_hash TEXT,
    p_payment_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_event public.ticketing_events%ROWTYPE;
    v_type public.ticketing_ticket_types%ROWTYPE;
    v_existing_reservation public.ticketing_reservations%ROWTYPE;
    v_reservation JSONB;
    v_reservation_id UUID;
    v_order public.ticketing_orders%ROWTYPE;
    v_attempt public.ticketing_payment_attempts%ROWTYPE;
    v_subtotal BIGINT;
    v_fees BIGINT;
    v_total BIGINT;
    v_provider TEXT;
BEGIN
    IF p_event_id IS NULL OR p_ticket_type_id IS NULL
       OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 20
       OR p_buyer_email IS NULL OR length(trim(p_buyer_email)) NOT BETWEEN 3 AND 320
       OR length(trim(COALESCE(p_buyer_name, ''))) > 160
       OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[0-9a-f]{64}$'
       OR p_access_token_hash IS NULL OR p_access_token_hash !~ '^[0-9a-f]{64}$'
       OR p_payment_reference IS NULL OR p_payment_reference !~ '^OBT-[A-F0-9]{32}$' THEN
        RAISE EXCEPTION 'Invalid checkout details.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
    SELECT * INTO v_existing_reservation
    FROM public.ticketing_reservations
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        SELECT * INTO v_order
        FROM public.ticketing_orders
        WHERE reservation_id = v_existing_reservation.id
        FOR UPDATE;
        IF FOUND THEN
            IF v_order.access_token_hash IS DISTINCT FROM p_access_token_hash THEN
                RAISE EXCEPTION 'Checkout idempotency key belongs to a different access token.' USING ERRCODE = '23505';
            END IF;
            SELECT * INTO v_attempt
            FROM public.ticketing_payment_attempts
            WHERE order_id = v_order.id
            ORDER BY created_at DESC
            LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Checkout payment attempt is missing.' USING ERRCODE = 'P0001';
            END IF;
            RETURN jsonb_build_object(
                'order_id', v_order.id,
                'order_reference', v_order.reference,
                'amount_minor', v_order.total_minor,
                'currency', v_order.currency,
                'payment_reference', v_attempt.provider_reference,
                'provider', v_attempt.provider,
                'authorization_url', v_attempt.provider_payload ->> 'authorization_url',
                'status', v_order.status
            );
        END IF;
    END IF;

    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = p_event_id
    FOR SHARE;
    IF NOT FOUND OR v_event.status <> 'on_sale' THEN
        RAISE EXCEPTION 'Event is not on sale.' USING ERRCODE = 'P0002';
    END IF;

    v_reservation := public.ticketing_reserve_inventory(
        p_event_id,
        p_ticket_type_id,
        p_quantity,
        lower(trim(p_buyer_email)),
        left(trim(COALESCE(p_buyer_name, '')), 160),
        p_idempotency_key
    );
    v_reservation_id := (v_reservation ->> 'reservation_id')::UUID;

    SELECT * INTO v_order
    FROM public.ticketing_orders
    WHERE reservation_id = v_reservation_id
    FOR UPDATE;
    IF FOUND THEN
        IF v_order.access_token_hash IS DISTINCT FROM p_access_token_hash THEN
            RAISE EXCEPTION 'Checkout idempotency key belongs to a different access token.' USING ERRCODE = '23505';
        END IF;
        SELECT * INTO v_attempt
        FROM public.ticketing_payment_attempts
        WHERE order_id = v_order.id
        ORDER BY created_at DESC
        LIMIT 1;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Checkout payment attempt is missing.' USING ERRCODE = 'P0001';
        END IF;
        RETURN jsonb_build_object(
            'order_id', v_order.id,
            'order_reference', v_order.reference,
            'amount_minor', v_order.total_minor,
            'currency', v_order.currency,
            'payment_reference', v_attempt.provider_reference,
            'provider', v_attempt.provider,
            'authorization_url', v_attempt.provider_payload ->> 'authorization_url',
            'status', v_order.status
        );
    END IF;

    IF v_reservation ->> 'status' IS DISTINCT FROM 'reserved'
       OR (v_reservation ->> 'expires_at')::TIMESTAMPTZ <= now() THEN
        RAISE EXCEPTION 'The ticket reservation has expired. Start a new checkout.' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_type
    FROM public.ticketing_ticket_types
    WHERE id = p_ticket_type_id AND event_id = p_event_id
    FOR UPDATE;
    IF NOT FOUND OR v_type.status <> 'active' OR v_type.currency <> 'KES' THEN
        RAISE EXCEPTION 'Ticket type is not available.' USING ERRCODE = 'P0002';
    END IF;

    v_subtotal := v_type.price_minor * p_quantity;
    v_fees := v_event.service_fee_minor * p_quantity;
    v_total := v_subtotal + v_fees;
    v_provider := CASE WHEN v_total = 0 THEN 'complimentary' ELSE 'paystack' END;

    INSERT INTO public.ticketing_orders (
        event_id, reservation_id, buyer_email, buyer_name, currency,
        subtotal_minor, fees_minor, total_minor, access_token_hash
    ) VALUES (
        p_event_id, v_reservation_id, lower(trim(p_buyer_email)),
        left(trim(COALESCE(p_buyer_name, '')), 160), 'KES',
        v_subtotal, v_fees, v_total, p_access_token_hash
    ) RETURNING * INTO v_order;

    INSERT INTO public.ticketing_order_items (
        order_id, ticket_type_id, ticket_name_snapshot, quantity,
        unit_price_minor, line_total_minor
    ) VALUES (
        v_order.id, v_type.id, v_type.name, p_quantity,
        v_type.price_minor, v_subtotal
    );

    INSERT INTO public.ticketing_payment_attempts (
        order_id, provider, provider_reference, idempotency_key, amount_minor, currency, status
    ) VALUES (
        v_order.id, v_provider, p_payment_reference, p_idempotency_key,
        v_total, 'KES', 'pending'
    ) RETURNING * INTO v_attempt;

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_reference', v_order.reference,
        'amount_minor', v_order.total_minor,
        'currency', v_order.currency,
        'payment_reference', v_attempt.provider_reference,
        'provider', v_attempt.provider,
        'authorization_url', NULL,
        'status', v_order.status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_save_checkout_url(
    p_payment_reference TEXT,
    p_authorization_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_authorization_url IS NULL
       OR p_authorization_url !~ '^https://(checkout\.)?paystack\.com/'
       OR length(p_authorization_url) > 2048 THEN
        RAISE EXCEPTION 'Invalid Paystack authorization URL.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ticketing_payment_attempts
    SET provider_payload = jsonb_build_object('authorization_url', p_authorization_url),
        updated_at = now()
    WHERE provider = 'paystack'
      AND provider_reference = p_payment_reference
      AND status = 'pending';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_confirm_checkout(
    p_payment_reference TEXT,
    p_amount_minor BIGINT,
    p_currency TEXT,
    p_credentials JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_attempt public.ticketing_payment_attempts%ROWTYPE;
    v_order public.ticketing_orders%ROWTYPE;
    v_reservation public.ticketing_reservations%ROWTYPE;
    v_type public.ticketing_ticket_types%ROWTYPE;
    v_event public.ticketing_events%ROWTYPE;
    v_item public.ticketing_order_items%ROWTYPE;
    v_expected_count INTEGER;
    v_sold INTEGER;
    v_reserved INTEGER;
    v_credential JSONB;
    v_inserted INTEGER := 0;
BEGIN
    IF p_payment_reference IS NULL OR length(p_payment_reference) > 120
       OR p_amount_minor IS NULL OR p_amount_minor < 0
       OR p_currency IS DISTINCT FROM 'KES'
       OR jsonb_typeof(p_credentials) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid verified payment details.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
    FROM public.ticketing_payment_attempts
    WHERE provider_reference = p_payment_reference
      AND provider IN ('paystack', 'complimentary')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment attempt was not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_order
    FROM public.ticketing_orders
    WHERE id = v_attempt.order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket order was not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_order.status = 'paid' AND v_attempt.status = 'succeeded' THEN
        RETURN jsonb_build_object('status', 'paid', 'order_id', v_order.id, 'already_processed', true);
    END IF;
    IF v_order.status = 'reconciliation_required'
       AND v_attempt.status = 'reconciliation_required' THEN
        RETURN jsonb_build_object('status', 'reconciliation_required', 'order_id', v_order.id);
    END IF;
    IF v_attempt.status <> 'pending' OR v_order.status <> 'pending_payment'
       OR v_attempt.amount_minor <> p_amount_minor
       OR v_order.total_minor <> p_amount_minor THEN
        RAISE EXCEPTION 'Payment details do not match the pending order.' USING ERRCODE = '23514';
    END IF;
    IF (v_attempt.provider = 'complimentary' AND p_amount_minor <> 0)
       OR (v_attempt.provider = 'paystack' AND p_amount_minor = 0) THEN
        RAISE EXCEPTION 'Payment provider does not match the order amount.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_reservation
    FROM public.ticketing_reservations
    WHERE id = v_order.reservation_id
    FOR UPDATE;
    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = v_order.event_id
    FOR SHARE;
    SELECT * INTO v_item
    FROM public.ticketing_order_items
    WHERE order_id = v_order.id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket order item was not found.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_type
    FROM public.ticketing_ticket_types
    WHERE id = v_item.ticket_type_id
    FOR UPDATE;

    v_expected_count := v_item.quantity;
    IF jsonb_array_length(p_credentials) <> v_expected_count THEN
        RAISE EXCEPTION 'Ticket credential count does not match the order quantity.' USING ERRCODE = '22023';
    END IF;
    FOR v_credential IN SELECT value FROM jsonb_array_elements(p_credentials)
    LOOP
        IF jsonb_typeof(v_credential) <> 'object'
           OR COALESCE(v_credential ->> 'credential_hash', '') !~ '^[0-9a-f]{64}$'
           OR length(COALESCE(v_credential ->> 'credential_ciphertext', '')) NOT BETWEEN 40 AND 256 THEN
            RAISE EXCEPTION 'A ticket credential is invalid.' USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF v_event.status NOT IN ('on_sale', 'sold_out') THEN
        UPDATE public.ticketing_payment_attempts
        SET status = 'reconciliation_required', verified_at = now(), updated_at = now()
        WHERE id = v_attempt.id;
        UPDATE public.ticketing_orders
        SET status = 'reconciliation_required', updated_at = now()
        WHERE id = v_order.id;
        UPDATE public.ticketing_reservations
        SET status = 'reconciliation_required', updated_at = now()
        WHERE id = v_reservation.id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'order_id', v_order.id);
    END IF;

    SELECT count(*)::INTEGER INTO v_sold
    FROM public.ticketing_tickets ticket
    JOIN public.ticketing_order_items item ON item.id = ticket.order_item_id
    JOIN public.ticketing_orders order_record ON order_record.id = item.order_id
    WHERE item.ticket_type_id = v_type.id
      AND ticket.status IN ('issued', 'checked_in')
      AND order_record.status = 'paid';
    SELECT COALESCE(sum(quantity), 0)::INTEGER INTO v_reserved
    FROM public.ticketing_reservations
    WHERE ticket_type_id = v_type.id
      AND id <> v_reservation.id
      AND status = 'reserved'
      AND expires_at > now();
    IF v_sold + v_reserved + v_reservation.quantity > v_type.capacity THEN
        UPDATE public.ticketing_payment_attempts
        SET status = 'reconciliation_required', verified_at = now(), updated_at = now()
        WHERE id = v_attempt.id;
        UPDATE public.ticketing_orders
        SET status = 'reconciliation_required', updated_at = now()
        WHERE id = v_order.id;
        UPDATE public.ticketing_reservations
        SET status = 'reconciliation_required', updated_at = now()
        WHERE id = v_reservation.id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'order_id', v_order.id);
    END IF;

    UPDATE public.ticketing_orders
    SET status = 'paid', paid_at = now(), updated_at = now()
    WHERE id = v_order.id;
    UPDATE public.ticketing_payment_attempts
    SET status = 'succeeded', verified_at = now(), updated_at = now()
    WHERE id = v_attempt.id;
    UPDATE public.ticketing_reservations
    SET status = 'converted', updated_at = now()
    WHERE id = v_reservation.id;

    FOR v_credential IN SELECT value FROM jsonb_array_elements(p_credentials)
    LOOP
        INSERT INTO public.ticketing_tickets (
            event_id, order_item_id, attendee_name, attendee_email,
            credential_hash, credential_ciphertext
        ) VALUES (
            v_order.event_id, v_item.id, v_order.buyer_name, v_order.buyer_email,
            v_credential ->> 'credential_hash', v_credential ->> 'credential_ciphertext'
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, after_state
    ) VALUES (
        v_order.buyer_email, 'ticket_order.paid_and_issued', 'ticket_order', v_order.id::TEXT,
        jsonb_build_object(
            'event_id', v_order.event_id, 'quantity', v_inserted,
            'amount_minor', v_order.total_minor, 'currency', v_order.currency
        )
    );

    RETURN jsonb_build_object('status', 'paid', 'order_id', v_order.id, 'ticket_count', v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_flag_payment_for_review(
    p_payment_reference TEXT,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_attempt public.ticketing_payment_attempts%ROWTYPE;
    v_order public.ticketing_orders%ROWTYPE;
    v_reservation public.ticketing_reservations%ROWTYPE;
BEGIN
    IF p_payment_reference IS NULL OR p_reason IS NULL
       OR p_reason NOT IN ('provider_status_mismatch', 'transaction_details_mismatch', 'inventory_changed_after_payment') THEN
        RAISE EXCEPTION 'Invalid payment review details.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
    FROM public.ticketing_payment_attempts
    WHERE provider_reference = p_payment_reference
      AND provider = 'paystack'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment attempt was not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_order
    FROM public.ticketing_orders
    WHERE id = v_attempt.order_id
    FOR UPDATE;
    IF v_order.status IN ('paid', 'reconciliation_required') THEN
        RETURN TRUE;
    END IF;

    UPDATE public.ticketing_payment_attempts
    SET status = 'reconciliation_required', verified_at = now(), updated_at = now()
    WHERE id = v_attempt.id;
    UPDATE public.ticketing_orders
    SET status = 'reconciliation_required', updated_at = now()
    WHERE id = v_order.id;
    UPDATE public.ticketing_reservations
    SET status = 'reconciliation_required', updated_at = now()
    WHERE id = v_order.reservation_id
      AND status IN ('reserved', 'expired');
    SELECT * INTO v_reservation
    FROM public.ticketing_reservations
    WHERE id = v_order.reservation_id;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, reason, after_state
    ) VALUES (
        'paystack:verified-callback', 'ticket_order.reconciliation_required',
        'ticket_order', v_order.id::TEXT, p_reason,
        jsonb_build_object(
            'payment_status', 'reconciliation_required',
            'reservation_status', v_reservation.status
        )
    );
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_create_checkout(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_create_checkout(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_save_checkout_url(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_save_checkout_url(TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_confirm_checkout(TEXT, BIGINT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_confirm_checkout(TEXT, BIGINT, TEXT, JSONB)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_flag_payment_for_review(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_flag_payment_for_review(TEXT, TEXT)
    TO service_role;

COMMIT;
