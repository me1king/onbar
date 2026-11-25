ALTER TABLE public.market_waitlist
    ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS first_order_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gift_order_item_id BIGINT REFERENCES public.order_items(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS unit_list_price NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_mystery_gift BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS order_items_one_mystery_gift_per_order_uidx
    ON public.order_items (order_id)
    WHERE is_mystery_gift = true;

CREATE TABLE IF NOT EXISTS public.waitlist_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waitlist_id UUID NOT NULL REFERENCES public.market_waitlist(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('account_created', 'first_purchase')),
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    welcome_email_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (welcome_email_status IN ('pending', 'sent', 'failed', 'skipped', 'not_applicable')),
    welcome_email_sent_at TIMESTAMPTZ,
    welcome_email_error TEXT,
    welcome_popup_seen_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_lifecycle_events_user_type_unique UNIQUE (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS waitlist_lifecycle_events_created_idx
    ON public.waitlist_lifecycle_events (created_at DESC);
CREATE INDEX IF NOT EXISTS waitlist_lifecycle_events_order_idx
    ON public.waitlist_lifecycle_events (order_id)
    WHERE order_id IS NOT NULL;

ALTER TABLE public.waitlist_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_lifecycle_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.waitlist_lifecycle_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_waitlist_first_paid_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    linked_waitlist_id UUID;
    event_id UUID;
    gift_item_id BIGINT;
    paid_at TIMESTAMPTZ;
BEGIN
    IF NEW.user_id IS NULL
       OR lower(coalesce(NEW.status, '')) NOT IN ('paid', 'delivered', 'completed') THEN
        RETURN NEW;
    END IF;

    SELECT member.id
    INTO linked_waitlist_id
    FROM public.market_waitlist member
    WHERE member.user_id = NEW.user_id
       OR member.converted_to_user = NEW.user_id
    ORDER BY member.created_at ASC, member.id ASC
    LIMIT 1;

    IF linked_waitlist_id IS NULL THEN
        RETURN NEW;
    END IF;

    paid_at := coalesce(NEW.payment_verified_at, now());

    INSERT INTO public.waitlist_lifecycle_events (
        waitlist_id, user_id, event_type, order_id, welcome_email_status, metadata
    )
    VALUES (
        linked_waitlist_id,
        NEW.user_id,
        'first_purchase',
        NEW.id,
        'not_applicable',
        jsonb_build_object('giftLineName', 'Mystery Gift')
    )
    ON CONFLICT (user_id, event_type) DO NOTHING
    RETURNING id INTO event_id;

    IF event_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.order_items (
        order_id,
        product_id,
        quantity,
        unit_price,
        unit_list_price,
        unit_cost,
        size,
        addons,
        status,
        is_mystery_gift,
        product_name_snapshot
    )
    VALUES (
        NEW.id,
        NULL,
        1,
        0,
        0,
        0,
        'Mystery Gift',
        '[]'::JSONB,
        'Pending',
        true,
        'Mystery Gift'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO gift_item_id;

    IF gift_item_id IS NULL THEN
        SELECT item.id
        INTO gift_item_id
        FROM public.order_items item
        WHERE item.order_id = NEW.id
          AND item.is_mystery_gift = true
        LIMIT 1;
    END IF;

    UPDATE public.market_waitlist
    SET first_order_id = coalesce(first_order_id, NEW.id),
        first_order_at = coalesce(first_order_at, paid_at),
        gift_order_item_id = coalesce(gift_order_item_id, gift_item_id),
        updated_at = now()
    WHERE user_id = NEW.user_id
       OR converted_to_user = NEW.user_id;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_waitlist_first_paid_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_waitlist_first_paid_order() TO service_role;

DROP TRIGGER IF EXISTS waitlist_first_paid_order_gift ON public.orders;
CREATE TRIGGER waitlist_first_paid_order_gift
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.record_waitlist_first_paid_order();
