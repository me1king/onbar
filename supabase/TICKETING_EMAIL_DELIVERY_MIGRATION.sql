BEGIN;

CREATE TABLE IF NOT EXISTS public.ticketing_email_deliveries (
    order_id UUID PRIMARY KEY REFERENCES public.ticketing_orders(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    locked_until TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'sending') = (locked_until IS NOT NULL))
);

ALTER TABLE public.ticketing_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticketing_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticketing_email_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.ticketing_claim_email_delivery(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_status TEXT;
    v_locked_until TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.ticketing_orders
        WHERE id = p_order_id AND status = 'paid'
    ) THEN
        RETURN 'not_paid';
    END IF;

    INSERT INTO public.ticketing_email_deliveries (order_id)
    VALUES (p_order_id)
    ON CONFLICT (order_id) DO NOTHING;

    SELECT status, locked_until
    INTO v_status, v_locked_until
    FROM public.ticketing_email_deliveries
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_status = 'sent' THEN
        RETURN 'sent';
    END IF;
    IF v_status = 'sending' AND v_locked_until > now() THEN
        RETURN 'busy';
    END IF;

    UPDATE public.ticketing_email_deliveries
    SET status = 'sending',
        attempts = attempts + 1,
        locked_until = now() + interval '5 minutes',
        last_error = NULL,
        updated_at = now()
    WHERE order_id = p_order_id;
    RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_finish_email_delivery(
    p_order_id UUID,
    p_sent BOOLEAN,
    p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_sent IS NULL OR (NOT p_sent AND length(COALESCE(p_error, '')) > 1000) THEN
        RAISE EXCEPTION 'Invalid ticket email delivery result.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ticketing_email_deliveries
    SET status = CASE WHEN p_sent THEN 'sent' ELSE 'pending' END,
        locked_until = NULL,
        sent_at = CASE WHEN p_sent THEN now() ELSE NULL END,
        last_error = CASE WHEN p_sent THEN NULL ELSE NULLIF(trim(p_error), '') END,
        updated_at = now()
    WHERE order_id = p_order_id AND status = 'sending';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_claim_email_delivery(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_claim_email_delivery(UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_finish_email_delivery(UUID, BOOLEAN, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_finish_email_delivery(UUID, BOOLEAN, TEXT)
    TO service_role;

COMMIT;
