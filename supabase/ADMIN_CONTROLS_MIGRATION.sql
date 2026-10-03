-- Database-backed actions used by the admin lockdown and autopilot controls.

CREATE TABLE IF NOT EXISTS public.growth_autopilot_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_day_of_week SMALLINT NOT NULL CHECK (slot_day_of_week BETWEEN 0 AND 6),
    slot_time TIME NOT NULL,
    platform TEXT NOT NULL,
    content_source TEXT NOT NULL CHECK (content_source IN ('TRENDING', 'LOW_STOCK', 'EDITORIAL')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.growth_autopilot_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_autopilot_rules FROM anon, authenticated;
GRANT ALL ON public.growth_autopilot_rules TO service_role;

INSERT INTO public.settings (key, value)
VALUES ('system_lockdown', '{"active": false}'::JSONB)
ON CONFLICT (key) DO NOTHING;
