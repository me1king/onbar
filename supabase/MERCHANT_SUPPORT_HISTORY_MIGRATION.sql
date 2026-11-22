-- Link merchant support requests to the authenticated user and approved business.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql and the support ticket schema.

DO $$
BEGIN
    IF to_regclass('public.support_tickets') IS NULL THEN
        RAISE EXCEPTION 'Merchant support history requires public.support_tickets.'
            USING HINT = 'Apply the core support ticket migration first.';
    END IF;
END;
$$;

ALTER TABLE public.support_tickets
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS merchant_application_id UUID
        REFERENCES public.merchant_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_merchant_history_idx
    ON public.support_tickets (user_id, merchant_application_id, created_at DESC)
    WHERE merchant_application_id IS NOT NULL;
