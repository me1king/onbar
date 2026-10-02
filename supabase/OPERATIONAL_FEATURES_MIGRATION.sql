-- Idempotent schema updates for delivery coverage, customer audiences,
-- draft-only campaign setup, and accurate admin analytics.

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS is_souvenir BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_available_now BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS finish TEXT,
    ADD COLUMN IF NOT EXISTS capacity_oz NUMERIC,
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
    ADD COLUMN IF NOT EXISTS story TEXT,
    ADD COLUMN IF NOT EXISTS drink_pairings TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_email TEXT,
    subject TEXT,
    description TEXT,
    category TEXT DEFAULT 'General',
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Open',
    admin_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audience_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rules JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.audience_segments
    ADD COLUMN IF NOT EXISTS rules JSONB;

CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Bell',
    style TEXT NOT NULL DEFAULT 'info',
    duration INTEGER NOT NULL DEFAULT 7 CHECK (duration BETWEEN 1 AND 60),
    priority TEXT NOT NULL DEFAULT 'NORMAL',
    is_active BOOLEAN NOT NULL DEFAULT true,
    cta_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    icon TEXT,
    style TEXT,
    action_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_templates_read_active ON public.notification_templates;
CREATE POLICY notification_templates_read_active ON public.notification_templates
    FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS notifications_log_read_own ON public.notifications_log;
CREATE POLICY notifications_log_read_own ON public.notifications_log
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_log_insert_own ON public.notifications_log;
CREATE POLICY notifications_log_insert_own ON public.notifications_log
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notifications_read_own ON public.user_notifications;
CREATE POLICY user_notifications_read_own ON public.user_notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_notifications_insert_own ON public.user_notifications;
CREATE POLICY user_notifications_insert_own ON public.user_notifications
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own ON public.user_notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.notification_templates TO anon, authenticated;
GRANT SELECT, INSERT ON public.notifications_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_notifications TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications_log'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications_log;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
        END IF;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_message TEXT,
    type TEXT,
    status TEXT DEFAULT 'Draft',
    product_id BIGINT REFERENCES public.products(id),
    audience_segment_id UUID REFERENCES public.audience_segments(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.marketing_campaigns
    ADD COLUMN IF NOT EXISTS base_message TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES public.products(id),
    ADD COLUMN IF NOT EXISTS audience_segment_id UUID REFERENCES public.audience_segments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

DO $$
DECLARE
    parent_id_type TEXT;
    parent_id_oid OID;
    parent_id_attnum SMALLINT;
    channel_campaign_id_oid OID;
    channel_campaign_id_attnum SMALLINT;
    existing_rows BIGINT;
    unlinked_channel_count BIGINT;
    orphan_campaign_count BIGINT;
    constraint_record RECORD;
    has_matching_foreign_key BOOLEAN;
    foreign_key_validated BOOLEAN;
    matching_foreign_key_name TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod), a.atttypid, a.attnum
      INTO parent_id_type, parent_id_oid, parent_id_attnum
      FROM pg_attribute a
     WHERE a.attrelid = 'public.marketing_campaigns'::regclass
       AND a.attname = 'id'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    IF parent_id_type IS NULL THEN
        RAISE EXCEPTION 'Could not determine the type of public.marketing_campaigns.id.';
    END IF;

    IF to_regclass('public.campaign_channels') IS NULL THEN
        EXECUTE format(
            'CREATE TABLE public.campaign_channels (
                id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
                campaign_id %s NOT NULL,
                channel TEXT NOT NULL,
                content JSONB NOT NULL DEFAULT ''{}''::JSONB,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                UNIQUE (campaign_id, channel)
            )',
            parent_id_type
        );
    ELSE
        SELECT a.atttypid
          INTO channel_campaign_id_oid
          FROM pg_attribute a
         WHERE a.attrelid = 'public.campaign_channels'::regclass
           AND a.attname = 'campaign_id'
           AND a.attnum > 0
           AND NOT a.attisdropped;

        IF channel_campaign_id_oid IS NULL THEN
            EXECUTE 'SELECT count(*) FROM public.campaign_channels' INTO existing_rows;
            IF existing_rows > 0 THEN
                RAISE EXCEPTION
                    'Cannot add campaign_channels.campaign_id: the table already contains % row(s) with no campaign links.',
                    existing_rows
                    USING HINT = 'Map the existing channel rows to their campaigns, then rerun the migration.';
            END IF;

            EXECUTE format(
                'ALTER TABLE public.campaign_channels ADD COLUMN campaign_id %s',
                parent_id_type
            );
        ELSIF channel_campaign_id_oid <> parent_id_oid THEN
            EXECUTE 'SELECT count(*) FROM public.campaign_channels' INTO existing_rows;
            IF existing_rows > 0 THEN
                RAISE EXCEPTION
                    'Cannot safely align public.campaign_channels.campaign_id (%) with public.marketing_campaigns.id (%): campaign_channels already contains % row(s).',
                    format_type(channel_campaign_id_oid, NULL),
                    parent_id_type,
                    existing_rows
                    USING HINT = 'Preserve and map the existing campaign IDs before changing this column type, then rerun the migration.';
            END IF;

            FOR constraint_record IN
                SELECT c.conname
                  FROM pg_constraint c
                  JOIN pg_attribute a
                    ON a.attrelid = c.conrelid
                   AND a.attnum = ANY(c.conkey)
                 WHERE c.conrelid = 'public.campaign_channels'::regclass
                   AND c.contype = 'f'
                   AND a.attname = 'campaign_id'
            LOOP
                EXECUTE format(
                    'ALTER TABLE public.campaign_channels DROP CONSTRAINT %I',
                    constraint_record.conname
                );
            END LOOP;

            EXECUTE 'ALTER TABLE public.campaign_channels ALTER COLUMN campaign_id DROP DEFAULT';
            EXECUTE format(
                'ALTER TABLE public.campaign_channels ALTER COLUMN campaign_id TYPE %s USING campaign_id::text::%s',
                parent_id_type,
                parent_id_type
            );
        END IF;
    END IF;

    SELECT a.attnum
      INTO channel_campaign_id_attnum
      FROM pg_attribute a
     WHERE a.attrelid = 'public.campaign_channels'::regclass
       AND a.attname = 'campaign_id'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    FOR constraint_record IN
        SELECT c.conname
          FROM pg_constraint c
         WHERE c.conrelid = 'public.campaign_channels'::regclass
           AND c.contype = 'f'
           AND channel_campaign_id_attnum = ANY(c.conkey)
           AND NOT (
               c.confrelid = 'public.marketing_campaigns'::regclass
               AND c.conkey = ARRAY[channel_campaign_id_attnum]::SMALLINT[]
               AND c.confkey = ARRAY[parent_id_attnum]::SMALLINT[]
           )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.campaign_channels DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;

    SELECT EXISTS (
        SELECT 1
          FROM pg_constraint c
         WHERE c.conrelid = 'public.campaign_channels'::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'public.marketing_campaigns'::regclass
           AND c.conkey = ARRAY[channel_campaign_id_attnum]::SMALLINT[]
           AND c.confkey = ARRAY[parent_id_attnum]::SMALLINT[]
    )
    INTO has_matching_foreign_key;

    IF NOT has_matching_foreign_key THEN
        ALTER TABLE public.campaign_channels
            ADD CONSTRAINT campaign_channels_campaign_id_fkey
            FOREIGN KEY (campaign_id)
            REFERENCES public.marketing_campaigns(id)
            ON DELETE CASCADE
            NOT VALID;
        matching_foreign_key_name := 'campaign_channels_campaign_id_fkey';
        foreign_key_validated := false;
    ELSE
        SELECT c.conname, c.convalidated
          INTO matching_foreign_key_name, foreign_key_validated
          FROM pg_constraint c
         WHERE c.conrelid = 'public.campaign_channels'::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'public.marketing_campaigns'::regclass
           AND c.conkey = ARRAY[channel_campaign_id_attnum]::SMALLINT[]
           AND c.confkey = ARRAY[parent_id_attnum]::SMALLINT[];
    END IF;

    SELECT count(*)
      INTO orphan_campaign_count
      FROM public.campaign_channels cc
      LEFT JOIN public.marketing_campaigns mc ON mc.id = cc.campaign_id
     WHERE cc.campaign_id IS NOT NULL
       AND mc.id IS NULL;

    SELECT count(*)
      INTO unlinked_channel_count
      FROM public.campaign_channels
     WHERE campaign_id IS NULL;

    IF unlinked_channel_count > 0 THEN
        RAISE EXCEPTION
            'Cannot enforce campaign_channels.campaign_id: % row(s) have no campaign link.',
            unlinked_channel_count
            USING HINT = 'Map or remove unlinked campaign-channel rows, then rerun the migration.';
    END IF;

    IF orphan_campaign_count > 0 THEN
        RAISE EXCEPTION
            'Cannot validate campaign_channels: % row(s) reference IDs missing from public.marketing_campaigns.',
            orphan_campaign_count
            USING HINT = 'Map or remove orphaned campaign-channel rows, then rerun the migration.';
    ELSIF NOT foreign_key_validated THEN
        EXECUTE format(
            'ALTER TABLE public.campaign_channels VALIDATE CONSTRAINT %I',
            matching_foreign_key_name
        );
    END IF;

    ALTER TABLE public.campaign_channels
        ALTER COLUMN campaign_id SET NOT NULL;
END $$;

ALTER TABLE public.campaign_channels
    ADD COLUMN IF NOT EXISTS channel TEXT,
    ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

DROP FUNCTION IF EXISTS public.count_matching_audience_members(NUMERIC, INTEGER, INTEGER);

CREATE FUNCTION public.count_matching_audience_members(
    p_spend_min NUMERIC,
    p_orders_min INTEGER,
    p_last_order_days INTEGER
)
RETURNS BIGINT
LANGUAGE SQL
STABLE
AS $$
    SELECT count(*)::BIGINT
    FROM public.profiles p
    WHERE COALESCE((
        SELECT sum(o.total_price)
        FROM public.orders o
        WHERE o.user_id = p.id
          AND lower(o.status) IN ('paid', 'delivered')
    ), 0) >= GREATEST(COALESCE(p_spend_min, 0), 0)
      AND (
        SELECT count(*)
        FROM public.orders o
        WHERE o.user_id = p.id
          AND lower(o.status) IN ('paid', 'delivered')
      ) >= GREATEST(COALESCE(p_orders_min, 0), 0)
      AND (
        COALESCE(p_last_order_days, 0) <= 0
        OR EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.user_id = p.id
              AND lower(o.status) IN ('paid', 'delivered')
              AND o.created_at >= now() - make_interval(days => p_last_order_days)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.get_completed_order_summary()
RETURNS TABLE(order_count BIGINT, total_revenue NUMERIC)
LANGUAGE SQL
STABLE
AS $$
    SELECT count(*)::BIGINT, COALESCE(sum(o.total_price), 0)::NUMERIC
    FROM public.orders o
    WHERE lower(o.status) IN ('paid', 'delivered');
$$;

CREATE OR REPLACE FUNCTION public.get_listed_price_stock_value()
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(sum(COALESCE(p.price, 0) * COALESCE(p.stock, 0)), 0)::NUMERIC
    FROM public.products p;
$$;

CREATE OR REPLACE FUNCTION public.get_order_delivery_demand_zones()
RETURNS TABLE(latitude NUMERIC, longitude NUMERIC, order_count BIGINT)
LANGUAGE SQL
STABLE
AS $$
    SELECT round(o.latitude, 3), round(o.longitude, 3), count(*)::BIGINT
    FROM public.orders o
    WHERE lower(o.status) IN ('paid', 'delivered')
      AND o.latitude BETWEEN -90 AND 90
      AND o.longitude BETWEEN -180 AND 180
    GROUP BY round(o.latitude, 3), round(o.longitude, 3);
$$;
