-- Merchant replies to verified customer reviews.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql, DISPATCH_MIGRATION.sql,
-- SECURITY_HARDENING_MIGRATION.sql, and VERIFIED_PRODUCT_REVIEWS_MIGRATION.sql.

CREATE TABLE IF NOT EXISTS public.merchant_review_responses (
    application_id UUID NOT NULL
        REFERENCES public.merchant_applications(id) ON DELETE CASCADE,
    review_id BIGINT NOT NULL
        REFERENCES public.reviews(id) ON DELETE CASCADE,
    merchant_name TEXT NOT NULL CHECK (char_length(trim(merchant_name)) BETWEEN 1 AND 160),
    response TEXT NOT NULL CHECK (char_length(trim(response)) BETWEEN 1 AND 1000),
    last_actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (application_id, review_id)
);

CREATE INDEX IF NOT EXISTS merchant_review_responses_review_idx
    ON public.merchant_review_responses (review_id);

ALTER TABLE public.merchant_review_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_review_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.merchant_review_responses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_review_responses TO service_role;

DROP POLICY IF EXISTS merchant_review_responses_public_read
    ON public.merchant_review_responses;
CREATE POLICY merchant_review_responses_public_read
    ON public.merchant_review_responses
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.reviews review
        WHERE review.id = review_id
          AND review.is_hidden = false
    ));

CREATE OR REPLACE FUNCTION public.set_merchant_review_response_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_review_response_updated_at
    ON public.merchant_review_responses;
CREATE TRIGGER merchant_review_response_updated_at
    BEFORE UPDATE ON public.merchant_review_responses
    FOR EACH ROW EXECUTE FUNCTION public.set_merchant_review_response_updated_at();
