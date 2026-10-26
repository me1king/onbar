ALTER TABLE public.customer_notification_deliveries
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_delivery_status TEXT,
    ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS customer_notification_deliveries_provider_message_idx
    ON public.customer_notification_deliveries (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.ticketing_email_deliveries
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_delivery_status TEXT,
    ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ticketing_email_deliveries_provider_message_idx
    ON public.ticketing_email_deliveries (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.message_campaign_deliveries
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_delivery_status TEXT,
    ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS message_campaign_deliveries_provider_message_idx
    ON public.message_campaign_deliveries (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.jmsurf_email_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'email.delivered',
        'email.bounced',
        'email.complained',
        'email.opened',
        'email.clicked',
        'email.failed'
    )),
    provider_message_id TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    provider_created_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jmsurf_email_webhook_events_message_idx
    ON public.jmsurf_email_webhook_events (provider_message_id, received_at DESC);

ALTER TABLE public.jmsurf_email_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jmsurf_email_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jmsurf_email_webhook_events TO service_role;

NOTIFY pgrst, 'reload schema';
