-- Restore checkout points when an order is cancelled or refunded.
-- Checkout reserves points through apply_loyalty_points using order:<id>:redeem.

CREATE OR REPLACE FUNCTION public.release_order_loyalty_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status IN ('Cancelled', 'Canceled', 'Refunded')
       AND NEW.user_id IS NOT NULL
       AND NEW.loyalty_points_redeemed > 0 THEN
        PERFORM public.apply_loyalty_points(
            NEW.user_id,
            NEW.loyalty_points_redeemed,
            'Released reserved points for cancelled or refunded order #' || NEW.id,
            'order:' || NEW.id || ':release'
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_order_loyalty_reservation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_loyalty_reservation() TO service_role;

DROP TRIGGER IF EXISTS release_order_loyalty_reservation ON public.orders;
CREATE TRIGGER release_order_loyalty_reservation
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.release_order_loyalty_reservation();
