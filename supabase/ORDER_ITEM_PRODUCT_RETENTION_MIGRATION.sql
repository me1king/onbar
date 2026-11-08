-- Preserve product links on historical order items when a catalog product is removed.
-- Existing null product links remain untouched and must be reviewed as order data.
DO $$
DECLARE
    existing_constraint RECORD;
BEGIN
    FOR existing_constraint IN
        SELECT constraint_row.conname
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = 'public.order_items'::regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.products'::regclass
    LOOP
        EXECUTE format(
            'ALTER TABLE public.order_items DROP CONSTRAINT %I',
            existing_constraint.conname
        );
    END LOOP;

    ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_product_id_products_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products(id)
        ON DELETE RESTRICT
        NOT VALID;
END;
$$;
