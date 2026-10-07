ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variant_prices JSONB NOT NULL DEFAULT '{}'::JSONB;

NOTIFY pgrst, 'reload schema';
