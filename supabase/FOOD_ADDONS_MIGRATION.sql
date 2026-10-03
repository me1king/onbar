CREATE TABLE IF NOT EXISTS public.food_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_addons_active_name_idx
    ON public.food_addons (is_active, name);

ALTER TABLE public.food_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can read active meal extras" ON public.food_addons;
CREATE POLICY "Customers can read active meal extras"
    ON public.food_addons
    FOR SELECT
    TO anon, authenticated
    USING (is_active);
GRANT SELECT ON public.food_addons TO anon, authenticated;
GRANT ALL ON public.food_addons TO service_role;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::JSONB;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'onlinebar-assets',
    'onlinebar-assets',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public read onlinebar assets" ON storage.objects;
CREATE POLICY "Public read onlinebar assets"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'onlinebar-assets');

NOTIFY pgrst, 'reload schema';
