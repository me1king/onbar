BEGIN;

ALTER TABLE public.market_waitlist
    ADD COLUMN IF NOT EXISTS full_name TEXT;

COMMIT;
