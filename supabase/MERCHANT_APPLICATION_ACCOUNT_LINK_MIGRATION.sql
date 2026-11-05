-- Link merchant applications to the verified OnlineBar account that submitted them.
-- Run after MERCHANT_OPERATIONS_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.merchant_applications') IS NULL THEN
        RAISE EXCEPTION 'Merchant operations migration is required first.'
            USING HINT = 'Run supabase/MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS account_user_id UUID
        REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS merchant_applications_account_user_idx
    ON public.merchant_applications (account_user_id, submitted_at DESC)
    WHERE account_user_id IS NOT NULL;

COMMIT;
