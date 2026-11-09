-- Track where explicit newsletter opt-ins originate.
-- Run after CRM_CONSENT_MESSAGING_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.newsletter_subscribers') IS NULL THEN
        RAISE EXCEPTION 'newsletter_subscribers does not exist.'
            USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql and CRM_CONSENT_MESSAGING_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.newsletter_subscribers
    ADD COLUMN IF NOT EXISTS signup_source TEXT NOT NULL DEFAULT 'newsletter';

ALTER TABLE public.newsletter_subscribers
    DROP CONSTRAINT IF EXISTS newsletter_subscribers_signup_source_check;

ALTER TABLE public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_signup_source_check
        CHECK (signup_source IN ('newsletter', 'footer', 'checkout'));

COMMIT;
