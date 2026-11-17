-- Private, consent-gated checkout recovery queue.
-- Apply after FINAL_ESTABLISHMENT_SQL.sql and the checkout marketing-consent migrations.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.newsletter_subscribers') IS NULL THEN
        RAISE EXCEPTION 'Checkout recovery prerequisites are missing.'
            USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql and CHECKOUT_EMAIL_MARKETING_OPTIN_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.checkout_recovery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    cart_items JSONB NOT NULL CHECK (jsonb_typeof(cart_items) = 'array'),
    total_price NUMERIC NOT NULL CHECK (total_price >= 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'abandoned', 'sending', 'sent', 'converted', 'failed', 'opted_out', 'suppressed', 'expired')),
    suppression_reason TEXT,
    consented_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    send_attempts INTEGER NOT NULL DEFAULT 0 CHECK (send_attempts >= 0),
    recovery_token_hash TEXT,
    recovery_token_expires_at TIMESTAMPTZ,
    recovered_order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    recovered_revenue NUMERIC CHECK (recovered_revenue IS NULL OR recovered_revenue >= 0),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_recovery_sessions_status_activity_idx
    ON public.checkout_recovery_sessions (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS checkout_recovery_sessions_customer_email_idx
    ON public.checkout_recovery_sessions (lower(customer_email), last_activity_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_recovery_sessions_token_hash_idx
    ON public.checkout_recovery_sessions (recovery_token_hash)
    WHERE recovery_token_hash IS NOT NULL;

ALTER TABLE public.checkout_recovery_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_recovery_sessions FROM anon, authenticated;
GRANT ALL ON public.checkout_recovery_sessions TO service_role;

COMMIT;
