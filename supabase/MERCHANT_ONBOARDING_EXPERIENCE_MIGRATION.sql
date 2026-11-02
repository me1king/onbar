-- Merchant onboarding document deferral, secure follow-up uploads, and journey analytics.
-- Run after MERCHANT_OPERATIONS_MIGRATION.sql and ONBOARDING_INVITES_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.merchant_applications') IS NULL
       OR to_regclass('public.vendor_onboarding_leads') IS NULL
       OR to_regclass('public.vendor_onboarding_events') IS NULL
       OR to_regclass('public.merchant_application_events') IS NULL THEN
        RAISE EXCEPTION 'Merchant onboarding experience migration prerequisites are missing.'
            USING HINT = 'Run MERCHANT_OPERATIONS_MIGRATION.sql and ONBOARDING_INVITES_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_onboarding_controls (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    allow_document_deferral BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT 'system'
);

INSERT INTO public.merchant_onboarding_controls (id, allow_document_deferral)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS documents_deferred BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.merchant_document_upload_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_document_upload_links_application_idx
    ON public.merchant_document_upload_links (application_id, created_at DESC);

ALTER TABLE public.merchant_onboarding_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_document_upload_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_onboarding_controls FROM anon, authenticated;
REVOKE ALL ON public.merchant_document_upload_links FROM anon, authenticated;
GRANT ALL ON public.merchant_onboarding_controls TO service_role;
GRANT ALL ON public.merchant_document_upload_links TO service_role;

CREATE OR REPLACE FUNCTION public.append_merchant_application_documents(
    p_application_id UUID,
    p_documents JSONB
)
RETURNS public.merchant_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    updated_application public.merchant_applications%ROWTYPE;
BEGIN
    IF jsonb_typeof(p_documents) <> 'array' OR jsonb_array_length(p_documents) < 1 THEN
        RAISE EXCEPTION 'At least one validated document is required.';
    END IF;

    UPDATE public.merchant_applications application
    SET documents = (
        SELECT coalesce(jsonb_agg(existing), '[]'::JSONB)
        FROM jsonb_array_elements(coalesce(application.documents, '[]'::JSONB)) AS existing
        WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_documents) AS incoming
            WHERE incoming->>'type' = existing->>'type'
        )
    ) || p_documents
    WHERE application.id = p_application_id
    RETURNING * INTO updated_application;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant application not found.';
    END IF;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        'documents_uploaded',
        'applicant',
        jsonb_build_object(
            'document_types', (SELECT jsonb_agg(document->>'type') FROM jsonb_array_elements(p_documents) AS document),
            'document_count', jsonb_array_length(p_documents)
        )
    );

    RETURN updated_application;
END;
$$;

REVOKE ALL ON FUNCTION public.append_merchant_application_documents(UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_merchant_application_documents(UUID, JSONB)
    TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_current_required_merchant_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    missing_document_type TEXT;
BEGIN
    IF NEW.status <> 'approved' THEN
        RETURN NEW;
    END IF;

    WITH scoped_requirements AS (
        SELECT requirement.document_type,
               requirement.is_active,
               requirement.is_required,
               row_number() OVER (
                   PARTITION BY requirement.document_type
                   ORDER BY
                       (requirement.business_type = NEW.business_type)::INTEGER * 2
                       + (requirement.county = lower(NEW.county))::INTEGER * 3 DESC
               ) AS priority
        FROM public.merchant_document_requirements requirement
        WHERE requirement.business_type IN ('*', NEW.business_type)
          AND requirement.county IN ('*', lower(NEW.county))
    ),
    required_types AS (
        SELECT document_type
        FROM scoped_requirements
        WHERE priority = 1
          AND is_active
          AND is_required
        UNION
        SELECT CASE NEW.vendor_type
            WHEN 'retailer' THEN 'liquor_licence'
            WHEN 'wholesaler' THEN 'wholesale_licence'
        END
        WHERE NEW.vendor_type IN ('retailer', 'wholesaler')
    )
    SELECT required.document_type
    INTO missing_document_type
    FROM required_types required
    WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(NEW.documents, '[]'::JSONB)) document
        WHERE document->>'type' = required.document_type
          AND (
              (document->>'expiresAt' IS NULL
               AND required.document_type NOT IN ('liquor_licence', 'wholesale_licence'))
              OR (document->>'expiresAt')::DATE >= CURRENT_DATE
          )
    )
    LIMIT 1;

    IF missing_document_type IS NOT NULL THEN
        RAISE EXCEPTION 'Required compliance document % must be present and current before approval.', missing_document_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_applications_require_current_documents ON public.merchant_applications;
CREATE TRIGGER merchant_applications_require_current_documents
    BEFORE INSERT OR UPDATE OF status ON public.merchant_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_current_required_merchant_documents();

COMMIT;
