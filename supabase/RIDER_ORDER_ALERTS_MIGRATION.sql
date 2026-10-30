-- Apply after DISPATCH_MIGRATION.sql.
-- Private push-device and delivery-log storage for verified riders.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rider_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_phone TEXT NOT NULL REFERENCES public.rider_status(rider_phone) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rider_order_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  rider_phone TEXT NOT NULL REFERENCES public.rider_status(rider_phone) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'sms')),
  step TEXT NOT NULL CHECK (step IN ('assignment', 'sms_10s')),
  recipient_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'no_device', 'stopped')),
  provider_id TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, rider_phone, channel, step, recipient_key)
);

CREATE INDEX IF NOT EXISTS rider_push_subscriptions_rider_idx
  ON public.rider_push_subscriptions (rider_phone, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS rider_order_alert_log_order_idx
  ON public.rider_order_alert_log (order_id, created_at DESC);

ALTER TABLE public.rider_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_order_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_push_subscriptions, public.rider_order_alert_log
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_push_subscriptions, public.rider_order_alert_log TO service_role;

CREATE OR REPLACE FUNCTION public.claim_rider_order_alert(
  p_order_id BIGINT,
  p_rider_phone TEXT,
  p_channel TEXT,
  p_step TEXT,
  p_recipient_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_id UUID;
BEGIN
  IF p_channel NOT IN ('push', 'sms')
     OR p_step NOT IN ('assignment', 'sms_10s')
     OR char_length(coalesce(p_recipient_key, '')) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Invalid rider alert claim.';
  END IF;

  INSERT INTO public.rider_order_alert_log (
    order_id, rider_phone, channel, step, recipient_key, status, sent_at
  ) VALUES (
    p_order_id, p_rider_phone, p_channel, p_step, p_recipient_key, 'sending', now()
  )
  ON CONFLICT (order_id, rider_phone, channel, step, recipient_key)
  DO UPDATE SET
    status = 'sending',
    error = NULL,
    sent_at = now(),
    attempt_count = public.rider_order_alert_log.attempt_count + 1
  WHERE public.rider_order_alert_log.status = 'failed'
     OR (
       public.rider_order_alert_log.status = 'sending'
       AND public.rider_order_alert_log.sent_at < now() - INTERVAL '2 minutes'
     )
  RETURNING id INTO claimed_id;

  RETURN claimed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rider_order_alert(BIGINT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rider_order_alert(BIGINT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
