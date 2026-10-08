-- Run in Supabase SQL Editor after FINAL_ESTABLISHMENT_SQL.sql.
-- This is an additive compatibility migration for Bite Command and Kitchen.
-- Admin order access stays server-only; do not add public order policies.

DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(required.table_name, ', ')
    INTO missing_tables
    FROM (VALUES
        ('public.products'),
        ('public.orders'),
        ('public.order_items')
    ) AS required(table_name)
    WHERE to_regclass(required.table_name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Kitchen connection requires core tables: %.', missing_tables
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS is_bite BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_snack BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_available_now BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Live',
    ADD COLUMN IF NOT EXISTS sub_category TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS total_price NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS size TEXT DEFAULT 'Standard',
    ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.order_items'::regclass
          AND contype = 'f'
          AND confrelid = 'public.products'::regclass
          AND pg_get_constraintdef(oid) ILIKE 'FOREIGN KEY (product_id)%'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_product_id_products_fkey
            FOREIGN KEY (product_id)
            REFERENCES public.products(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS orders_kitchen_created_at_idx
    ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_kitchen_order_id_idx
    ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS products_food_menu_idx
    ON public.products (is_bite, is_snack, name);

GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products, public.orders, public.order_items TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';

-- Connection check: all three counts should run without errors.
SELECT
    (SELECT count(*) FROM public.products WHERE is_bite OR is_snack) AS food_products,
    (SELECT count(*) FROM public.orders) AS orders,
    (SELECT count(*) FROM public.order_items) AS order_items;
