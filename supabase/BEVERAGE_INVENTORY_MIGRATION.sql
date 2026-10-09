-- Persist beverage serving size, chilled-serving and warehouse location information.
-- Safe to re-run on databases where any of these columns already exist.

DO $$
BEGIN
    IF to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'Beverage inventory migration requires public.products.'
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS size_label TEXT,
    ADD COLUMN IF NOT EXISTS is_ice_cold BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS temperature_celsius NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS warehouse_location TEXT;

NOTIFY pgrst, 'reload schema';
