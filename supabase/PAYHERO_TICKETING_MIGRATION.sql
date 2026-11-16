-- PayHero M-Pesa checkout for paid ticket orders only.
-- Apply after the commerce, sales-report, and promotions migrations.
BEGIN;

ALTER TABLE public.ticketing_payment_attempts
    DROP CONSTRAINT IF EXISTS ticketing_payment_attempts_provider_check;
ALTER TABLE public.ticketing_payment_attempts
    ADD CONSTRAINT ticketing_payment_attempts_provider_check
    CHECK (provider IN ('daraja', 'paystack', 'payhero', 'complimentary', 'manual'));

CREATE OR REPLACE FUNCTION public.ticketing_create_payhero_checkout(
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
    v_checkout JSONB;
    v_provider_payload JSONB;
BEGIN
    v_checkout := public.ticketing_create_checkout(
        p_event_id,
        p_ticket_type_id,
        p_quantity,
        p_buyer_email,
        p_buyer_name,
        p_idempotency_key,
        p_access_token_hash,
        p_payment_reference
    );

    IF v_checkout ->> 'provider' = 'paystack'
       AND v_checkout ->> 'payment_reference' = p_payment_reference
       AND COALESCE((v_checkout ->> 'amount_minor')::BIGINT, 0) > 0 THEN
        IF (v_checkout ->> 'amount_minor')::BIGINT % 100 <> 0 THEN
            RAISE EXCEPTION 'PayHero M-Pesa ticket payments must be a whole KES amount.'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.ticketing_payment_attempts
        SET provider = 'payhero',
            provider_payload = jsonb_build_object('provider', 'payhero'),
            updated_at = now()
        WHERE provider = 'paystack'
          AND provider_reference = p_payment_reference
          AND status = 'pending';
        IF FOUND THEN
            v_checkout := jsonb_set(v_checkout, '{provider}', '"payhero"'::JSONB);
        END IF;
    END IF;

    IF v_checkout ->> 'provider' = 'payhero' THEN
        SELECT provider_payload INTO v_provider_payload
        FROM public.ticketing_payment_attempts
        WHERE provider = 'payhero'
          AND provider_reference = v_checkout ->> 'payment_reference';
        v_checkout := v_checkout || jsonb_build_object(
            'payhero_reference', v_provider_payload ->> 'payhero_reference',
            'checkout_request_id', v_provider_payload ->> 'checkout_request_id',
            'initialization_status', v_provider_payload ->> 'initialization_status'
        );
    END IF;

    RETURN v_checkout;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_create_payhero_checkout_with_promotion(
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_buyer_email TEXT,
    p_buyer_name TEXT,
    p_idempotency_key TEXT,
    p_access_token_hash TEXT,
    p_payment_reference TEXT,
    p_promotion_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM public.ticketing_create_checkout_with_promotion(
        p_event_id,
        p_ticket_type_id,
        p_quantity,
        p_buyer_email,
        p_buyer_name,
        p_idempotency_key,
        p_access_token_hash,
        p_payment_reference,
        p_promotion_code
    );

    RETURN public.ticketing_create_payhero_checkout(
        p_event_id,
        p_ticket_type_id,
        p_quantity,
        p_buyer_email,
        p_buyer_name,
        p_idempotency_key,
        p_access_token_hash,
        p_payment_reference
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_claim_payhero_initialization(
    p_payment_reference TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.ticketing_payment_attempts
    SET provider_payload = provider_payload || jsonb_build_object(
            'initialization_status', 'started',
            'initialization_started_at', now()
        ),
        updated_at = now()
    WHERE provider = 'payhero'
      AND provider_reference = p_payment_reference
      AND status = 'pending'
      AND provider_payload ->> 'initialization_status' IS NULL;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_save_payhero_reference(
    p_payment_reference TEXT,
    p_payhero_reference TEXT,
    p_checkout_request_id TEXT,
    p_callback_secret_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_payment_reference IS NULL OR p_payment_reference !~ '^OBT-[A-F0-9]{32}$'
       OR p_payhero_reference IS NULL OR length(trim(p_payhero_reference)) NOT BETWEEN 1 AND 160
       OR p_checkout_request_id IS NULL OR length(trim(p_checkout_request_id)) NOT BETWEEN 1 AND 160
       OR p_callback_secret_hash IS NULL OR p_callback_secret_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid PayHero transaction details.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ticketing_payment_attempts
    SET provider_payload = provider_payload || jsonb_build_object(
            'payhero_reference', trim(p_payhero_reference),
            'checkout_request_id', trim(p_checkout_request_id),
            'callback_secret_hash', p_callback_secret_hash
        ),
        updated_at = now()
    WHERE provider = 'payhero'
      AND provider_reference = p_payment_reference
      AND status = 'pending';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_confirm_payhero_checkout(
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
    v_result JSONB;
BEGIN
    UPDATE public.ticketing_payment_attempts
    SET provider = 'paystack'
    WHERE provider = 'payhero'
      AND provider_reference = p_payment_reference;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PayHero payment attempt was not found.' USING ERRCODE = 'P0002';
    END IF;

    v_result := public.ticketing_confirm_checkout(
        p_payment_reference, p_amount_minor, p_currency, p_credentials
    );

    UPDATE public.ticketing_payment_attempts
    SET provider = 'payhero'
    WHERE provider = 'paystack'
      AND provider_reference = p_payment_reference;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_fail_payhero_checkout(
    p_payment_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    UPDATE public.ticketing_payment_attempts
    SET provider = 'paystack'
    WHERE provider = 'payhero'
      AND provider_reference = p_payment_reference;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PayHero payment attempt was not found.' USING ERRCODE = 'P0002';
    END IF;

    v_result := public.ticketing_fail_checkout(p_payment_reference);

    UPDATE public.ticketing_payment_attempts
    SET provider = 'payhero'
    WHERE provider = 'paystack'
      AND provider_reference = p_payment_reference;

    RETURN v_result;
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
      AND provider IN ('paystack', 'payhero')
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
        CASE WHEN v_attempt.provider = 'payhero'
            THEN 'payhero:verified-callback'
            ELSE 'paystack:verified-callback'
        END,
        'ticket_order.reconciliation_required',
        'ticket_order', v_order.id::TEXT, p_reason,
        jsonb_build_object(
            'payment_status', 'reconciliation_required',
            'reservation_status', v_reservation.status
        )
    );
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_create_payhero_checkout(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_create_payhero_checkout(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_create_payhero_checkout_with_promotion(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_create_payhero_checkout_with_promotion(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_claim_payhero_initialization(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_claim_payhero_initialization(TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_save_payhero_reference(TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_save_payhero_reference(TEXT, TEXT, TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_confirm_payhero_checkout(TEXT, BIGINT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_confirm_payhero_checkout(TEXT, BIGINT, TEXT, JSONB)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_fail_payhero_checkout(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_fail_payhero_checkout(TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_flag_payment_for_review(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_flag_payment_for_review(TEXT, TEXT)
    TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
