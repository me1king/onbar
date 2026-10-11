-- Connect product food-pairing suggestions saved in Admin to the storefront.
-- Safe to re-run on existing products tables.

DO $$
BEGIN
    IF to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'Product pairing migration requires public.products.'
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS pairing_suggestions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE public.products
SET pairing_suggestions = ARRAY[]::TEXT[]
WHERE pairing_suggestions IS NULL;

ALTER TABLE public.products
    ALTER COLUMN pairing_suggestions SET DEFAULT ARRAY[]::TEXT[],
    ALTER COLUMN pairing_suggestions SET NOT NULL;

NOTIFY pgrst, 'reload schema';
