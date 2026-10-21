-- Only customers with a paid or completed order containing a product may
-- publish a review for it. Run after the core storefront and order schema.

BEGIN;

ALTER TABLE public.reviews
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_verified_owner BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_order_product_uidx
    ON public.reviews (verified_order_id, product_id)
    WHERE verified_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_verified_product_review(
    product_id_input BIGINT,
    customer_user_id_input UUID,
    order_id_input BIGINT,
    customer_name_input TEXT,
    rating_input INTEGER,
    comment_input TEXT,
    photo_urls_input TEXT[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    review_id BIGINT;
BEGIN
    IF product_id_input IS NULL OR product_id_input <= 0
       OR customer_user_id_input IS NULL
       OR order_id_input IS NULL OR order_id_input <= 0
       OR customer_name_input IS NULL OR length(trim(customer_name_input)) NOT BETWEEN 1 AND 100
       OR rating_input IS NULL OR rating_input NOT BETWEEN 1 AND 5
       OR comment_input IS NULL OR length(trim(comment_input)) NOT BETWEEN 1 AND 2000
       OR photo_urls_input IS NULL OR cardinality(photo_urls_input) > 3 THEN
        RAISE EXCEPTION 'Invalid review details.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.orders AS orders
        JOIN public.order_items AS items ON items.order_id = orders.id
        WHERE orders.id = order_id_input
          AND orders.user_id = customer_user_id_input
          AND orders.status IN ('Paid', 'Delivered', 'Completed')
          AND items.product_id = product_id_input
    ) THEN
        RAISE EXCEPTION 'Customer is not eligible to review this product.';
    END IF;

    INSERT INTO public.reviews (
        product_id,
        customer_name,
        rating,
        comment,
        photo_urls,
        user_id,
        customer_user_id,
        verified_order_id,
        is_verified_owner,
        is_hidden
    )
    VALUES (
        product_id_input,
        trim(customer_name_input),
        rating_input,
        trim(comment_input),
        photo_urls_input,
        customer_user_id_input,
        customer_user_id_input,
        order_id_input,
        true,
        false
    )
    RETURNING id INTO review_id;

    RETURN review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_verified_product_review(BIGINT, UUID, BIGINT, TEXT, INTEGER, TEXT, TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_verified_product_review(BIGINT, UUID, BIGINT, TEXT, INTEGER, TEXT, TEXT[])
    TO service_role;
REVOKE INSERT ON public.reviews FROM PUBLIC, anon, authenticated;

COMMIT;
