-- Apply after DISPATCH_MIGRATION.sql and DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql.
-- Adds a customer-only delivery PIN and requires an ID check plus that PIN at handover.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_pin TEXT,
  ADD COLUMN IF NOT EXISTS customer_id_checked_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.generate_order_delivery_pin()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  random_value UUID := pg_catalog.gen_random_uuid();
  numeric_code BIGINT;
BEGIN
  numeric_code := pg_catalog.mod(
    pg_catalog.get_byte(pg_catalog.uuid_send(random_value), 0)::BIGINT * 16777216
      + pg_catalog.get_byte(pg_catalog.uuid_send(random_value), 1)::BIGINT * 65536
      + pg_catalog.get_byte(pg_catalog.uuid_send(random_value), 2)::BIGINT * 256
      + pg_catalog.get_byte(pg_catalog.uuid_send(random_value), 3)::BIGINT,
    1000000
  );
  RETURN pg_catalog.lpad(numeric_code::TEXT, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_order_delivery_pin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_delivery_pin() TO service_role;

CREATE OR REPLACE FUNCTION public.issue_delivery_pin_on_rider_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.rider_phone IS NOT NULL
     AND NEW.status IN ('Dispatched', 'Picked Up', 'Out for Delivery')
     AND (
       OLD.rider_phone IS DISTINCT FROM NEW.rider_phone
       OR (NEW.status = 'Dispatched' AND OLD.status IS DISTINCT FROM NEW.status)
     ) THEN
    NEW.delivery_pin := public.generate_order_delivery_pin();
    NEW.customer_id_checked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_delivery_pin_on_rider_assignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_delivery_pin_on_rider_assignment() TO service_role;

DROP TRIGGER IF EXISTS orders_issue_delivery_pin ON public.orders;
CREATE TRIGGER orders_issue_delivery_pin
  BEFORE UPDATE OF status, rider_phone ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.issue_delivery_pin_on_rider_assignment();

UPDATE public.orders
SET delivery_pin = public.generate_order_delivery_pin()
WHERE status IN ('Dispatched', 'Picked Up', 'Out for Delivery')
  AND rider_phone IS NOT NULL
  AND delivery_pin IS NULL;

CREATE OR REPLACE FUNCTION public.advance_rider_delivery(
  p_order_id BIGINT,
  p_rider_phone TEXT,
  p_next_status TEXT,
  p_delivery_pin TEXT,
  p_customer_id_verified BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_order public.orders%ROWTYPE;
  expected_status TEXT;
  commission_added BOOLEAN := false;
  inserted_rows INTEGER := 0;
BEGIN
  IF p_next_status NOT IN ('Picked Up', 'Out for Delivery', 'Delivered') THEN
    RAISE EXCEPTION 'Invalid delivery status transition.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rider_status
    WHERE rider_phone = p_rider_phone AND verification_status = 'Verified'
  ) THEN
    RAISE EXCEPTION 'Only verified riders can update delivery status.';
  END IF;

  SELECT * INTO target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR target_order.rider_phone IS DISTINCT FROM p_rider_phone THEN
    RAISE EXCEPTION 'Order is not assigned to this rider.';
  END IF;

  IF target_order.status = p_next_status THEN
    RETURN target_order.status;
  END IF;

  expected_status := CASE target_order.status
    WHEN 'Dispatched' THEN 'Picked Up'
    WHEN 'Picked Up' THEN 'Out for Delivery'
    WHEN 'Out for Delivery' THEN 'Delivered'
    ELSE NULL
  END;
  IF expected_status IS DISTINCT FROM p_next_status THEN
    RAISE EXCEPTION 'Delivery status cannot advance from % to %.', target_order.status, p_next_status;
  END IF;

  IF p_next_status = 'Delivered' THEN
    IF p_customer_id_verified IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Customer ID must be checked before handover.';
    END IF;
    IF target_order.delivery_pin IS NULL THEN
      RAISE EXCEPTION 'Delivery PIN has not been issued for this order.';
    END IF;
    IF p_delivery_pin IS DISTINCT FROM target_order.delivery_pin THEN
      RAISE EXCEPTION 'Delivery PIN does not match.';
    END IF;
  END IF;

  UPDATE public.orders
  SET status = p_next_status,
      customer_id_checked_at = CASE WHEN p_next_status = 'Delivered' THEN now() ELSE customer_id_checked_at END,
      updated_at = now()
  WHERE id = p_order_id;

  IF p_next_status = 'Delivered' THEN
    INSERT INTO public.rider_delivery_commissions (order_id, rider_phone, amount_ksh)
    VALUES (p_order_id, p_rider_phone, 150)
    ON CONFLICT (order_id) DO NOTHING;
    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    commission_added := inserted_rows > 0;

    IF commission_added THEN
      UPDATE public.rider_wallets
      SET balance = COALESCE(balance, 0) + 150,
          total_earned = COALESCE(total_earned, 0) + 150,
          updated_at = now()
      WHERE rider_phone = p_rider_phone;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Rider wallet is not set up for commission credit.';
      END IF;
    END IF;
  END IF;

  RETURN p_next_status;
END;
$$;

DROP FUNCTION IF EXISTS public.advance_rider_delivery(BIGINT, TEXT, TEXT);
REVOKE ALL ON FUNCTION public.advance_rider_delivery(BIGINT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_rider_delivery(BIGINT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
