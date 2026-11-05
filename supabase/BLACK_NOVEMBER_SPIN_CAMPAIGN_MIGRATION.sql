-- Server-controlled Black November spin campaigns and one-time prize codes.
-- Apply after the core schema (including public.orders and public.coupons) exists.

CREATE TABLE IF NOT EXISTS public.spin_campaigns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    terms_url TEXT NOT NULL DEFAULT '/terms',
    prizes JSONB NOT NULL DEFAULT '[]'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
);

CREATE TABLE IF NOT EXISTS public.spin_campaign_wins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id TEXT NOT NULL REFERENCES public.spin_campaigns(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    prize_id TEXT NOT NULL,
    prize_label TEXT NOT NULL,
    prize_type TEXT NOT NULL CHECK (prize_type IN ('discount', 'free_delivery', 'free_bottle', 'free_mixers')),
    value NUMERIC NOT NULL DEFAULT 0 CHECK (value >= 0),
    minimum_order NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
    code TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    age_confirmed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    redeemed_at TIMESTAMPTZ,
    redeemed_order_id BIGINT UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
    assigned_by TEXT,
    UNIQUE (campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS spin_campaign_wins_created_idx
    ON public.spin_campaign_wins (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spin_campaign_wins_code_idx
    ON public.spin_campaign_wins (code);

ALTER TABLE public.spin_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_campaign_wins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spin_campaigns, public.spin_campaign_wins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.spin_campaigns, public.spin_campaign_wins TO service_role;

INSERT INTO public.spin_campaigns (id, title, is_active, starts_at, ends_at, terms_url, prizes)
VALUES (
    'black-november-2026',
    'Black November: Spin the Bottle',
    false,
    '2026-11-01T00:00:00+03:00',
    '2026-11-30T23:59:59+03:00',
    '/terms',
    '[
      {"id":"free-delivery","label":"Free delivery","type":"free_delivery","value":0,"weight":35,"minimum_order":0,"max_winners":null,"enabled":true},
      {"id":"ksh-100","label":"KSh 100 off","type":"discount","value":100,"weight":30,"minimum_order":0,"max_winners":null,"enabled":true},
      {"id":"ksh-200","label":"KSh 200 off","type":"discount","value":200,"weight":15,"minimum_order":0,"max_winners":null,"enabled":true},
      {"id":"free-mixers","label":"Free mixers","type":"free_mixers","value":0,"weight":10,"minimum_order":0,"max_winners":null,"enabled":true},
      {"id":"ksh-500","label":"KSh 500 off","type":"discount","value":500,"weight":8,"minimum_order":5000,"max_winners":null,"enabled":true},
      {"id":"free-bottle","label":"Free bottle","type":"free_bottle","value":0,"weight":2,"minimum_order":0,"max_winners":null,"enabled":true}
    ]'::JSONB
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.issue_spin_campaign_win(
    campaign_id_input TEXT,
    phone_input TEXT,
    prize_id_input TEXT,
    code_input TEXT,
    age_confirmed_input BOOLEAN,
    expires_at_input TIMESTAMPTZ,
    assigned_by_input TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    campaign_row public.spin_campaigns%ROWTYPE;
    prize JSONB;
    max_winners_value INTEGER;
    win_row public.spin_campaign_wins%ROWTYPE;
BEGIN
    SELECT * INTO campaign_row
      FROM public.spin_campaigns
     WHERE id = campaign_id_input
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found.';
    END IF;
    IF assigned_by_input IS NULL AND (
        NOT campaign_row.is_active
        OR now() < campaign_row.starts_at
        OR now() >= campaign_row.ends_at
    ) THEN
        RAISE EXCEPTION 'This spin campaign is not open.';
    END IF;
    IF phone_input !~ '^254[17][0-9]{8}$'
        OR prize_id_input !~ '^[a-z0-9-]{1,60}$'
        OR code_input !~ '^BN-[A-Z0-9]{6}$'
        OR expires_at_input <= now()
        OR age_confirmed_input IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid campaign win details.';
    END IF;

    SELECT item INTO prize
      FROM jsonb_array_elements(campaign_row.prizes) AS item
     WHERE item->>'id' = prize_id_input
       AND item->>'enabled' = 'true'
     LIMIT 1;
    IF prize IS NULL THEN
        RAISE EXCEPTION 'This prize is not available.';
    END IF;

    max_winners_value := NULLIF(prize->>'max_winners', '')::INTEGER;
    IF max_winners_value IS NOT NULL AND max_winners_value > 0
       AND (SELECT count(*) FROM public.spin_campaign_wins
             WHERE campaign_id = campaign_id_input AND prize_id = prize_id_input) >= max_winners_value THEN
        RAISE EXCEPTION 'This prize has already been claimed.';
    END IF;

    IF assigned_by_input IS NOT NULL THEN
        UPDATE public.spin_campaign_wins
           SET prize_id = prize_id_input,
               prize_label = prize->>'label',
               prize_type = prize->>'type',
               value = COALESCE((prize->>'value')::NUMERIC, 0),
               minimum_order = COALESCE((prize->>'minimum_order')::NUMERIC, 0),
               code = code_input,
               expires_at = expires_at_input,
               age_confirmed = age_confirmed_input,
               assigned_by = assigned_by_input
         WHERE campaign_id = campaign_id_input
           AND phone = phone_input
           AND redeemed_at IS NULL
         RETURNING * INTO win_row;
        IF NOT FOUND THEN
            INSERT INTO public.spin_campaign_wins (
                campaign_id, phone, prize_id, prize_label, prize_type, value,
                minimum_order, code, expires_at, age_confirmed, assigned_by
            ) VALUES (
                campaign_id_input, phone_input, prize_id_input, prize->>'label',
                prize->>'type', COALESCE((prize->>'value')::NUMERIC, 0),
                COALESCE((prize->>'minimum_order')::NUMERIC, 0), code_input,
                expires_at_input, age_confirmed_input, assigned_by_input
            )
            RETURNING * INTO win_row;
        END IF;
    ELSE
        INSERT INTO public.spin_campaign_wins (
            campaign_id, phone, prize_id, prize_label, prize_type, value,
            minimum_order, code, expires_at, age_confirmed
        ) VALUES (
            campaign_id_input, phone_input, prize_id_input, prize->>'label',
            prize->>'type', COALESCE((prize->>'value')::NUMERIC, 0),
            COALESCE((prize->>'minimum_order')::NUMERIC, 0), code_input,
            expires_at_input, age_confirmed_input
        )
        RETURNING * INTO win_row;
    END IF;

    RETURN to_jsonb(win_row);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'This phone number already has a campaign result.';
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_spin_campaign_win(
    code_input TEXT,
    phone_input TEXT,
    order_id_input BIGINT,
    subtotal_input NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    win_row public.spin_campaign_wins%ROWTYPE;
BEGIN
    SELECT * INTO win_row
      FROM public.spin_campaign_wins
     WHERE code = upper(trim(code_input))
     FOR UPDATE;

    IF NOT FOUND
        OR win_row.phone <> phone_input
        OR win_row.redeemed_at IS NOT NULL
        OR win_row.expires_at <= now()
        OR subtotal_input < win_row.minimum_order THEN
        RAISE EXCEPTION 'Campaign code is invalid, expired, already used, or does not meet its minimum order.';
    END IF;

    UPDATE public.spin_campaign_wins
       SET redeemed_at = now(), redeemed_order_id = order_id_input
     WHERE id = win_row.id
     RETURNING * INTO win_row;

    RETURN to_jsonb(win_row);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_spin_campaign_win(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_spin_campaign_win(TEXT, TEXT, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_spin_campaign_win(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_spin_campaign_win(TEXT, TEXT, BIGINT, NUMERIC) TO service_role;
