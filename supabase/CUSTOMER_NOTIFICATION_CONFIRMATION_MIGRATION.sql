-- Allow the COD order-confirmation notification recorded when checkout creates a Confirmed order.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.customer_notification_deliveries') IS NULL THEN
        RAISE EXCEPTION 'Customer notification confirmation migration requires customer_notification_deliveries.'
            USING HINT = 'Run CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.customer_notification_deliveries
    DROP CONSTRAINT IF EXISTS customer_notification_deliveries_notification_status_check;
ALTER TABLE public.customer_notification_deliveries
    ADD CONSTRAINT customer_notification_deliveries_notification_status_check
        CHECK (notification_status IN (
            'Pending', 'Confirmed', 'Payment Failed', 'Paid',
            'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'
        ));

NOTIFY pgrst, 'reload schema';
COMMIT;
