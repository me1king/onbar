-- Invite-only affiliate enrolment. Apply after AFFILIATE_PROGRAM_MIGRATION.sql.

CREATE TABLE IF NOT EXISTS public.affiliate_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    business_name TEXT NOT NULL,
    commission_rate NUMERIC NOT NULL DEFAULT 5
        CHECK (commission_rate > 0 AND commission_rate <= 100),
    token_hash TEXT NOT NULL UNIQUE
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    invited_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    CHECK ((accepted_at IS NULL) = (accepted_user_id IS NULL))
);

CREATE INDEX IF NOT EXISTS affiliate_invitations_email_status_idx
    ON public.affiliate_invitations (lower(email), created_at DESC);

ALTER TABLE public.affiliate_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.affiliate_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.accept_affiliate_invitation(
    p_token_hash TEXT,
    p_user_id UUID,
    p_business_name TEXT,
    p_bio TEXT,
    p_audience_size INTEGER,
    p_primary_channels TEXT[],
    p_payout_method TEXT,
    p_payout_details TEXT,
    p_agreement_version TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_invitation public.affiliate_invitations%ROWTYPE;
    v_email TEXT;
    v_referral_code TEXT;
BEGIN
    IF p_token_hash !~ '^[a-f0-9]{64}$'
        OR length(trim(p_business_name)) < 2 OR length(p_business_name) > 120
        OR length(trim(p_bio)) < 10 OR length(p_bio) > 2000
        OR p_audience_size < 0 OR p_audience_size > 100000000
        OR p_payout_method NOT IN ('M-Pesa', 'Bank')
        OR length(trim(p_payout_details)) < 3 OR length(p_payout_details) > 200
        OR p_agreement_version IS NULL OR length(p_agreement_version) > 80
        OR cardinality(p_primary_channels) < 1
        OR p_primary_channels <@ ARRAY['Instagram', 'TikTok', 'WhatsApp', 'Website']::TEXT[] IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid affiliate enrolment details';
    END IF;

    SELECT lower(email) INTO v_email
    FROM auth.users
    WHERE id = p_user_id;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'A signed-in account with a verified email is required';
    END IF;

    SELECT * INTO v_invitation
    FROM public.affiliate_invitations
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND OR lower(v_invitation.email) <> v_email THEN
        RAISE EXCEPTION 'This invitation is invalid for the signed-in account';
    END IF;
    IF v_invitation.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invitation has already been accepted';
    END IF;
    IF v_invitation.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invitation has been revoked';
    END IF;
    IF v_invitation.expires_at <= now() THEN
        RAISE EXCEPTION 'This invitation has expired';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.affiliates
        WHERE user_id = p_user_id
          AND verification_status IN ('Verified', 'Pending', 'Suspended')
    ) THEN
        RAISE EXCEPTION 'This account already has an active affiliate record';
    END IF;

    SELECT referral_code INTO v_referral_code
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Create a customer profile before accepting this invitation';
    END IF;
    IF v_referral_code IS NULL OR trim(v_referral_code) = '' THEN
        v_referral_code := 'OB-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
        UPDATE public.profiles
        SET referral_code = v_referral_code
        WHERE id = p_user_id;
    END IF;

    INSERT INTO public.affiliates (
        user_id, referral_code, business_name, bio, audience_size, primary_channels,
        preferred_payout_method, payout_details, verification_status,
        commission_rate_override, marketing_agreement_accepted,
        agreement_version, agreement_accepted_at, updated_at
    ) VALUES (
        p_user_id, v_referral_code, trim(p_business_name), trim(p_bio), p_audience_size,
        p_primary_channels, p_payout_method, trim(p_payout_details), 'Verified',
        v_invitation.commission_rate, true, p_agreement_version, now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        referral_code = EXCLUDED.referral_code,
        business_name = EXCLUDED.business_name,
        bio = EXCLUDED.bio,
        audience_size = EXCLUDED.audience_size,
        primary_channels = EXCLUDED.primary_channels,
        preferred_payout_method = EXCLUDED.preferred_payout_method,
        payout_details = EXCLUDED.payout_details,
        verification_status = 'Verified',
        commission_rate_override = EXCLUDED.commission_rate_override,
        marketing_agreement_accepted = true,
        agreement_version = EXCLUDED.agreement_version,
        agreement_accepted_at = now(),
        updated_at = now();

    UPDATE public.affiliate_invitations
    SET accepted_at = now(), accepted_user_id = p_user_id
    WHERE id = v_invitation.id;

    RETURN v_referral_code;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_affiliate_invitation(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT[], TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_affiliate_invitation(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT[], TEXT, TEXT, TEXT)
    TO service_role;

NOTIFY pgrst, 'reload schema';
