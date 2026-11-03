-- Recognize delivered order revenue and estimated product costs exactly once.
-- Payment gateway fees and tax remain external-ledger/reconciliation concerns.

BEGIN;

CREATE INDEX IF NOT EXISTS financial_ledger_order_type_idx
  ON public.financial_ledger (order_id, entry_type);

CREATE OR REPLACE FUNCTION public.record_delivered_order_financial_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  estimated_cost NUMERIC;
BEGIN
  IF NEW.status IS DISTINCT FROM 'Delivered' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(item.unit_cost, 0), 0) * GREATEST(COALESCE(item.quantity, 0), 0)), 0)
    INTO estimated_cost
  FROM public.order_items AS item
  WHERE item.order_id = NEW.id;

  INSERT INTO public.financial_ledger (order_id, entry_type, amount, description)
  SELECT NEW.id, 'REVENUE', GREATEST(COALESCE(NEW.total_price, 0), 0),
    format('Order #%s revenue recognized at delivery', NEW.id)
  WHERE COALESCE(NEW.total_price, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_ledger
      WHERE order_id = NEW.id AND entry_type = 'REVENUE'
    );

  INSERT INTO public.financial_ledger (order_id, entry_type, amount, description)
  SELECT NEW.id, 'COST', estimated_cost,
    format('Estimated product cost for delivered order #%s', NEW.id)
  WHERE estimated_cost > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_ledger
      WHERE order_id = NEW.id AND entry_type = 'COST'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_delivered_order_financial_entries ON public.orders;
CREATE TRIGGER record_delivered_order_financial_entries
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'Delivered')
  EXECUTE FUNCTION public.record_delivered_order_financial_entries();

REVOKE ALL ON FUNCTION public.record_delivered_order_financial_entries() FROM PUBLIC, anon, authenticated;

-- Safely populate entries for delivered orders that predate this migration.
DO $$
DECLARE
  delivered_order RECORD;
  estimated_cost NUMERIC;
BEGIN
  FOR delivered_order IN
    SELECT id, total_price
    FROM public.orders
    WHERE status = 'Delivered'
    ORDER BY id
  LOOP
    INSERT INTO public.financial_ledger (order_id, entry_type, amount, description)
    SELECT delivered_order.id, 'REVENUE', GREATEST(COALESCE(delivered_order.total_price, 0), 0),
      format('Order #%s revenue recognized at delivery', delivered_order.id)
    WHERE COALESCE(delivered_order.total_price, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.financial_ledger
        WHERE order_id = delivered_order.id AND entry_type = 'REVENUE'
      );

    SELECT COALESCE(SUM(GREATEST(COALESCE(item.unit_cost, 0), 0) * GREATEST(COALESCE(item.quantity, 0), 0)), 0)
      INTO estimated_cost
    FROM public.order_items AS item
    WHERE item.order_id = delivered_order.id;

    INSERT INTO public.financial_ledger (order_id, entry_type, amount, description)
    SELECT delivered_order.id, 'COST', estimated_cost,
      format('Estimated product cost for delivered order #%s', delivered_order.id)
    WHERE estimated_cost > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.financial_ledger
        WHERE order_id = delivered_order.id AND entry_type = 'COST'
      );
  END LOOP;
END;
$$;

COMMIT;
