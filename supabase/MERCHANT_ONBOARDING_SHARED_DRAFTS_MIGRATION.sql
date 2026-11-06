-- Shared, resumable merchant onboarding for private vendor invitations.
-- Run after VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql and
-- ONBOARDING_INVITES_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.vendor_onboarding_leads') IS NULL
       OR to_regclass('public.vendor_onboarding_events') IS NULL THEN
        RAISE EXCEPTION 'Vendor onboarding pipeline migration is required first.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vendor_onboarding_leads'
          AND column_name = 'invite_token_hash'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vendor_onboarding_leads'
          AND column_name = 'invite_application_id'
    ) THEN
        RAISE EXCEPTION 'Onboarding invite migration is required first.'
            USING HINT = 'Run ONBOARDING_INVITES_MIGRATION.sql before this migration.';
    END IF;
END;
$$;

ALTER TABLE public.vendor_onboarding_leads
    ADD COLUMN IF NOT EXISTS onboarding_mode TEXT NOT NULL DEFAULT 'merchant_self_serve',
    ADD COLUMN IF NOT EXISTS onboarding_step_owners JSONB NOT NULL DEFAULT
        '{"business":"merchant","contact_area":"merchant","operations":"merchant","goods_docs":"merchant"}'::JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vendor_onboarding_leads_mode_check'
          AND conrelid = 'public.vendor_onboarding_leads'::regclass
    ) THEN
        ALTER TABLE public.vendor_onboarding_leads
            ADD CONSTRAINT vendor_onboarding_leads_mode_check
            CHECK (onboarding_mode IN ('admin_assisted', 'shared', 'merchant_self_serve'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vendor_onboarding_leads_step_owners_check'
          AND conrelid = 'public.vendor_onboarding_leads'::regclass
    ) THEN
        ALTER TABLE public.vendor_onboarding_leads
            ADD CONSTRAINT vendor_onboarding_leads_step_owners_check CHECK (
                jsonb_typeof(onboarding_step_owners) = 'object'
                AND onboarding_step_owners ?& ARRAY['business', 'contact_area', 'operations', 'goods_docs']
                AND onboarding_step_owners->>'business' IN ('admin', 'merchant')
                AND onboarding_step_owners->>'contact_area' IN ('admin', 'merchant')
                AND onboarding_step_owners->>'operations' IN ('admin', 'merchant')
                AND onboarding_step_owners->>'goods_docs' IN ('admin', 'merchant')
            );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL UNIQUE
        REFERENCES public.vendor_onboarding_leads(id) ON DELETE CASCADE,
    form_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    current_step SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 3),
    updated_by TEXT NOT NULL CHECK (updated_by IN ('admin', 'merchant')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(form_data) = 'object')
);

CREATE OR REPLACE FUNCTION public.save_vendor_onboarding_draft(
    p_lead_id UUID,
    p_form_data JSONB,
    p_current_step SMALLINT,
    p_expected_updated_at TIMESTAMPTZ,
    p_actor TEXT
)
RETURNS public.vendor_onboarding_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    current_draft public.vendor_onboarding_drafts%ROWTYPE;
    saved_draft public.vendor_onboarding_drafts%ROWTYPE;
BEGIN
    IF p_current_step IS NULL OR p_current_step NOT BETWEEN 0 AND 3
       OR p_form_data IS NULL OR jsonb_typeof(p_form_data) <> 'object'
       OR octet_length(p_form_data::TEXT) > 50000
       OR p_actor IS NULL OR p_actor NOT IN ('admin', 'merchant') THEN
        RAISE EXCEPTION 'Invalid onboarding draft.';
    END IF;

    PERFORM 1 FROM public.vendor_onboarding_leads
    WHERE id = p_lead_id
      AND invite_expires_at > now()
      AND invite_used_at IS NULL
      AND invite_application_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This onboarding link is invalid, expired, or already used.';
    END IF;

    SELECT * INTO current_draft
    FROM public.vendor_onboarding_drafts
    WHERE lead_id = p_lead_id
    FOR UPDATE;

    IF FOUND THEN
        IF p_expected_updated_at IS NULL
           OR current_draft.updated_at IS DISTINCT FROM p_expected_updated_at THEN
            RAISE EXCEPTION 'This draft changed in another session. Reload the link to avoid overwriting newer work.'
                USING ERRCODE = '40001';
        END IF;
        UPDATE public.vendor_onboarding_drafts
        SET form_data = current_draft.form_data || p_form_data,
            current_step = p_current_step,
        updated_by = p_actor,
            updated_at = clock_timestamp()
        WHERE lead_id = p_lead_id
        RETURNING * INTO saved_draft;
    ELSE
        IF p_expected_updated_at IS NOT NULL THEN
            RAISE EXCEPTION 'This draft changed in another session. Reload the link to continue.'
                USING ERRCODE = '40001';
        END IF;
        INSERT INTO public.vendor_onboarding_drafts (lead_id, form_data, current_step, updated_by, updated_at)
        VALUES (p_lead_id, p_form_data, p_current_step, p_actor, clock_timestamp())
        RETURNING * INTO saved_draft;
    END IF;

    INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
    VALUES (p_lead_id, 'onboarding_draft_saved', p_actor,
        jsonb_build_object('step', p_current_step));

    RETURN saved_draft;
END;
$$;

ALTER TABLE public.vendor_onboarding_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_onboarding_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vendor_onboarding_drafts TO service_role;
REVOKE ALL ON FUNCTION public.save_vendor_onboarding_draft(UUID, JSONB, SMALLINT, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_vendor_onboarding_draft(UUID, JSONB, SMALLINT, TIMESTAMPTZ, TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.configure_vendor_onboarding_workflow(
    p_lead_id UUID,
    p_mode TEXT,
    p_step_owners JSONB,
    p_actor TEXT
)
RETURNS public.vendor_onboarding_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    updated_lead public.vendor_onboarding_leads%ROWTYPE;
BEGIN
    IF p_mode IS NULL OR p_mode NOT IN ('admin_assisted', 'shared', 'merchant_self_serve')
       OR p_step_owners IS NULL OR jsonb_typeof(p_step_owners) <> 'object'
       OR NOT (p_step_owners ?& ARRAY['business', 'contact_area', 'operations', 'goods_docs'])
       OR p_step_owners->>'business' NOT IN ('admin', 'merchant')
       OR p_step_owners->>'contact_area' NOT IN ('admin', 'merchant')
       OR p_step_owners->>'operations' NOT IN ('admin', 'merchant')
       OR p_step_owners->>'goods_docs' NOT IN ('admin', 'merchant')
       OR nullif(trim(p_actor), '') IS NULL THEN
        RAISE EXCEPTION 'A valid onboarding mode, step owners, and administrator are required.';
    END IF;

    UPDATE public.vendor_onboarding_leads
    SET onboarding_mode = p_mode,
        onboarding_step_owners = p_step_owners,
        updated_at = now()
    WHERE id = p_lead_id
      AND vendor_type IN ('retailer', 'wholesaler', 'street_food')
      AND invite_application_id IS NULL
    RETURNING * INTO updated_lead;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Onboarding lead not found or already submitted.';
    END IF;

    INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
    VALUES (p_lead_id, 'onboarding_workflow_configured', trim(p_actor),
        jsonb_build_object('mode', p_mode, 'step_owners', p_step_owners));

    RETURN updated_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_vendor_onboarding_workflow(UUID, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_vendor_onboarding_workflow(UUID, TEXT, JSONB, TEXT)
    TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
