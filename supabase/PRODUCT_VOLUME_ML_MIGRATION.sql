-- Product volumes are stored in millilitres for the customer and merchant
-- catalogues. Existing ounce values are converted once during migration.
BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS capacity_ml NUMERIC;

UPDATE public.products
SET capacity_ml = ROUND(capacity_oz * 29.5735, 2)
WHERE capacity_ml IS NULL
  AND capacity_oz IS NOT NULL;

COMMIT;
