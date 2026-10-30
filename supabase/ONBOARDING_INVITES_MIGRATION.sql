-- Company-specific, expiring merchant onboarding invitations.
-- Run after VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql and
-- MERCHANT_OPERATIONS_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.vendor_onboarding_leads') IS NULL
       OR to_regclass('public.vendor_onboarding_events') IS NULL
       OR to_regclass('public.merchant_applications') IS NULL THEN
        RAISE EXCEPTION 'Onboarding invite migration prerequisites are missing.'
            USING HINT = 'Run VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql and MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.vendor_onboarding_leads
    ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invite_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invite_application_id UUID
        REFERENCES public.merchant_applications(id) ON DELETE SET NULL;

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS onboarding_lead_id UUID
        REFERENCES public.vendor_onboarding_leads(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_onboarding_leads_invite_hash_uidx
    ON public.vendor_onboarding_leads (invite_token_hash)
    WHERE invite_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_applications_onboarding_lead_uidx
    ON public.merchant_applications (onboarding_lead_id)
    WHERE onboarding_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.issue_vendor_onboarding_invite(
    p_lead_id UUID,
    p_token_hash TEXT,
    p_expires_at TIMESTAMPTZ,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    target_lead public.vendor_onboarding_leads%ROWTYPE;
BEGIN
    IF p_token_hash !~ '^[a-f0-9]{64}$'
       OR p_expires_at <= now()
       OR p_expires_at > now() + INTERVAL '30 days'
       OR nullif(trim(p_actor), '') IS NULL THEN
        RAISE EXCEPTION 'A valid token, expiry, and administrator are required.';
    END IF;

    SELECT * INTO target_lead
    FROM public.vendor_onboarding_leads
    WHERE id = p_lead_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding lead not found.';
    END IF;
    IF target_lead.vendor_type NOT IN ('retailer', 'wholesaler', 'street_food') THEN
        RAISE EXCEPTION 'Private merchant application links are only available for vendor companies.';
    END IF;
    IF target_lead.stage = 'live' OR target_lead.invite_application_id IS NOT NULL THEN
        RAISE EXCEPTION 'This company already completed onboarding.';
    END IF;

    UPDATE public.vendor_onboarding_leads
    SET invite_token_hash = p_token_hash,
        invite_expires_at = p_expires_at,
        invite_used_at = NULL,
        updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
    VALUES (p_lead_id, 'onboarding_invite_issued', trim(p_actor),
        jsonb_build_object('expires_at', p_expires_at));

    RETURN jsonb_build_object(
        'lead_id', target_lead.id,
        'business_name', target_lead.business_name,
        'vendor_type', target_lead.vendor_type,
        'expires_at', p_expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_vendor_onboarding_invite(
    p_token_hash TEXT,
    p_application_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    target_lead public.vendor_onboarding_leads%ROWTYPE;
BEGIN
    SELECT * INTO target_lead
    FROM public.vendor_onboarding_leads
    WHERE invite_token_hash = p_token_hash
      AND invite_expires_at > now()
      AND invite_used_at IS NULL
      AND invite_application_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This company onboarding link is invalid, expired, or already used.';
    END IF;

    UPDATE public.vendor_onboarding_leads
    SET invite_used_at = now(),
        invite_application_id = p_application_id,
        updated_at = now()
    WHERE id = target_lead.id;

    INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
    VALUES (
        target_lead.id,
        'company_application_submitted',
        'applicant',
        jsonb_build_object('application_id', p_application_id)
    );

    RETURN target_lead.id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vendor_onboarding_invite(UUID, TEXT, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_vendor_onboarding_invite(TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vendor_onboarding_invite(UUID, TEXT, TIMESTAMPTZ, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_vendor_onboarding_invite(TEXT, UUID)
    TO service_role;

COMMIT;
