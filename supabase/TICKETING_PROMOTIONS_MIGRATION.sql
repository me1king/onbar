-- Event-scoped promo codes with transactional redemption limits for ticket checkout.
-- Apply after PAYHERO_TICKETING_MIGRATION.sql.

BEGIN;

ALTER TABLE public.ticketing_orders
    ADD COLUMN IF NOT EXISTS promotion_id UUID
        REFERENCES public.ticketing_promotions(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.ticketing_promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES public.ticketing_promotions(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL UNIQUE REFERENCES public.ticketing_orders(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'redeemed', 'released')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticketing_promotion_redemptions_capacity_idx
    ON public.ticketing_promotion_redemptions (promotion_id, status, expires_at);

ALTER TABLE public.ticketing_promotion_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticketing_promotion_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticketing_promotion_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.ticketing_sync_promotion_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE public.ticketing_promotion_redemptions
        SET status = 'redeemed', updated_at = now()
        WHERE order_id = NEW.id AND status = 'reserved';
    ELSIF NEW.status IN ('payment_failed', 'expired', 'cancelled')
       AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE public.ticketing_promotion_redemptions
        SET status = 'released', updated_at = now()
        WHERE order_id = NEW.id AND status = 'reserved';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticketing_orders_sync_promo_redemption ON public.ticketing_orders;
CREATE TRIGGER ticketing_orders_sync_promo_redemption
    AFTER UPDATE OF status ON public.ticketing_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.ticketing_sync_promotion_redemption();

CREATE OR REPLACE FUNCTION public.ticketing_create_checkout_with_promotion(
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_buyer_email TEXT,
    p_buyer_name TEXT,
    p_idempotency_key TEXT,
    p_access_token_hash TEXT,
    p_payment_reference TEXT,
    p_promotion_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_result JSONB;
    v_order public.ticketing_orders%ROWTYPE;
    v_reservation public.ticketing_reservations%ROWTYPE;
    v_promotion public.ticketing_promotions%ROWTYPE;
    v_code TEXT := upper(trim(COALESCE(p_promotion_code, '')));
    v_redemptions INTEGER;
    v_discount BIGINT;
    v_total BIGINT;
    v_attempt_updated INTEGER;
BEGIN
    IF length(v_code) > 40 OR (v_code <> '' AND v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$') THEN
        RAISE EXCEPTION 'Enter a valid promo code.' USING ERRCODE = '22023';
    END IF;

    v_result := public.ticketing_create_checkout(
        p_event_id, p_ticket_type_id, p_quantity, p_buyer_email, p_buyer_name,
        p_idempotency_key, p_access_token_hash, p_payment_reference
    );
    SELECT * INTO v_order
    FROM public.ticketing_orders
    WHERE id = (v_result ->> 'order_id')::UUID
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket order was not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_order.promotion_id IS NOT NULL THEN
        SELECT * INTO v_promotion
        FROM public.ticketing_promotions
        WHERE id = v_order.promotion_id;
        IF v_code = '' OR v_promotion.code <> v_code THEN
            RAISE EXCEPTION 'This checkout was already started with a different promo code.' USING ERRCODE = 'P2003';
        END IF;
    ELSIF v_code <> '' THEN
        SELECT * INTO v_promotion
        FROM public.ticketing_promotions
        WHERE event_id = p_event_id AND code = v_code
        FOR UPDATE;
        IF NOT FOUND OR NOT v_promotion.active
           OR (v_promotion.starts_at IS NOT NULL AND v_promotion.starts_at > now())
           OR (v_promotion.ends_at IS NOT NULL AND v_promotion.ends_at <= now())
           OR v_promotion.currency <> v_order.currency THEN
            RAISE EXCEPTION 'This promo code is invalid or unavailable.' USING ERRCODE = 'P2001';
        END IF;

        IF v_promotion.max_redemptions IS NOT NULL THEN
            SELECT count(*)::INTEGER INTO v_redemptions
            FROM public.ticketing_promotion_redemptions
            WHERE promotion_id = v_promotion.id
              AND (status = 'redeemed' OR (status = 'reserved' AND expires_at > now()));
            IF v_redemptions >= v_promotion.max_redemptions THEN
                RAISE EXCEPTION 'This promo code has reached its redemption limit.' USING ERRCODE = 'P2002';
            END IF;
        END IF;

        IF v_promotion.discount_type = 'percentage' THEN
            v_discount := floor(v_order.subtotal_minor::NUMERIC * v_promotion.discount_value / 100)::BIGINT;
        ELSE
            v_discount := LEAST(v_promotion.discount_value, v_order.subtotal_minor);
        END IF;
        v_total := v_order.subtotal_minor + v_order.fees_minor - v_discount;

        SELECT * INTO v_reservation
        FROM public.ticketing_reservations
        WHERE id = v_order.reservation_id;

        UPDATE public.ticketing_orders
        SET promotion_id = v_promotion.id,
            discount_minor = v_discount,
            total_minor = v_total,
            updated_at = now()
        WHERE id = v_order.id;
        UPDATE public.ticketing_payment_attempts
        SET amount_minor = v_total,
            provider = CASE WHEN v_total = 0 THEN 'complimentary' ELSE 'paystack' END,
            updated_at = now()
        WHERE order_id = v_order.id AND status = 'pending';

        INSERT INTO public.ticketing_promotion_redemptions (
            promotion_id, order_id, expires_at
        ) VALUES (
            v_promotion.id, v_order.id, v_reservation.expires_at
        )
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    SELECT total_minor INTO v_total
    FROM public.ticketing_orders
    WHERE id = v_order.id;

    IF v_result ->> 'payment_reference' = p_payment_reference
       AND v_total > 0 THEN
        IF v_total % 100 <> 0 THEN
            RAISE EXCEPTION 'PayHero M-Pesa ticket payments must be a whole KES amount.'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.ticketing_payment_attempts
        SET amount_minor = v_total,
            provider = 'payhero',
            provider_payload = jsonb_build_object('provider', 'payhero'),
            updated_at = now()
        WHERE provider = 'paystack'
          AND provider_reference = p_payment_reference
          AND status = 'pending';
        GET DIAGNOSTICS v_attempt_updated = ROW_COUNT;
        IF v_attempt_updated > 0 THEN
            v_result := jsonb_set(v_result, '{provider}', '"payhero"'::JSONB);
        END IF;
    ELSIF v_result ->> 'payment_reference' = p_payment_reference AND v_total = 0 THEN
        v_result := jsonb_set(v_result, '{provider}', '"complimentary"'::JSONB);
    END IF;

    RETURN jsonb_set(v_result, '{amount_minor}', to_jsonb(v_total));
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_create_checkout_with_promotion(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_create_checkout_with_promotion(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.ticketing_sync_promotion_redemption() FROM PUBLIC, anon, authenticated;

COMMIT;
