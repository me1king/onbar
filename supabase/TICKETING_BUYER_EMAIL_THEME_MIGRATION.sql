ALTER TABLE public.ticketing_orders
    ADD COLUMN IF NOT EXISTS buyer_email_theme TEXT;

ALTER TABLE public.ticketing_orders
    DROP CONSTRAINT IF EXISTS ticketing_orders_buyer_email_theme_check;

ALTER TABLE public.ticketing_orders
    ADD CONSTRAINT ticketing_orders_buyer_email_theme_check
    CHECK (
        buyer_email_theme IS NULL
        OR buyer_email_theme IN (
            'midnight',
            'official-white',
            'sapphire-blue',
            'royal-violet',
            'emerald'
        )
    );
