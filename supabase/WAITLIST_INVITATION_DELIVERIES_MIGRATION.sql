CREATE TABLE IF NOT EXISTS public.waitlist_invitation_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  waitlist_id UUID NOT NULL REFERENCES public.market_waitlist(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sent', 'failed')),
  subject TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_invitation_deliveries
  ADD COLUMN IF NOT EXISTS subject TEXT;

CREATE INDEX IF NOT EXISTS waitlist_invitation_deliveries_status_created_idx
  ON public.waitlist_invitation_deliveries (delivery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS waitlist_invitation_deliveries_member_idx
  ON public.waitlist_invitation_deliveries (waitlist_id, created_at DESC);

ALTER TABLE public.waitlist_invitation_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_invitation_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT ON public.waitlist_invitation_deliveries TO service_role;
