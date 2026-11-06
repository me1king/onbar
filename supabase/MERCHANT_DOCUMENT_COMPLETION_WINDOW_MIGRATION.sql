-- Limit deferred merchant document uploads to seven days after a secure link is issued.
-- Run after MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.merchant_applications') IS NULL
       OR to_regclass('public.merchant_onboarding_controls') IS NULL
       OR to_regclass('public.merchant_document_upload_links') IS NULL THEN
        RAISE EXCEPTION 'Merchant document completion migration prerequisites are missing.'
            USING HINT = 'Run MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql after MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS documents_due_at TIMESTAMPTZ;

ALTER TABLE public.merchant_onboarding_controls
    ALTER COLUMN allow_document_deferral SET DEFAULT true;

UPDATE public.merchant_onboarding_controls
SET allow_document_deferral = true,
    updated_at = now()
WHERE id = true
  AND updated_by = 'system';

COMMIT;
