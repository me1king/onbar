BEGIN;

ALTER TABLE public.ticketing_orders
    ADD COLUMN IF NOT EXISTS buyer_phone TEXT,
    ADD COLUMN IF NOT EXISTS access_token_ciphertext TEXT;

ALTER TABLE public.ticketing_orders
    DROP CONSTRAINT IF EXISTS ticketing_orders_buyer_phone_format_check,
    DROP CONSTRAINT IF EXISTS ticketing_orders_access_token_ciphertext_length_check;
ALTER TABLE public.ticketing_orders
    ADD CONSTRAINT ticketing_orders_buyer_phone_format_check
        CHECK (buyer_phone IS NULL OR buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
    ADD CONSTRAINT ticketing_orders_access_token_ciphertext_length_check
        CHECK (access_token_ciphertext IS NULL OR length(access_token_ciphertext) BETWEEN 40 AND 256);

CREATE TABLE IF NOT EXISTS public.ticketing_whatsapp_deliveries (
    order_id UUID PRIMARY KEY REFERENCES public.ticketing_orders(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    claim_id UUID,
    locked_until TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'sending') = (locked_until IS NOT NULL)),
    CHECK ((status = 'sending') = (claim_id IS NOT NULL))
);

ALTER TABLE public.ticketing_whatsapp_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticketing_whatsapp_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticketing_whatsapp_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.ticketing_claim_whatsapp_delivery(p_order_id UUID, p_claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_status TEXT;
    v_locked_until TIMESTAMPTZ;
BEGIN
    IF p_claim_id IS NULL THEN
        RAISE EXCEPTION 'A delivery claim ID is required.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.ticketing_orders
        WHERE id = p_order_id AND status = 'paid'
    ) THEN
        RETURN jsonb_build_object('status', 'not_paid');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.ticketing_orders
        WHERE id = p_order_id
          AND buyer_phone IS NOT NULL
          AND access_token_ciphertext IS NOT NULL
    ) THEN
        RETURN jsonb_build_object('status', 'skipped');
    END IF;

    INSERT INTO public.ticketing_whatsapp_deliveries (order_id)
    VALUES (p_order_id)
    ON CONFLICT (order_id) DO NOTHING;

    SELECT status, locked_until
    INTO v_status, v_locked_until
    FROM public.ticketing_whatsapp_deliveries
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_status = 'sent' THEN
        RETURN jsonb_build_object('status', 'sent');
    END IF;
    IF v_status = 'sending' AND v_locked_until > now() THEN
        RETURN jsonb_build_object('status', 'busy');
    END IF;

    UPDATE public.ticketing_whatsapp_deliveries
    SET status = 'sending',
        attempts = attempts + 1,
        claim_id = p_claim_id,
        locked_until = now() + interval '5 minutes',
        last_error = NULL,
        updated_at = now()
    WHERE order_id = p_order_id;
    RETURN jsonb_build_object('status', 'claimed', 'claim_id', p_claim_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_finish_whatsapp_delivery(
    p_order_id UUID,
    p_claim_id UUID,
    p_sent BOOLEAN,
    p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_claim_id IS NULL OR p_sent IS NULL
       OR (NOT p_sent AND length(COALESCE(p_error, '')) > 1000) THEN
        RAISE EXCEPTION 'Invalid ticket WhatsApp delivery result.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ticketing_whatsapp_deliveries
    SET status = CASE WHEN p_sent THEN 'sent' ELSE 'pending' END,
        claim_id = NULL,
        locked_until = NULL,
        sent_at = CASE WHEN p_sent THEN now() ELSE NULL END,
        last_error = CASE WHEN p_sent THEN NULL ELSE NULLIF(trim(p_error), '') END,
        updated_at = now()
    WHERE order_id = p_order_id
      AND status = 'sending'
      AND claim_id = p_claim_id;
    IF FOUND AND p_sent THEN
        UPDATE public.ticketing_orders
        SET access_token_ciphertext = NULL
        WHERE id = p_order_id;
    END IF;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_claim_whatsapp_delivery(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_claim_whatsapp_delivery(UUID, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_finish_whatsapp_delivery(UUID, UUID, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_finish_whatsapp_delivery(UUID, UUID, BOOLEAN, TEXT)
    TO service_role;

COMMIT;
