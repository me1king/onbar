-- Persist referral relationships and award configured points through the
-- inviter's complete referral chain when a referred member joins.

CREATE TABLE IF NOT EXISTS public.loyalty_referrals (
    referred_profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    referrer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    qualifying_order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (referred_profile_id <> referrer_profile_id)
);

CREATE INDEX IF NOT EXISTS loyalty_referrals_referrer_created_idx
    ON public.loyalty_referrals (referrer_profile_id, created_at DESC);

ALTER TABLE public.loyalty_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.loyalty_referrals TO service_role;

CREATE OR REPLACE FUNCTION public.record_loyalty_referral(
    referred_profile_id_input UUID,
    referral_code_input TEXT,
    qualifying_order_id_input BIGINT DEFAULT NULL
)
RETURNS TABLE (recorded BOOLEAN, referral_depth INTEGER, points_awarded INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_referrer_id UUID;
    v_saved_referrer_id UUID;
    v_current_referrer_id UUID;
    v_referral_code TEXT := trim(referral_code_input);
    v_referral_bonus INTEGER;
    v_depth INTEGER := 0;
    v_points_awarded INTEGER := 0;
    v_applied BOOLEAN;
    v_inserted BOOLEAN := false;
    v_rows INTEGER;
    v_visited UUID[] := ARRAY[referred_profile_id_input];
BEGIN
    IF referred_profile_id_input IS NULL OR v_referral_code IS NULL OR v_referral_code = '' THEN
        RAISE EXCEPTION 'A member and referral code are required.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = referred_profile_id_input) THEN
        RAISE EXCEPTION 'Referred member profile not found.';
    END IF;

    SELECT id INTO v_referrer_id
      FROM public.profiles
     WHERE referral_code = v_referral_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referral code is invalid.';
    END IF;
    IF v_referrer_id = referred_profile_id_input THEN
        RAISE EXCEPTION 'A member cannot refer themselves.';
    END IF;

    INSERT INTO public.loyalty_referrals (
        referred_profile_id, referrer_profile_id, referral_code, qualifying_order_id
    )
    VALUES (
        referred_profile_id_input, v_referrer_id, v_referral_code, qualifying_order_id_input
    )
    ON CONFLICT (referred_profile_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_rows > 0;

    SELECT referrer_profile_id
      INTO v_saved_referrer_id
      FROM public.loyalty_referrals
     WHERE referred_profile_id = referred_profile_id_input
     FOR UPDATE;

    IF v_saved_referrer_id <> v_referrer_id THEN
        RETURN QUERY SELECT false, 0, 0;
        RETURN;
    END IF;

    IF qualifying_order_id_input IS NOT NULL THEN
        UPDATE public.loyalty_referrals
           SET qualifying_order_id = COALESCE(qualifying_order_id, qualifying_order_id_input)
         WHERE referred_profile_id = referred_profile_id_input;
    END IF;

    SELECT COALESCE((value->'points'->>'referral_bonus')::INTEGER, 0)
      INTO v_referral_bonus
      FROM public.loyalty_config
     WHERE id = true;
    IF v_referral_bonus IS NULL OR v_referral_bonus < 0 THEN
        RAISE EXCEPTION 'The referral points rule is invalid.';
    END IF;

    IF v_referral_bonus > 0 THEN
        SELECT applied INTO v_applied
          FROM public.apply_loyalty_points(
              referred_profile_id_input,
              v_referral_bonus,
              'Referral welcome bonus',
              'referral-welcome:' || referred_profile_id_input::TEXT
          );
        IF v_applied THEN
            v_points_awarded := v_points_awarded + v_referral_bonus;
            INSERT INTO public.user_notifications (
                user_id, title, message, icon, style, action_url
            )
            VALUES (
                referred_profile_id_input,
                'Referral points added',
                'Welcome! ' || v_referral_bonus || ' referral points have been added to your balance.',
                'Zap',
                'reward',
                '/rewards'
            );
        END IF;
    END IF;

    v_current_referrer_id := v_saved_referrer_id;
    WHILE v_current_referrer_id IS NOT NULL LOOP
        IF v_current_referrer_id = ANY(v_visited) THEN
            RAISE EXCEPTION 'Referral chain contains a cycle.';
        END IF;
        IF v_depth >= 100 THEN
            RAISE EXCEPTION 'Referral chain exceeds the supported depth.';
        END IF;

        v_visited := array_append(v_visited, v_current_referrer_id);
        v_depth := v_depth + 1;

        IF v_referral_bonus > 0 THEN
            SELECT applied INTO v_applied
              FROM public.apply_loyalty_points(
                  v_current_referrer_id,
                  v_referral_bonus,
                  CASE
                      WHEN v_depth = 1 THEN 'Referral bonus for member ' || referred_profile_id_input::TEXT
                      ELSE 'Network referral level ' || v_depth || ' bonus for member ' || referred_profile_id_input::TEXT
                  END,
                  'referral:' || v_current_referrer_id::TEXT || ':' || referred_profile_id_input::TEXT
              );
            IF v_applied THEN
                v_points_awarded := v_points_awarded + v_referral_bonus;
                INSERT INTO public.user_notifications (
                    user_id, title, message, icon, style, action_url
                )
                VALUES (
                    v_current_referrer_id,
                    'Referral points added',
                    CASE
                        WHEN v_depth = 1 THEN 'A friend you referred joined. '
                        ELSE 'A member in your referral chain joined (level ' || v_depth || '). '
                    END || v_referral_bonus || ' points have been added to your balance.',
                    'Zap',
                    'reward',
                    '/rewards'
                );
            END IF;
        END IF;

        SELECT referrer_profile_id
          INTO v_current_referrer_id
          FROM public.loyalty_referrals
         WHERE referred_profile_id = v_current_referrer_id;
        IF NOT FOUND THEN
            v_current_referrer_id := NULL;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_inserted, v_depth, v_points_awarded;
END;
$$;

REVOKE ALL ON FUNCTION public.record_loyalty_referral(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_loyalty_referral(UUID, TEXT, BIGINT) TO service_role;
