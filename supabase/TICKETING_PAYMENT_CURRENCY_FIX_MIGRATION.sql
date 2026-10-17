-- Fixes checkout inserts on projects that already applied the commerce migration.
-- The payment-attempt table is KES-only, but the checkout RPC omits currency.

BEGIN;

ALTER TABLE public.ticketing_payment_attempts
    ALTER COLUMN currency SET DEFAULT 'KES';

COMMIT;
