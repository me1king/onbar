-- Restore the public catalog read permission required by the customer storefront.
-- FINAL_ESTABLISHMENT_SQL.sql already defines the products SELECT policy.
GRANT SELECT ON TABLE public.products TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
