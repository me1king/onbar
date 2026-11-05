CREATE TABLE IF NOT EXISTS public.email_command_center_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('operational', 'driver_invite')),
    status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN (
        'sending', 'sent', 'failed', 'delivered', 'bounced', 'complained', 'opened', 'clicked'
    )),
    provider_message_id TEXT,
    error_message TEXT,
    sent_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_command_center_messages_created_idx
    ON public.email_command_center_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS email_command_center_messages_provider_idx
    ON public.email_command_center_messages (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.email_command_center_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_command_center_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_command_center_messages TO service_role;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
    email TEXT PRIMARY KEY,
    reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_suppressions TO service_role;

NOTIFY pgrst, 'reload schema';
