-- Accelerate the Ask OB inventory alert query.
CREATE INDEX IF NOT EXISTS products_stock_idx
  ON public.products (stock);
