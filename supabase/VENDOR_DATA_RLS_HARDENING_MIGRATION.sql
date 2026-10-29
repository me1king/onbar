-- Keep vendor costs, inventory, dispatch, and payout data server-only.
-- Apply after VENDOR_PRICING_AND_RIDER_DISPATCH_MIGRATION.sql.
DO $$
DECLARE
    table_name TEXT;
    sequence_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'products',
        'vendor_profiles',
        'vendor_products',
        'pricing_rules',
        'vendor_product_visibility',
        'rider_profiles',
        'rider_dispatch_scores',
        'rider_payouts'
    ]
    LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN
            RAISE EXCEPTION 'Vendor security hardening requires public.% table.', table_name
                USING HINT = 'Apply VENDOR_PRICING_AND_RIDER_DISPATCH_MIGRATION.sql first.';
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);

        sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
        IF sequence_name IS NOT NULL THEN
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', sequence_name);
        END IF;
    END LOOP;
END;
$$;

-- The customer-facing helper returns vendor margin and is not safe to expose
-- as a public PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.compute_customer_price(NUMERIC, TEXT, NUMERIC, NUMERIC, INTEGER, NUMERIC)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.visible_vendor_products_for_customer(NUMERIC, NUMERIC, NUMERIC)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_dispatch_rider(NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_rider_payout(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.compute_customer_price(NUMERIC, TEXT, NUMERIC, NUMERIC, INTEGER, NUMERIC)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.visible_vendor_products_for_customer(NUMERIC, NUMERIC, NUMERIC)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.score_dispatch_rider(NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_rider_payout(NUMERIC, NUMERIC, NUMERIC, NUMERIC)
    TO service_role;
