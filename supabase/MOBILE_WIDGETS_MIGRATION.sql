CREATE TABLE IF NOT EXISTS public.mobile_app_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'PRODUCT'
        CHECK (content_type IN ('PRODUCT', 'TRENDING', 'ANNOUNCEMENT', 'ORDER')),
    image_url TEXT,
    product_id TEXT,
    cta_label TEXT NOT NULL DEFAULT 'EXPLORE',
    deep_link TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'INACTIVE')),
    priority INTEGER NOT NULL DEFAULT 0,
    target_segment TEXT NOT NULL DEFAULT 'ALL',
    start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mobile_app_widgets_expiry_after_start
        CHECK (expires_at IS NULL OR expires_at > start_at)
);

CREATE INDEX IF NOT EXISTS mobile_app_widgets_active_schedule_idx
    ON public.mobile_app_widgets (status, priority DESC, start_at);

ALTER TABLE public.mobile_app_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published mobile widgets" ON public.mobile_app_widgets;
CREATE POLICY "Public can read published mobile widgets"
    ON public.mobile_app_widgets
    FOR SELECT
    TO anon, authenticated
    USING (
        status = 'PUBLISHED'
        AND start_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
    );

GRANT SELECT ON public.mobile_app_widgets TO anon, authenticated;
GRANT ALL ON public.mobile_app_widgets TO service_role;
