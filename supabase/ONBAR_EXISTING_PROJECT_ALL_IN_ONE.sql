-- ONBAR ALL-IN-ONE ADDITIVE MIGRATION
-- For an existing project where FINAL_ESTABLISHMENT_SQL.sql has already been applied.
-- Run this entire file once in the Supabase SQL Editor. All changes run in one transaction.
-- For a brand-new project, apply FINAL_ESTABLISHMENT_SQL.sql first.
BEGIN;

-- ===== ADMIN_CONTROLS_MIGRATION.sql =====
-- Database-backed actions used by the admin lockdown and autopilot controls.

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.settings TO service_role;

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

ALTER TABLE public.growth_autopilot_rules
    ADD COLUMN IF NOT EXISTS content_source TEXT NOT NULL DEFAULT 'TRENDING';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.growth_autopilot_rules'::regclass
          AND conname = 'growth_autopilot_rules_content_source_check'
    ) THEN
        ALTER TABLE public.growth_autopilot_rules
            ADD CONSTRAINT growth_autopilot_rules_content_source_check
            CHECK (content_source IN ('TRENDING', 'LOW_STOCK', 'EDITORIAL'));
    END IF;
END;
$$;

ALTER TABLE public.growth_autopilot_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_autopilot_rules FROM anon, authenticated;
GRANT ALL ON public.growth_autopilot_rules TO service_role;

INSERT INTO public.settings (key, value)
VALUES ('system_lockdown', '{"active": false}'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- ===== OPERATIONAL_FEATURES_MIGRATION.sql =====
-- Idempotent schema updates for delivery coverage, customer audiences,
-- draft-only campaign setup, and accurate admin analytics.

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variant_prices JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS is_souvenir BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_available_now BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS finish TEXT,
    ADD COLUMN IF NOT EXISTS capacity_oz NUMERIC,
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
    ADD COLUMN IF NOT EXISTS story TEXT,
    ADD COLUMN IF NOT EXISTS pairing_suggestions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
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
    ADD COLUMN IF NOT EXISTS name TEXT,
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

-- ===== GOVERNANCE_MIGRATION.sql =====
-- Governance Center tables and privacy-safe access for an existing project.

CREATE TABLE IF NOT EXISTS public.user_consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    anonymous_id TEXT,
    necessary BOOLEAN NOT NULL DEFAULT true,
    analytics BOOLEAN NOT NULL DEFAULT false,
    personalization BOOLEAN NOT NULL DEFAULT false,
    marketing BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_consent
    ADD COLUMN IF NOT EXISTS id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS anonymous_id TEXT,
    ADD COLUMN IF NOT EXISTS necessary BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS analytics BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS personalization BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS marketing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.user_consent
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.user_consent
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_consent_id_uidx
    ON public.user_consent (id);

CREATE UNIQUE INDEX IF NOT EXISTS user_consent_user_id_uidx
    ON public.user_consent (user_id);

ALTER TABLE public.user_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consent_read_own ON public.user_consent;
CREATE POLICY user_consent_read_own ON public.user_consent
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_consent_insert_own ON public.user_consent;
CREATE POLICY user_consent_insert_own ON public.user_consent
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (auth.uid() IS NULL AND user_id IS NULL)
        OR auth.uid() = user_id
    );

DROP POLICY IF EXISTS user_consent_update_own ON public.user_consent;
CREATE POLICY user_consent_update_own ON public.user_consent
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_consent TO authenticated;
GRANT INSERT ON public.user_consent TO anon;
GRANT ALL ON public.user_consent TO service_role;

CREATE TABLE IF NOT EXISTS public.data_quality_alerts (
    id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    issue_type TEXT NOT NULL,
    severity TEXT,
    description TEXT,
    affected_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_quality_alerts
    ADD COLUMN IF NOT EXISTS issue_type TEXT,
    ADD COLUMN IF NOT EXISTS severity TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS affected_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS data_quality_alerts_status_created_at_idx
    ON public.data_quality_alerts (status, created_at DESC);

ALTER TABLE public.data_quality_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_quality_alerts FROM anon, authenticated;
GRANT ALL ON public.data_quality_alerts TO service_role;

DO $$
BEGIN
    IF to_regclass('public.data_quality_alerts_id_seq') IS NOT NULL THEN
        REVOKE ALL ON SEQUENCE public.data_quality_alerts_id_seq FROM anon, authenticated;
        GRANT ALL ON SEQUENCE public.data_quality_alerts_id_seq TO service_role;
    END IF;
END;
$$;

-- ===== AUTH_SECURITY_MIGRATION.sql =====
-- Authentication audit records and server-only access controls.

DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(required.table_name, ', ')
    INTO missing_tables
    FROM (VALUES ('public.staff'), ('public.audit_logs')) AS required(table_name)
    WHERE to_regclass(required.table_name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Authentication migration requires the core schema. Missing tables: %.', missing_tables
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first, then rerun this migration.';
    END IF;
END;
$$;

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS supplier_id UUID,
    ADD COLUMN IF NOT EXISTS can_execute_payouts BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_view_audit_logs BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_staff BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_view_sensitive_data BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_communications BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_marketing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_kitchen BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT false,
    mode TEXT NOT NULL,
    identity_hint TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    user_agent TEXT,
    attempt_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_attempts
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS identity_hint TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx
    ON public.login_attempts (ip_address, attempt_time DESC);
CREATE INDEX IF NOT EXISTS login_attempts_failed_ip_time_idx
    ON public.login_attempts (ip_address, attempt_time DESC)
    WHERE success = false;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
GRANT ALL ON public.login_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.security_threats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    ip_address TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    fingerprint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

ALTER TABLE public.security_threats
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SECURITY_EVENT',
    ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'INFO',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_by TEXT;

CREATE INDEX IF NOT EXISTS security_threats_status_created_at_idx
    ON public.security_threats (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS security_threats_fingerprint_uidx
    ON public.security_threats (fingerprint);

ALTER TABLE public.security_threats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_threats FROM anon, authenticated;
GRANT ALL ON public.security_threats TO service_role;

CREATE TABLE IF NOT EXISTS public.ip_blacklist (
    ip_address TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_blacklist
    ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.ip_blacklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ip_blacklist FROM anon, authenticated;
GRANT ALL ON public.ip_blacklist TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT ALL ON public.audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';

-- ===== CUSTOMER_MESSAGING_MIGRATION.sql =====
-- Enables storefront announcements and private customer support replies.

CREATE TABLE IF NOT EXISTS public.messages (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id UUID,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New',
    admin_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS subject TEXT,
    ADD COLUMN IF NOT EXISTS message TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'New',
    ADD COLUMN IF NOT EXISTS admin_response TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS customer_token_hash TEXT;

CREATE INDEX IF NOT EXISTS messages_created_at_idx
    ON public.messages (created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM anon, authenticated;
GRANT ALL ON public.messages TO service_role;

CREATE TABLE IF NOT EXISTS public.customer_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_announcements_active_window_idx
    ON public.customer_announcements (is_active, starts_at DESC);

ALTER TABLE public.customer_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_announcements FROM anon, authenticated;
GRANT SELECT ON public.customer_announcements TO anon, authenticated;
GRANT ALL ON public.customer_announcements TO service_role;

DROP POLICY IF EXISTS customer_announcements_read_active ON public.customer_announcements;
CREATE POLICY customer_announcements_read_active
    ON public.customer_announcements
    FOR SELECT
    TO anon, authenticated
    USING (
        is_active = true
        AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
    );

CREATE INDEX IF NOT EXISTS messages_customer_token_hash_created_idx
    ON public.messages (customer_token_hash, created_at DESC)
    WHERE customer_token_hash IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ===== CRM_CONSENT_MESSAGING_MIGRATION.sql =====
-- Consent-aware in-app customer messaging on top of the existing CRM schema.
-- Run after FINAL_ESTABLISHMENT_SQL.sql and OPERATIONAL_FEATURES_MIGRATION.sql.


DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL
       OR to_regclass('public.orders') IS NULL
       OR to_regclass('public.user_consent') IS NULL
       OR to_regclass('public.audience_segments') IS NULL
       OR to_regclass('public.user_notifications') IS NULL
       OR to_regclass('public.message_campaigns') IS NULL
       OR to_regclass('public.newsletter_subscribers') IS NULL THEN
        RAISE EXCEPTION 'CRM messaging prerequisites are missing.'
            USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql and OPERATIONAL_FEATURES_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.user_consent
    ADD COLUMN IF NOT EXISTS in_app_marketing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS consent_source TEXT,
    ADD COLUMN IF NOT EXISTS consent_policy_version TEXT;

ALTER TABLE public.newsletter_subscribers
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

UPDATE public.newsletter_subscribers
SET consented_at = created_at
WHERE consented_at IS NULL;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_email_idx
    ON public.newsletter_subscribers (email)
    WHERE is_active = true;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_subscribers FROM anon, authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
DO $$
DECLARE
    newsletter_sequence TEXT;
BEGIN
    newsletter_sequence := pg_get_serial_sequence('public.newsletter_subscribers', 'id');
    IF newsletter_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', newsletter_sequence);
        EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', newsletter_sequence);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.customer_consent_audit (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('in_app_marketing')),
    granted BOOLEAN NOT NULL,
    source TEXT NOT NULL,
    policy_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_consent_audit_user_created_idx
    ON public.customer_consent_audit (user_id, created_at DESC);

ALTER TABLE public.customer_consent_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_consent_audit_read_own ON public.customer_consent_audit;
CREATE POLICY customer_consent_audit_read_own
    ON public.customer_consent_audit
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

REVOKE ALL ON public.customer_consent_audit FROM anon, authenticated;
GRANT SELECT ON public.customer_consent_audit TO authenticated;
GRANT ALL ON public.customer_consent_audit TO service_role;
DO $$
BEGIN
    IF to_regclass('public.customer_consent_audit_id_seq') IS NOT NULL THEN
        REVOKE ALL ON SEQUENCE public.customer_consent_audit_id_seq FROM anon, authenticated;
        GRANT ALL ON SEQUENCE public.customer_consent_audit_id_seq TO service_role;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_customer_marketing_preferences(
    p_in_app_marketing BOOLEAN,
    p_source TEXT DEFAULT 'profile'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_previous BOOLEAN;
    v_source TEXT := left(COALESCE(NULLIF(trim(p_source), ''), 'profile'), 80);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Sign in to update marketing preferences.';
    END IF;
    IF p_in_app_marketing IS NULL THEN
        RAISE EXCEPTION 'A notification preference is required.';
    END IF;

    SELECT c.in_app_marketing
      INTO v_previous
      FROM public.user_consent c
     WHERE c.user_id = v_user_id
     FOR UPDATE;

    INSERT INTO public.user_consent (
        user_id,
        marketing,
        in_app_marketing,
        consent_source,
        consent_policy_version,
        updated_at
    )
    VALUES (
        v_user_id,
        p_in_app_marketing,
        p_in_app_marketing,
        v_source,
        'crm-consent-v1',
        now()
    )
    ON CONFLICT (user_id) DO UPDATE
        SET marketing = EXCLUDED.marketing,
            in_app_marketing = EXCLUDED.in_app_marketing,
            consent_source = EXCLUDED.consent_source,
            consent_policy_version = EXCLUDED.consent_policy_version,
            updated_at = now();

    IF v_previous IS DISTINCT FROM p_in_app_marketing THEN
        INSERT INTO public.customer_consent_audit (
            user_id, channel, granted, source, policy_version
        )
        VALUES (
            v_user_id, 'in_app_marketing', p_in_app_marketing, v_source, 'crm-consent-v1'
        );
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_customer_marketing_preferences(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_marketing_preferences(BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_customer_marketing_preferences(BOOLEAN, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_marketing_recipients(p_audience_segment_id UUID DEFAULT NULL)
RETURNS TABLE(user_id UUID, full_name TEXT, phone_number TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, p.full_name::TEXT, p.phone_number::TEXT
    FROM public.profiles p
    JOIN public.user_consent c
      ON c.user_id = p.id
     AND c.marketing = true
     AND c.in_app_marketing = true
    LEFT JOIN public.audience_segments s
      ON s.id = p_audience_segment_id
    WHERE p_audience_segment_id IS NULL
       OR (
            s.id IS NOT NULL
            AND COALESCE((
                SELECT sum(o.total_price)
                FROM public.orders o
                WHERE o.user_id = p.id
                  AND lower(o.status) IN ('paid', 'delivered')
            ), 0) >= CASE
                WHEN COALESCE(s.rules->>'spend_min', '') ~ '^[0-9]+([.][0-9]+)?$'
                    THEN (s.rules->>'spend_min')::NUMERIC
                ELSE 0
            END
            AND (
                SELECT count(*)
                FROM public.orders o
                WHERE o.user_id = p.id
                  AND lower(o.status) IN ('paid', 'delivered')
            ) >= CASE
                WHEN COALESCE(s.rules->>'orders_min', '') ~ '^[0-9]+$'
                    THEN (s.rules->>'orders_min')::INTEGER
                ELSE 0
            END
            AND (
                CASE
                    WHEN COALESCE(s.rules->>'last_order_days', '') ~ '^[0-9]+$'
                        THEN (s.rules->>'last_order_days')::INTEGER
                    ELSE 0
                END <= 0
                OR EXISTS (
                    SELECT 1
                    FROM public.orders o
                    WHERE o.user_id = p.id
                      AND lower(o.status) IN ('paid', 'delivered')
                      AND o.created_at >= now() - make_interval(
                          days => CASE
                              WHEN COALESCE(s.rules->>'last_order_days', '') ~ '^[0-9]+$'
                                  THEN (s.rules->>'last_order_days')::INTEGER
                              ELSE 0
                          END
                      )
                )
            )
       )
    ORDER BY p.id;
$$;

CREATE OR REPLACE FUNCTION public.count_crm_marketing_recipients(p_audience_segment_id UUID DEFAULT NULL)
RETURNS BIGINT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT count(*)::BIGINT
    FROM public.crm_marketing_recipients(p_audience_segment_id);
$$;

CREATE OR REPLACE FUNCTION public.count_matching_audience_members(
    p_spend_min NUMERIC,
    p_orders_min INTEGER,
    p_last_order_days INTEGER
)
RETURNS BIGINT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT count(*)::BIGINT
    FROM public.profiles p
    JOIN public.user_consent c
      ON c.user_id = p.id
     AND c.marketing = true
     AND c.in_app_marketing = true
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

REVOKE ALL ON FUNCTION public.crm_marketing_recipients(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_crm_marketing_recipients(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_marketing_recipients(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_crm_marketing_recipients(UUID) TO service_role;

ALTER TABLE public.message_campaigns
    ADD COLUMN IF NOT EXISTS channel TEXT,
    ADD COLUMN IF NOT EXISTS message TEXT,
    ADD COLUMN IF NOT EXISTS audience_segment_id UUID REFERENCES public.audience_segments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sent_by TEXT,
    ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.message_campaign_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.message_campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_email TEXT,
    notification_id UUID REFERENCES public.user_notifications(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, user_id)
);

ALTER TABLE public.message_campaign_deliveries
    ADD COLUMN IF NOT EXISTS recipient_email TEXT,
    ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.message_campaign_deliveries'::regclass
          AND conname = 'message_campaign_deliveries_has_recipient_check'
    ) THEN
        ALTER TABLE public.message_campaign_deliveries
            ADD CONSTRAINT message_campaign_deliveries_has_recipient_check
            CHECK (user_id IS NOT NULL OR recipient_email IS NOT NULL);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS message_campaign_deliveries_user_created_idx
    ON public.message_campaign_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS message_campaign_deliveries_campaign_status_idx
    ON public.message_campaign_deliveries (campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS message_campaign_deliveries_campaign_email_uidx
    ON public.message_campaign_deliveries (campaign_id, recipient_email)
    WHERE recipient_email IS NOT NULL;

ALTER TABLE public.message_campaign_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_campaign_deliveries_read_own ON public.message_campaign_deliveries;
CREATE POLICY message_campaign_deliveries_read_own
    ON public.message_campaign_deliveries
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

REVOKE ALL ON public.message_campaign_deliveries FROM anon, authenticated;
GRANT SELECT ON public.message_campaign_deliveries TO authenticated;
GRANT ALL ON public.message_campaign_deliveries TO service_role;

ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_campaigns FROM anon, authenticated;
GRANT ALL ON public.message_campaigns TO service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'message_campaign_deliveries'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_campaign_deliveries;
    END IF;
END;
$$;


-- ===== AFFILIATE_PROGRAM_MIGRATION.sql =====
-- Affiliate applications, attribution balances, and payout requests.
-- Run this migration in the Supabase SQL Editor before deploying the affiliate APIs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    referral_code TEXT,
    business_name TEXT NOT NULL,
    bio TEXT NOT NULL,
    audience_size INTEGER NOT NULL DEFAULT 0,
    primary_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    preferred_payout_method TEXT NOT NULL DEFAULT 'M-Pesa',
    payout_details TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'Pending',
    commission_rate_override NUMERIC NOT NULL DEFAULT 5,
    marketing_agreement_accepted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT affiliates_status_check CHECK (verification_status IN ('Pending', 'Verified', 'Rejected', 'Suspended')),
    CONSTRAINT affiliates_payout_method_check CHECK (preferred_payout_method IN ('M-Pesa', 'Bank')),
    CONSTRAINT affiliates_audience_size_check CHECK (audience_size >= 0),
    CONSTRAINT affiliates_commission_rate_check CHECK (commission_rate_override > 0 AND commission_rate_override <= 100)
);

ALTER TABLE public.affiliates
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS referral_code TEXT,
    ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS audience_size INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS primary_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS preferred_payout_method TEXT NOT NULL DEFAULT 'M-Pesa',
    ADD COLUMN IF NOT EXISTS payout_details TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS commission_rate_override NUMERIC NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS marketing_agreement_accepted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.affiliates
SET user_id = id
WHERE user_id IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = affiliates.id);

CREATE UNIQUE INDEX IF NOT EXISTS affiliates_user_id_unique ON public.affiliates(user_id);

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'Pending',
    payment_method TEXT NOT NULL DEFAULT 'M-Pesa',
    payment_details TEXT NOT NULL DEFAULT '',
    mpesa_receipt TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_payouts
    ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS amount NUMERIC,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'M-Pesa',
    ADD COLUMN IF NOT EXISTS payment_details TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS mpesa_receipt TEXT,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS affiliate_payouts_profile_created_idx
    ON public.affiliate_payouts(profile_id, created_at DESC);

UPDATE public.affiliate_payouts
SET status = CASE lower(status)
    WHEN 'requested' THEN 'Pending'
    WHEN 'pending' THEN 'Pending'
    WHEN 'approved' THEN 'Approved'
    WHEN 'processing' THEN 'Processing'
    WHEN 'paid' THEN 'Paid'
    WHEN 'rejected' THEN 'Rejected'
    ELSE status
END;

CREATE OR REPLACE VIEW public.affiliate_performance_summary AS
SELECT
    p.id AS affiliate_id,
    p.full_name,
    p.email,
    p.referral_code,
    p.membership_tier AS affiliate_tier,
    a.verification_status AS status,
    (SELECT count(*) FROM public.analytics_events ae
        WHERE ae.event_name = 'REFERRAL_CLICK' AND ae.payload->>'ref' = p.referral_code) AS clicks,
    (SELECT count(*) FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) IN ('paid', 'dispatched', 'delivered', 'completed')) AS conversions,
    (SELECT COALESCE(sum(o.total_price), 0) FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) IN ('paid', 'dispatched', 'delivered', 'completed')) AS total_revenue,
    GREATEST(0,
        (SELECT COALESCE(sum(o.total_price), 0) FROM public.orders o
            WHERE o.referred_by_code = p.referral_code
              AND lower(COALESCE(o.status, '')) IN ('paid', 'dispatched', 'delivered', 'completed'))
            * COALESCE(NULLIF(a.commission_rate_override, 0), 5) / 100
        - (SELECT COALESCE(sum(ap.amount), 0) FROM public.affiliate_payouts ap
            WHERE ap.profile_id = p.id
              AND lower(COALESCE(ap.status, '')) IN ('requested', 'pending', 'approved', 'processing', 'paid'))
    ) AS available_earnings,
    (SELECT COALESCE(sum(o.total_price), 0) * COALESCE(NULLIF(a.commission_rate_override, 0), 5) / 100
        FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) NOT IN ('paid', 'dispatched', 'delivered', 'completed', 'cancelled', 'payment failed', 'refunded')) AS pending_earnings,
    (SELECT max(o.created_at) FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) IN ('paid', 'dispatched', 'delivered', 'completed')) AS last_conversion_at,
    (SELECT count(*) FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) NOT IN ('paid', 'dispatched', 'delivered', 'completed', 'cancelled', 'payment failed', 'refunded')) AS pending_orders,
    (SELECT COALESCE(sum(o.total_price), 0) FROM public.orders o
        WHERE o.referred_by_code = p.referral_code
          AND lower(COALESCE(o.status, '')) NOT IN ('paid', 'dispatched', 'delivered', 'completed', 'cancelled', 'payment failed', 'refunded')) AS pending_sales
FROM public.affiliates a
JOIN public.profiles p ON p.id = a.user_id;

REVOKE ALL ON public.affiliate_performance_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.affiliate_performance_summary TO service_role;

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('affiliates', 'affiliate_payouts')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'affiliates' AND policyname = 'Affiliate owners can view their application'
    ) THEN
        CREATE POLICY "Affiliate owners can view their application"
            ON public.affiliates FOR SELECT TO authenticated
            USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'affiliate_payouts' AND policyname = 'Affiliate owners can view their payouts'
    ) THEN
        CREATE POLICY "Affiliate owners can view their payouts"
            ON public.affiliate_payouts FOR SELECT TO authenticated
            USING (auth.uid() = profile_id);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.request_affiliate_payout(
    p_profile_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_payment_details TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_affiliate public.affiliates%ROWTYPE;
    v_referral_code TEXT;
    v_rate NUMERIC;
    v_earned NUMERIC;
    v_reserved NUMERIC;
    v_payout_id TEXT;
BEGIN
    IF p_amount < 1000 OR p_amount <> trunc(p_amount) OR p_payment_method NOT IN ('M-Pesa', 'Bank')
        OR length(trim(p_payment_details)) < 3 OR length(p_payment_details) > 200 THEN
        RAISE EXCEPTION 'Invalid affiliate payout request';
    END IF;

    SELECT * INTO v_affiliate
    FROM public.affiliates
    WHERE user_id = p_profile_id
    FOR UPDATE;

    IF NOT FOUND OR v_affiliate.verification_status <> 'Verified' THEN
        RAISE EXCEPTION 'Approved affiliate account required';
    END IF;

    SELECT referral_code INTO v_referral_code
    FROM public.profiles
    WHERE id = p_profile_id;

    IF v_referral_code IS NULL THEN
        RAISE EXCEPTION 'Affiliate referral code is missing';
    END IF;

    v_rate := COALESCE(NULLIF(v_affiliate.commission_rate_override, 0), 5);
    SELECT COALESCE(SUM(total_price), 0) * v_rate / 100 INTO v_earned
    FROM public.orders
    WHERE referred_by_code = v_referral_code
      AND lower(COALESCE(status, '')) IN ('paid', 'dispatched', 'delivered', 'completed');

    SELECT COALESCE(SUM(amount), 0) INTO v_reserved
    FROM public.affiliate_payouts
    WHERE profile_id = p_profile_id
      AND lower(COALESCE(status, '')) IN ('requested', 'pending', 'approved', 'processing', 'paid');

    IF p_amount > v_earned - v_reserved THEN
        RAISE EXCEPTION 'Insufficient available earnings';
    END IF;

    INSERT INTO public.affiliate_payouts(profile_id, amount, status, payment_method, payment_details)
    VALUES (p_profile_id, p_amount, 'Pending', p_payment_method, trim(p_payment_details))
    RETURNING id::TEXT INTO v_payout_id;

    RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_affiliate_payout(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_affiliate_payout(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- ===== BEHAVIOR_METRICS_MIGRATION.sql =====
-- Correct behavioral metrics and stop session navigation from resetting engagement.

ALTER TABLE public.customer_sessions
    ADD COLUMN IF NOT EXISTS active_time_tracking_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS active_heartbeat_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_active_time_sec INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_active_date DATE;

-- Older totals were unreliable: the former heartbeat did not record interactions
-- and page navigation could reset totals. Start trustworthy measurement at migration time.
UPDATE public.customer_sessions
SET total_active_time_sec = 0,
    active_time_tracking_started_at = now(),
    daily_active_time_sec = 0,
    active_heartbeat_count = 0,
    daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
WHERE active_time_tracking_started_at IS NULL;

ALTER TABLE public.customer_sessions
    ALTER COLUMN total_active_time_sec SET DEFAULT 0,
    ALTER COLUMN active_time_tracking_started_at SET DEFAULT now(),
    ALTER COLUMN active_heartbeat_count SET DEFAULT 0,
    ALTER COLUMN daily_active_time_sec SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_customer_aggregate_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.customer_aggregate_metrics (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO UPDATE SET
        total_sessions = (
            SELECT COUNT(*)
            FROM public.customer_sessions
            WHERE user_id = NEW.user_id
        ),
        total_active_time_sec = COALESCE((
            SELECT SUM(total_active_time_sec)
            FROM public.customer_sessions
            WHERE user_id = NEW.user_id
        ), 0),
        total_pages_viewed = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PAGE_VIEW'
        ),
        total_products_viewed = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'PRODUCT_VIEW'
        ),
        total_clicks = (
            SELECT COUNT(*)
            FROM public.analytics_events
            WHERE user_id = NEW.user_id
              AND event_name = 'UI_INTERACTION'
        ),
        updated_at = now();

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_presence_heartbeat(
    p_session_id TEXT,
    p_page TEXT,
    p_product_id BIGINT,
    p_active_ms INTEGER,
    p_visible BOOLEAN,
    p_cart_value NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.customer_sessions
    SET current_page = p_page,
        last_seen_at = now(),
        total_active_time_sec = COALESCE(total_active_time_sec, 0)
            + CASE WHEN p_visible THEN GREATEST(COALESCE(p_active_ms, 0), 0) / 1000 ELSE 0 END,
        daily_active_time_sec = CASE
            WHEN daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
                THEN COALESCE(daily_active_time_sec, 0)
            ELSE 0
        END + CASE WHEN p_visible THEN GREATEST(COALESCE(p_active_ms, 0), 0) / 1000 ELSE 0 END,
        active_heartbeat_count = CASE
            WHEN daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
                THEN COALESCE(active_heartbeat_count, 0)
            ELSE 0
        END + CASE WHEN p_visible AND COALESCE(p_active_ms, 0) > 0 THEN 1 ELSE 0 END,
        daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE,
        session_status = CASE WHEN p_visible THEN 'ACTIVE' ELSE 'IDLE' END,
        cart_value = GREATEST(COALESCE(p_cart_value, 0), 0)
    WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_behavioral_metrics()
RETURNS TABLE (
    live_users BIGINT,
    events_today BIGINT,
    avg_active_sec NUMERIC,
    cart_rate NUMERIC,
    cart_sessions BIGINT,
    visitor_sessions BIGINT,
    rage_clicks_24h BIGINT,
    zero_results_24h BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH visitor_sessions AS (
        SELECT DISTINCT ae.session_id
        FROM public.analytics_events ae
        WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'
          AND ae.session_id IS NOT NULL
          AND ae.event_name = 'PAGE_VIEW'
    ),
    traffic AS (
        SELECT
            (SELECT count(*) FROM visitor_sessions) AS visitor_sessions,
            (SELECT count(DISTINCT ae.session_id)
             FROM public.analytics_events ae
             WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'
               AND ae.event_name = 'ADD_TO_CART'
               AND ae.session_id IN (SELECT session_id FROM visitor_sessions)) AS cart_sessions
    ),
    engagement AS (
        SELECT avg(cs.daily_active_time_sec)::NUMERIC AS avg_active_sec
        FROM public.customer_sessions cs
        WHERE cs.daily_active_date = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
          AND cs.active_heartbeat_count > 0
    )
    SELECT
        (SELECT count(*) FROM public.customer_sessions cs
         WHERE cs.last_seen_at >= now() - interval '5 minutes')::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi')::BIGINT,
        engagement.avg_active_sec,
        CASE WHEN traffic.visitor_sessions = 0 THEN NULL
             ELSE round(100.0 * traffic.cart_sessions / traffic.visitor_sessions, 1)
        END,
        traffic.cart_sessions::BIGINT,
        traffic.visitor_sessions::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.event_name = 'RAGE_CLICK'
           AND ae.created_at >= now() - interval '24 hours')::BIGINT,
        (SELECT count(*) FROM public.analytics_events ae
         WHERE ae.event_name = 'ZERO_RESULTS'
           AND ae.created_at >= now() - interval '24 hours')::BIGINT
    FROM traffic
    CROSS JOIN engagement;
$$;

REVOKE ALL ON FUNCTION public.get_behavioral_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_behavioral_metrics() TO service_role;

-- ===== DEMAND_INTELLIGENCE_MIGRATION.sql =====
-- Stores only a customer-approved area; exact browser coordinates are never persisted here.
CREATE TABLE IF NOT EXISTS public.customer_location_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    anonymous_id TEXT,
    country TEXT NOT NULL,
    county TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    location_source TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customer_location_preferences_identity_check
        CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_location_preferences_user_uidx
    ON public.customer_location_preferences (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_location_preferences_anonymous_uidx
    ON public.customer_location_preferences (anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_location_preferences_area_idx
    ON public.customer_location_preferences (country, county, city, area);

ALTER TABLE public.customer_sessions
    ADD COLUMN IF NOT EXISTS location_preference_id UUID
        REFERENCES public.customer_location_preferences(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS location_country TEXT,
    ADD COLUMN IF NOT EXISTS location_county TEXT,
    ADD COLUMN IF NOT EXISTS location_city TEXT,
    ADD COLUMN IF NOT EXISTS location_area TEXT;

CREATE TABLE IF NOT EXISTS public.market_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    country TEXT NOT NULL DEFAULT 'Kenya',
    county TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    notification_consent BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'storefront',
    status TEXT NOT NULL DEFAULT 'WAITLIST',
    notified_at TIMESTAMPTZ,
    converted_to_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT market_waitlist_notification_consent_check CHECK (notification_consent = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS market_waitlist_email_area_uidx
    ON public.market_waitlist (lower(email), lower(city), lower(area));
CREATE INDEX IF NOT EXISTS market_waitlist_location_created_idx
    ON public.market_waitlist (country, county, city, area, created_at DESC);

CREATE TABLE IF NOT EXISTS public.waitlist_demand_locations (
    waitlist_id UUID PRIMARY KEY REFERENCES public.market_waitlist(id) ON DELETE CASCADE,
    latitude NUMERIC(6, 3) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(7, 3) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m NUMERIC(7, 2) NOT NULL CHECK (accuracy_m > 0 AND accuracy_m <= 250),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_demand_locations_grid_idx
    ON public.waitlist_demand_locations (latitude, longitude);
ALTER TABLE public.waitlist_demand_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_demand_locations FROM anon, authenticated;
GRANT ALL ON public.waitlist_demand_locations TO service_role;

ALTER TABLE public.customer_location_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_location_preferences FROM anon, authenticated;
REVOKE ALL ON public.market_waitlist FROM anon, authenticated;
GRANT ALL ON public.customer_location_preferences TO service_role;
GRANT ALL ON public.market_waitlist TO service_role;

CREATE OR REPLACE FUNCTION public.link_customer_location_preference(
    p_anonymous_id TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    anonymous_preference public.customer_location_preferences%ROWTYPE;
    account_preference public.customer_location_preferences%ROWTYPE;
BEGIN
    SELECT * INTO anonymous_preference
    FROM public.customer_location_preferences
    WHERE anonymous_id = p_anonymous_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO account_preference
    FROM public.customer_location_preferences
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.customer_location_preferences
        SET user_id = p_user_id, updated_at = now()
        WHERE id = anonymous_preference.id;
        RETURN TRUE;
    END IF;

    IF account_preference.id = anonymous_preference.id THEN
        RETURN TRUE;
    END IF;

    UPDATE public.customer_sessions
    SET location_preference_id = account_preference.id
    WHERE anonymous_id = p_anonymous_id;

    UPDATE public.customer_location_preferences
    SET anonymous_id = NULL,
        country = anonymous_preference.country,
        county = anonymous_preference.county,
        city = anonymous_preference.city,
        area = anonymous_preference.area,
        location_source = anonymous_preference.location_source,
        consented_at = anonymous_preference.consented_at,
        updated_at = now()
    WHERE id = account_preference.id;

    DELETE FROM public.customer_location_preferences
    WHERE id = anonymous_preference.id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_location_preference(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_location_preference(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_demand_intelligence(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
    SELECT now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90))) AS since_at,
           now() - make_interval(days => 2 * greatest(1, least(coalesce(p_days, 30), 90))) AS previous_since_at
),
locations AS (
    SELECT DISTINCT country, county, city, area
    FROM public.customer_location_preferences
    UNION
    SELECT DISTINCT country, county, city, area
    FROM public.market_waitlist
),
metrics AS (
    SELECT
        loc.country,
        loc.county,
        loc.city,
        loc.area,
        (SELECT count(DISTINCT coalesce(pref.user_id::TEXT, pref.anonymous_id))
         FROM public.customer_location_preferences pref
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
        ) AS known_visitors,
        (SELECT count(*)
         FROM public.profiles prof
         JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
        ) AS total_users,
        (SELECT count(*)
         FROM public.profiles prof
         JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area) = (loc.country, loc.county, loc.city, loc.area)
           AND prof.created_at >= b.since_at
        ) AS new_signups,
        (SELECT count(DISTINCT coalesce(sess.user_id::TEXT, sess.anonymous_id, sess.id))
         FROM public.customer_sessions sess
         LEFT JOIN public.customer_location_preferences pref
           ON pref.id = sess.location_preference_id
           OR (sess.location_preference_id IS NULL AND (
               (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
               OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
           ))
         CROSS JOIN bounds b
         WHERE (coalesce(sess.location_country, pref.country),
                coalesce(sess.location_county, pref.county),
                coalesce(sess.location_city, pref.city),
                coalesce(sess.location_area, pref.area))
               = (loc.country, loc.county, loc.city, loc.area)
           AND sess.last_seen_at >= b.since_at
        ) AS active_users,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
        ) AS waitlist_signups,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         CROSS JOIN bounds b
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND waitlist.created_at >= b.since_at
        ) AS recent_waitlist_signups,
        (SELECT count(*)
         FROM public.market_waitlist waitlist
         CROSS JOIN bounds b
         WHERE (waitlist.country, waitlist.county, waitlist.city, waitlist.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND waitlist.created_at >= b.previous_since_at
           AND waitlist.created_at < b.since_at
        ) AS previous_waitlist_signups,
        (SELECT count(*)
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS orders,
        (SELECT count(DISTINCT coalesce(ord.user_id::TEXT, sess.anonymous_id, sess.id::TEXT))
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS converted_customers,
        (SELECT coalesce(sum(ord.total_price), 0)
         FROM public.orders ord
         LEFT JOIN public.customer_sessions sess ON sess.id = ord.session_id
         LEFT JOIN LATERAL (
             SELECT pref.country, pref.county, pref.city, pref.area
             FROM public.customer_location_preferences pref
             WHERE (ord.user_id IS NOT NULL AND pref.user_id = ord.user_id)
                OR (sess.location_preference_id IS NOT NULL AND pref.id = sess.location_preference_id)
                OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
             ORDER BY
                CASE WHEN pref.id = sess.location_preference_id THEN 0
                     WHEN pref.user_id = ord.user_id THEN 1 ELSE 2 END,
                pref.updated_at DESC
             LIMIT 1
         ) pref ON true
         CROSS JOIN bounds b
         WHERE (pref.country, pref.county, pref.city, pref.area)
               = (loc.country, loc.county, loc.city, loc.area)
           AND ord.created_at >= b.since_at
           AND (ord.payment_verified_at IS NOT NULL OR lower(coalesce(ord.status, '')) IN ('paid', 'completed', 'delivered', 'success'))
        ) AS revenue,
        (SELECT coalesce(jsonb_object_agg(source_channel, session_count), '{}'::JSONB)
         FROM (
             SELECT coalesce(nullif(sess.source_channel, ''), 'Direct') AS source_channel,
                    count(DISTINCT sess.id) AS session_count
             FROM public.customer_sessions sess
             LEFT JOIN public.customer_location_preferences pref
               ON pref.id = sess.location_preference_id
               OR (sess.location_preference_id IS NULL AND (
                   (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
                   OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
               ))
             CROSS JOIN bounds b
             WHERE (coalesce(sess.location_country, pref.country),
                    coalesce(sess.location_county, pref.county),
                    coalesce(sess.location_city, pref.city),
                    coalesce(sess.location_area, pref.area))
                   = (loc.country, loc.county, loc.city, loc.area)
               AND sess.created_at >= b.since_at
             GROUP BY 1
         ) sources
        ) AS traffic_sources
    FROM locations loc
)
SELECT jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 90)),
    'locations', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'country', country,
            'county', county,
            'city', city,
            'area', area,
            'knownVisitors', known_visitors,
            'totalUsers', total_users,
            'newSignups', new_signups,
            'activeUsers', active_users,
            'waitlistSignups', waitlist_signups,
            'recentWaitlistSignups', recent_waitlist_signups,
            'previousWaitlistSignups', previous_waitlist_signups,
            'orders', orders,
            'revenue', revenue,
            'conversionRate', CASE WHEN active_users > 0 THEN round(converted_customers::NUMERIC * 100 / active_users, 1) ELSE 0 END,
            'trafficSources', traffic_sources
        ) ORDER BY waitlist_signups DESC, orders DESC)
        FROM metrics
    ), '[]'::JSONB),
    'waitlistContacts', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'email', email,
            'phone', phone,
            'country', country,
            'county', county,
            'city', city,
            'area', area,
            'source', source,
            'status', status,
            'createdAt', created_at
        ) ORDER BY created_at DESC)
        FROM (
            SELECT id, email, phone, country, county, city, area, source, status, created_at
            FROM public.market_waitlist
            WHERE notification_consent = true
            ORDER BY created_at DESC
            LIMIT 500
        ) contacts
    ), '[]'::JSONB),
    'dailyTrend', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'date', trend_date,
            'activeSessions', active_sessions,
            'newSignups', new_signups,
            'waitlistSignups', waitlist_signups
        ) ORDER BY trend_date)
        FROM (
            SELECT
                dates.day::DATE AS trend_date,
                (SELECT count(DISTINCT sess.id)
                 FROM public.customer_sessions sess
                 JOIN public.customer_location_preferences pref
                   ON pref.id = sess.location_preference_id
                   OR (sess.location_preference_id IS NULL AND (
                       (sess.user_id IS NOT NULL AND pref.user_id = sess.user_id)
                       OR (sess.anonymous_id IS NOT NULL AND pref.anonymous_id = sess.anonymous_id)
                   ))
                 WHERE sess.created_at::DATE = dates.day::DATE
                ) AS active_sessions,
                (SELECT count(*)
                 FROM public.profiles prof
                 JOIN public.customer_location_preferences pref ON pref.user_id = prof.id
                 WHERE prof.created_at::DATE = dates.day::DATE
                ) AS new_signups,
                (SELECT count(*)
                 FROM public.market_waitlist waitlist
                 WHERE waitlist.created_at::DATE = dates.day::DATE
                ) AS waitlist_signups
            FROM generate_series(
                current_date - (greatest(1, least(coalesce(p_days, 30), 90)) - 1),
                current_date,
                interval '1 day'
            ) dates(day)
        ) trend
    ), '[]'::JSONB)
);
$$;

REVOKE ALL ON FUNCTION public.get_demand_intelligence(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_demand_intelligence(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ===== FOOD_ADDONS_MIGRATION.sql =====
CREATE TABLE IF NOT EXISTS public.food_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_addons_active_name_idx
    ON public.food_addons (is_active, name);

ALTER TABLE public.food_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can read active meal extras" ON public.food_addons;
CREATE POLICY "Customers can read active meal extras"
    ON public.food_addons
    FOR SELECT
    TO anon, authenticated
    USING (is_active);
GRANT SELECT ON public.food_addons TO anon, authenticated;
GRANT ALL ON public.food_addons TO service_role;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::JSONB;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'onlinebar-assets',
    'onlinebar-assets',
    true,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

DROP POLICY IF EXISTS "Public read onlinebar assets" ON storage.objects;
CREATE POLICY "Public read onlinebar assets"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'onlinebar-assets');

NOTIFY pgrst, 'reload schema';

-- ===== BEVERAGE_INVENTORY_MIGRATION.sql =====
-- Persist beverage serving size and chilled-serving information.
-- Safe to re-run on databases where any of these columns already exist.

DO $$
BEGIN
    IF to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'Beverage inventory migration requires public.products.'
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS size_label TEXT,
    ADD COLUMN IF NOT EXISTS is_ice_cold BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS temperature_celsius NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS warehouse_location TEXT;

NOTIFY pgrst, 'reload schema';

-- ===== MOBILE_WIDGETS_MIGRATION.sql =====
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

-- ===== MERCHANT_OPERATIONS_MIGRATION.sql =====
-- Merchant onboarding, verification, compliance, and traceability foundation.
-- Merchant documents are stored in a private bucket and served only through
-- short-lived signed URLs issued by authorized server routes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.merchant_code_sequence START WITH 1;

CREATE TABLE IF NOT EXISTS public.merchant_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_code TEXT UNIQUE,
    business_name TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 160),
    trading_name TEXT,
    business_type TEXT NOT NULL CHECK (business_type IN (
        'bar', 'kitchen', 'restaurant', 'food_vendor', 'supplier', 'delivery_partner'
    )),
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_role TEXT NOT NULL,
    address TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Kenya',
    county TEXT NOT NULL,
    town TEXT NOT NULL,
    operating_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    operating_hours JSONB NOT NULL DEFAULT '{}'::JSONB,
    cuisine_or_category TEXT,
    preparation_capacity INTEGER CHECK (preparation_capacity IS NULL OR preparation_capacity BETWEEN 1 AND 100000),
    delivery_radius_km NUMERIC(6,2) CHECK (delivery_radius_km IS NULL OR delivery_radius_km BETWEEN 0 AND 500),
    collection_available BOOLEAN NOT NULL DEFAULT false,
    offered_goods JSONB NOT NULL DEFAULT '[]'::JSONB,
    offered_goods_pricing JSONB NOT NULL DEFAULT '[]'::JSONB,
    documents JSONB NOT NULL DEFAULT '[]'::JSONB,
    privacy_notice_version TEXT NOT NULL DEFAULT 'merchant-application-v1',
    privacy_acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'under_review', 'information_requested', 'approved',
        'rejected', 'suspended', 'expired'
    )),
    review_note TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS offered_goods JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS offered_goods_pricing JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS merchant_applications_status_created_idx
    ON public.merchant_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_applications_area_idx
    ON public.merchant_applications USING GIN (operating_areas);

CREATE OR REPLACE FUNCTION public.merchant_schedule_interval_contains(
    p_day JSONB,
    p_time TIME,
    p_previous_day BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    enabled BOOLEAN := false;
    open_text TEXT;
    close_text TEXT;
    open_time TIME;
    close_time TIME;
    legacy_hours TEXT;
BEGIN
    IF jsonb_typeof(p_day) = 'string' THEN
        legacy_hours := p_day #>> '{}';
        IF legacy_hours !~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
            RETURN false;
        END IF;
        open_text := substring(legacy_hours from 1 for 5);
        close_text := substring(legacy_hours from 7 for 5);
        enabled := open_text <> close_text;
    ELSIF jsonb_typeof(p_day) = 'object' THEN
        enabled := coalesce(p_day->'enabled' = 'true'::JSONB, false);
        open_text := p_day->>'open';
        close_text := p_day->>'close';
        IF open_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR close_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
            RETURN false;
        END IF;
    ELSE
        RETURN false;
    END IF;
    IF NOT enabled THEN
        RETURN false;
    END IF;
    open_time := open_text::TIME;
    close_time := close_text::TIME;
    IF open_time = close_time THEN
        RETURN false;
    ELSIF open_time < close_time THEN
        RETURN NOT p_previous_day AND p_time >= open_time AND p_time < close_time;
    ELSIF p_previous_day THEN
        RETURN p_time < close_time;
    END IF;
    RETURN p_time >= open_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_is_open(
    p_operating_hours JSONB,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    local_time TIMESTAMP;
    weekday_number INTEGER;
    weekdays TEXT[] := ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    current_day TEXT;
    previous_day TEXT;
    current_clock TIME;
BEGIN
    IF jsonb_typeof(p_operating_hours) <> 'object' THEN
        RETURN false;
    END IF;
    local_time := p_at AT TIME ZONE 'Africa/Nairobi';
    weekday_number := extract(isodow FROM local_time)::INTEGER;
    current_day := weekdays[weekday_number];
    previous_day := weekdays[CASE WHEN weekday_number = 1 THEN 7 ELSE weekday_number - 1 END];
    current_clock := local_time::TIME;
    RETURN public.merchant_schedule_interval_contains(p_operating_hours->current_day, current_clock, false)
        OR public.merchant_schedule_interval_contains(p_operating_hours->previous_day, current_clock, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_merchant_availability(
    p_application_id UUID,
    p_operating_hours JSONB,
    p_accepting_orders BOOLEAN,
    p_actor TEXT
)
RETURNS public.merchant_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    updated_application public.merchant_applications;
    weekday TEXT;
    day_hours JSONB;
BEGIN
    IF jsonb_typeof(p_operating_hours) <> 'object'
       OR p_accepting_orders IS NULL
       OR p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RAISE EXCEPTION 'A complete weekly schedule, availability and actor are required.';
    END IF;
    FOREACH weekday IN ARRAY ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    LOOP
        day_hours := p_operating_hours->weekday;
        IF jsonb_typeof(day_hours) IS DISTINCT FROM 'object'
           OR jsonb_typeof(day_hours->'enabled') IS DISTINCT FROM 'boolean'
           OR coalesce(day_hours->>'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR coalesce(day_hours->>'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR (day_hours->>'enabled' = 'true' AND day_hours->>'open' = day_hours->>'close') THEN
            RAISE EXCEPTION 'The operating hours for % are invalid.', weekday;
        END IF;
    END LOOP;
    UPDATE public.merchant_applications
    SET operating_hours = p_operating_hours,
        accepting_orders = p_accepting_orders,
        availability_updated_at = now(),
        updated_at = now()
    WHERE id = p_application_id AND status = 'approved'
    RETURNING * INTO updated_application;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An approved merchant application is required to update availability.';
    END IF;
    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id, 'availability_updated', trim(p_actor),
        jsonb_build_object('accepting_orders', p_accepting_orders, 'operating_hours', p_operating_hours, 'timezone', 'Africa/Nairobi')
    );
    RETURN updated_application;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_document_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_type TEXT NOT NULL DEFAULT '*' CHECK (business_type IN (
        '*', 'bar', 'kitchen', 'restaurant', 'food_vendor', 'supplier', 'delivery_partner'
    )),
    county TEXT NOT NULL DEFAULT '*',
    document_type TEXT NOT NULL CHECK (document_type IN (
        'business_registration', 'county_license', 'food_hygiene',
        'tax_document', 'premises_document', 'other_permit'
    )),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 120),
    is_required BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_type, county, document_type)
);

INSERT INTO public.merchant_document_requirements (business_type, county, document_type, label, is_required)
VALUES
    ('*', '*', 'business_registration', 'Business registration', true),
    ('*', '*', 'county_license', 'County business licence', true),
    ('*', '*', 'tax_document', 'Tax / business information', false),
    ('*', '*', 'premises_document', 'Premises documentation', false),
    ('*', '*', 'other_permit', 'Other applicable permit', false),
    ('kitchen', '*', 'food_hygiene', 'Food hygiene documentation', true),
    ('restaurant', '*', 'food_hygiene', 'Food hygiene documentation', true),
    ('food_vendor', '*', 'food_hygiene', 'Food hygiene documentation', true)
ON CONFLICT (business_type, county, document_type) DO NOTHING;

CREATE INDEX IF NOT EXISTS merchant_document_requirements_scope_idx
    ON public.merchant_document_requirements (business_type, county, document_type);

CREATE TABLE IF NOT EXISTS public.merchant_document_requirement_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requirement_id UUID REFERENCES public.merchant_document_requirements(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated')),
    actor TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_application_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 80),
    actor TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_application_events_application_idx
    ON public.merchant_application_events (application_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.assign_merchant_code_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'approved' AND NEW.merchant_code IS NULL THEN
        NEW.merchant_code := 'OB-MER-' || lpad(nextval('public.merchant_code_sequence')::TEXT, 6, '0');
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
        NEW.reviewed_at := now();
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_application_before_update ON public.merchant_applications;
CREATE TRIGGER merchant_application_before_update
    BEFORE UPDATE ON public.merchant_applications
    FOR EACH ROW EXECUTE FUNCTION public.assign_merchant_code_on_approval();

CREATE OR REPLACE FUNCTION public.review_merchant_application(
    p_application_id UUID,
    p_status TEXT,
    p_review_note TEXT,
    p_actor TEXT
)
RETURNS public.merchant_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_application public.merchant_applications;
    current_status TEXT;
BEGIN
    IF p_status NOT IN (
        'under_review', 'information_requested', 'approved',
        'rejected', 'suspended', 'expired'
    ) THEN
        RAISE EXCEPTION 'Unsupported merchant application status.';
    END IF;
    IF p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RAISE EXCEPTION 'Reviewing administrator is required.';
    END IF;
    IF p_status IN ('information_requested', 'rejected', 'suspended', 'expired')
       AND char_length(trim(coalesce(p_review_note, ''))) < 5 THEN
        RAISE EXCEPTION 'A review note of at least 5 characters is required for this status.';
    END IF;

    SELECT status INTO current_status
    FROM public.merchant_applications
    WHERE id = p_application_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant application not found.';
    END IF;

    IF NOT (
        current_status = p_status
        OR (current_status = 'submitted' AND p_status IN ('under_review', 'information_requested', 'approved', 'rejected'))
        OR (current_status = 'under_review' AND p_status IN ('information_requested', 'approved', 'rejected', 'suspended'))
        OR (current_status = 'information_requested' AND p_status IN ('under_review', 'approved', 'rejected'))
        OR (current_status = 'approved' AND p_status IN ('suspended', 'expired'))
        OR (current_status = 'suspended' AND p_status IN ('under_review', 'approved', 'rejected'))
        OR (current_status IN ('rejected', 'expired') AND p_status = 'under_review')
    ) THEN
        RAISE EXCEPTION 'This merchant application status transition is not permitted.';
    END IF;

    IF p_status = 'approved' AND EXISTS (
        SELECT 1
        FROM public.merchant_document_requirements requirement
        WHERE requirement.is_active
          AND requirement.is_required
          AND requirement.id = (
              SELECT candidate.id
              FROM public.merchant_document_requirements candidate
              JOIN public.merchant_applications application ON application.id = p_application_id
              WHERE candidate.document_type = requirement.document_type
                AND candidate.business_type IN ('*', application.business_type)
                AND candidate.county IN ('*', lower(application.county))
              ORDER BY
                (candidate.business_type = application.business_type)::INTEGER * 2
                + (candidate.county = lower(application.county))::INTEGER * 3 DESC
              LIMIT 1
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_applications application
              CROSS JOIN LATERAL jsonb_array_elements(application.documents) document
              WHERE application.id = p_application_id
                AND document->>'type' = requirement.document_type
                AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::DATE >= CURRENT_DATE)
          )
    ) THEN
        RAISE EXCEPTION 'Required compliance documents must be present and current before approval.';
    END IF;

    UPDATE public.merchant_applications
    SET status = p_status,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = p_actor
    WHERE id = p_application_id
    RETURNING * INTO updated_application;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        p_status,
        p_actor,
        jsonb_build_object('previous_status', current_status, 'review_note', updated_application.review_note)
    );

    RETURN updated_application;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    lot_code TEXT NOT NULL CHECK (char_length(lot_code) BETWEEN 1 AND 120),
    supplier_name TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_at DATE,
    quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
    storage_notes TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (application_id, product_id, lot_code)
);
CREATE INDEX IF NOT EXISTS merchant_product_batches_product_idx
    ON public.merchant_product_batches (product_id, lot_code);
CREATE INDEX IF NOT EXISTS merchant_product_batches_expiry_idx
    ON public.merchant_product_batches (expiry_at);

CREATE TABLE IF NOT EXISTS public.merchant_inventory_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES public.merchant_product_batches(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'received', 'allocated', 'returned', 'adjusted', 'wasted', 'recalled'
    )),
    quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
    order_id BIGINT REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_item_id BIGINT REFERENCES public.order_items(id) ON DELETE RESTRICT,
    actor TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_inventory_movements_batch_idx
    ON public.merchant_inventory_movements (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_inventory_movements_order_idx
    ON public.merchant_inventory_movements (order_id);

CREATE TABLE IF NOT EXISTS public.merchant_order_item_trace (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.merchant_product_batches(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_item_id, batch_id)
);
CREATE INDEX IF NOT EXISTS merchant_order_item_trace_batch_idx
    ON public.merchant_order_item_trace (batch_id);

CREATE TABLE IF NOT EXISTS public.merchant_fulfillment_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'accepted', 'rejected', 'preparing', 'ready', 'handed_to_rider',
        'collected', 'delivered', 'cancelled', 'exception'
    )),
    actor TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_fulfillment_events_order_idx
    ON public.merchant_fulfillment_events (order_id, occurred_at);

CREATE OR REPLACE FUNCTION public.validate_merchant_fulfillment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    previous_event TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.merchant_applications a
        WHERE a.id = NEW.application_id AND a.status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Only an approved merchant can record fulfilment events.';
    END IF;
    IF NEW.event_type = 'accepted' AND NOT EXISTS (
        SELECT 1 FROM public.merchant_applications a
        WHERE a.id = NEW.application_id
          AND a.accepting_orders
          AND public.merchant_is_open(a.operating_hours, now())
    ) THEN
        RAISE EXCEPTION 'A merchant must be online and within operating hours to accept a new order.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.merchant_order_item_trace t
        JOIN public.merchant_product_batches b ON b.id = t.batch_id
        JOIN public.order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = NEW.order_id AND b.application_id = NEW.application_id
    ) THEN
        RAISE EXCEPTION 'Fulfilment event must be linked to this merchant through a traced order item.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.order_items item
        WHERE item.order_id = NEW.order_id
          AND item.product_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM public.merchant_product_batches tracked
              WHERE tracked.product_id = item.product_id
          )
          AND (
              SELECT coalesce(sum(trace.quantity), 0)
              FROM public.merchant_order_item_trace trace
              WHERE trace.order_item_id = item.id
          ) < coalesce(item.quantity, 1)
    ) THEN
        RAISE EXCEPTION 'Every tracked product on this order must be assigned to a batch before fulfilment.';
    END IF;
    SELECT event_type INTO previous_event
    FROM public.merchant_fulfillment_events
    WHERE order_id = NEW.order_id
      AND application_id = NEW.application_id
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1;
    IF previous_event IS NULL THEN
        IF NEW.event_type NOT IN ('accepted', 'rejected') THEN
            RAISE EXCEPTION 'The first fulfilment event must accept or reject the order.';
        END IF;
    ELSIF NOT (
        (previous_event = 'accepted' AND NEW.event_type IN ('preparing', 'cancelled', 'exception'))
        OR (previous_event = 'preparing' AND NEW.event_type IN ('ready', 'cancelled', 'exception'))
        OR (previous_event = 'ready' AND NEW.event_type IN ('handed_to_rider', 'collected', 'cancelled', 'exception'))
        OR (previous_event = 'handed_to_rider' AND NEW.event_type IN ('delivered', 'exception'))
        OR (previous_event = 'collected' AND NEW.event_type = 'delivered')
        OR (previous_event = 'exception' AND NEW.event_type IN ('preparing', 'ready', 'cancelled'))
    ) THEN
        RAISE EXCEPTION 'This fulfilment event transition is not permitted.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fulfillment_event_guard ON public.merchant_fulfillment_events;
CREATE TRIGGER merchant_fulfillment_event_guard
    BEFORE INSERT OR UPDATE ON public.merchant_fulfillment_events
    FOR EACH ROW EXECUTE FUNCTION public.validate_merchant_fulfillment_event();

CREATE OR REPLACE FUNCTION public.reject_merchant_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Merchant operational ledger rows are append-only.';
END;
$$;

DROP TRIGGER IF EXISTS merchant_fulfillment_events_immutable ON public.merchant_fulfillment_events;
CREATE TRIGGER merchant_fulfillment_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_fulfillment_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

CREATE TABLE IF NOT EXISTS public.merchant_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_code TEXT NOT NULL UNIQUE DEFAULT (
        'INC-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10))
    ),
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES public.merchant_product_batches(id) ON DELETE RESTRICT,
    category TEXT NOT NULL CHECK (category IN (
        'product_quality', 'food_safety', 'delivery', 'conduct', 'other'
    )),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
    status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN (
        'reported', 'triaged', 'investigating', 'action_required', 'resolved', 'closed'
    )),
    severity TEXT NOT NULL DEFAULT 'unassessed' CHECK (severity IN (
        'unassessed', 'low', 'medium', 'high', 'critical'
    )),
    reporter_contact TEXT,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    assigned_to TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS merchant_incidents_status_created_idx
    ON public.merchant_incidents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_incidents_batch_idx
    ON public.merchant_incidents (batch_id);
CREATE INDEX IF NOT EXISTS merchant_incidents_order_idx
    ON public.merchant_incidents (order_id);

CREATE TABLE IF NOT EXISTS public.customer_order_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_item_id BIGINT REFERENCES public.order_items(id) ON DELETE RESTRICT,
    customer_user_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'product_quality', 'food_safety', 'missing_item', 'wrong_item', 'delivery', 'other'
    )),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_order_complaints_order_created_idx
    ON public.customer_order_complaints (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_order_complaints_item_idx
    ON public.customer_order_complaints (order_item_id);

CREATE OR REPLACE FUNCTION public.validate_customer_order_complaint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Customer complaint records are append-only.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.orders order_record
        WHERE order_record.id = NEW.order_id
          AND order_record.user_id = NEW.customer_user_id
          AND order_record.status IN ('Delivered', 'Completed')
    ) THEN
        RAISE EXCEPTION 'A delivered order belonging to the reporting customer is required.';
    END IF;
    IF NEW.order_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.order_items item
        WHERE item.id = NEW.order_item_id AND item.order_id = NEW.order_id
    ) THEN
        RAISE EXCEPTION 'The reported item must belong to the reported order.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_order_complaint_guard ON public.customer_order_complaints;
CREATE TRIGGER customer_order_complaint_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.customer_order_complaints
    FOR EACH ROW EXECUTE FUNCTION public.validate_customer_order_complaint();

CREATE OR REPLACE FUNCTION public.validate_merchant_incident_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_incident_status TEXT;
BEGIN
    IF NEW.status IN ('resolved', 'closed')
       AND char_length(trim(coalesce(NEW.resolution_note, ''))) < 5 THEN
        RAISE EXCEPTION 'A resolution note of at least 5 characters is required to close an incident.';
    END IF;
    IF NEW.batch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.merchant_product_batches b
        WHERE b.id = NEW.batch_id AND b.application_id = NEW.application_id
    ) THEN
        RAISE EXCEPTION 'Incident batch must belong to the selected merchant.';
    END IF;
    IF NEW.order_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.merchant_fulfillment_events f
        WHERE f.order_id = NEW.order_id AND f.application_id = NEW.application_id
        UNION ALL
        SELECT 1
        FROM public.merchant_order_item_trace t
        JOIN public.merchant_product_batches b ON b.id = t.batch_id
        JOIN public.order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = NEW.order_id AND b.application_id = NEW.application_id
    ) THEN
        RAISE EXCEPTION 'Incident order must be linked to this merchant through fulfilment or batch trace.';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        current_incident_status := OLD.status;
        IF NOT (
            (current_incident_status = 'reported' AND NEW.status = 'triaged')
            OR (current_incident_status = 'triaged' AND NEW.status IN ('investigating', 'action_required'))
            OR (current_incident_status = 'investigating' AND NEW.status IN ('action_required', 'resolved'))
            OR (current_incident_status = 'action_required' AND NEW.status IN ('investigating', 'resolved'))
            OR (current_incident_status = 'resolved' AND NEW.status IN ('investigating', 'closed'))
        ) THEN
            RAISE EXCEPTION 'This incident status transition is not permitted.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_incident_link_guard ON public.merchant_incidents;
CREATE TRIGGER merchant_incident_link_guard
    BEFORE INSERT OR UPDATE ON public.merchant_incidents
    FOR EACH ROW EXECUTE FUNCTION public.validate_merchant_incident_links();

CREATE TABLE IF NOT EXISTS public.merchant_incident_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES public.merchant_incidents(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_incident_events_incident_idx
    ON public.merchant_incident_events (incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_batch_holds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES public.merchant_product_batches(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 2000),
    placed_by TEXT NOT NULL,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_by TEXT,
    released_at TIMESTAMPTZ,
    release_note TEXT,
    CHECK (
        (released_at IS NULL AND released_by IS NULL)
        OR (released_at IS NOT NULL AND released_by IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_batch_holds_active_idx
    ON public.merchant_batch_holds (batch_id)
    WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS merchant_batch_holds_batch_idx
    ON public.merchant_batch_holds (batch_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_batch_hold_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hold_id BIGINT NOT NULL REFERENCES public.merchant_batch_holds(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('placed', 'released')),
    actor TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_batch_hold_events_hold_idx
    ON public.merchant_batch_hold_events (hold_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_trace_access_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor TEXT NOT NULL,
    query_type TEXT NOT NULL CHECK (query_type IN ('order', 'batch')),
    query_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_trace_access_events_created_idx
    ON public.merchant_trace_access_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_merchant_incident_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.merchant_incident_events (incident_id, event_type, actor, details)
        VALUES (NEW.id, 'reported', NEW.created_by, jsonb_build_object('status', NEW.status));
        RETURN NULL;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.resolution_note IS DISTINCT FROM OLD.resolution_note THEN
        INSERT INTO public.merchant_incident_events (incident_id, event_type, actor, details)
        VALUES (
            NEW.id,
            NEW.status,
            coalesce(NEW.updated_by, NEW.created_by),
            jsonb_build_object('previous_status', OLD.status, 'resolution_note', NEW.resolution_note)
        );
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS merchant_incident_audit_trigger ON public.merchant_incidents;
CREATE TRIGGER merchant_incident_audit_trigger
    AFTER INSERT OR UPDATE ON public.merchant_incidents
    FOR EACH ROW EXECUTE FUNCTION public.audit_merchant_incident_change();

CREATE OR REPLACE FUNCTION public.protect_merchant_batch_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.placed_by IS DISTINCT FROM OLD.placed_by
       OR NEW.placed_at IS DISTINCT FROM OLD.placed_at
       OR OLD.released_at IS NOT NULL
       OR NEW.released_at IS NULL
       OR NEW.released_by IS NULL
       OR char_length(trim(coalesce(NEW.release_note, ''))) < 5 THEN
        RAISE EXCEPTION 'A batch hold can only be released once without changing its history.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_merchant_batch_hold_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.merchant_batch_hold_events (hold_id, event_type, actor, details)
        VALUES (NEW.id, 'placed', NEW.placed_by, jsonb_build_object('reason', NEW.reason));
    ELSE
        INSERT INTO public.merchant_batch_hold_events (hold_id, event_type, actor, details)
        VALUES (NEW.id, 'released', NEW.released_by, jsonb_build_object('release_note', NEW.release_note));
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS merchant_batch_hold_protection_trigger ON public.merchant_batch_holds;
CREATE TRIGGER merchant_batch_hold_protection_trigger
    BEFORE INSERT OR UPDATE ON public.merchant_batch_holds
    FOR EACH ROW EXECUTE FUNCTION public.protect_merchant_batch_hold();

DROP TRIGGER IF EXISTS merchant_batch_hold_audit_trigger ON public.merchant_batch_holds;
CREATE TRIGGER merchant_batch_hold_audit_trigger
    AFTER INSERT OR UPDATE ON public.merchant_batch_holds
    FOR EACH ROW EXECUTE FUNCTION public.audit_merchant_batch_hold_change();

CREATE OR REPLACE FUNCTION public.prevent_held_batch_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    batch_expiry DATE;
    batch_product BIGINT;
    quantity_received INTEGER;
    application_status TEXT;
    application_accepting BOOLEAN;
    application_open BOOLEAN;
    order_product BIGINT;
    order_quantity INTEGER;
    parent_order_id BIGINT;
    parent_order public.orders%ROWTYPE;
    has_payment_proof BOOLEAN := false;
    application_latitude NUMERIC;
    application_longitude NUMERIC;
    application_radius NUMERIC;
    already_traced INTEGER;
    available_quantity INTEGER;
BEGIN
    SELECT b.expiry_at, b.product_id, b.quantity_received, a.status,
           a.accepting_orders, public.merchant_is_open(a.operating_hours, now())
    INTO batch_expiry, batch_product, quantity_received, application_status,
         application_accepting, application_open
    FROM public.merchant_product_batches b
    JOIN public.merchant_applications a ON a.id = b.application_id
    WHERE b.id = NEW.batch_id
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant batch does not exist.';
    END IF;
    SELECT product_id, quantity, order_id
    INTO order_product, order_quantity, parent_order_id
    FROM public.order_items
    WHERE id = NEW.order_item_id;
    IF NOT FOUND OR order_product IS DISTINCT FROM batch_product THEN
        RAISE EXCEPTION 'Batch product must match the traced order item.';
    END IF;
    SELECT * INTO parent_order
    FROM public.orders
    WHERE id = parent_order_id;
    IF NOT FOUND
       OR lower(coalesce(parent_order.status, '')) <> 'paid'
       OR parent_order.payment_verified_at IS NULL
       OR lower(coalesce(parent_order.payment_method, '')) NOT IN ('paystack', 'payhero')
       OR parent_order.latitude IS NULL
       OR parent_order.longitude IS NULL
       OR to_regclass('public.payment_confirmations') IS NULL THEN
        RAISE EXCEPTION 'Merchant inventory can only be allocated to a Paystack order with confirmed payment and delivery coordinates.';
    END IF;
    EXECUTE
        'SELECT EXISTS (
            SELECT 1 FROM public.payment_confirmations confirmation
            WHERE confirmation.order_id = $1
              AND confirmation.provider = CASE
                  WHEN lower($4) = ''payhero'' THEN ''PayHero''
                  ELSE ''Paystack''
              END
              AND confirmation.reference = $2
              AND confirmation.amount_kobo = round($3 * 100)::BIGINT
              AND confirmation.currency = ''KES''
        )'
    INTO has_payment_proof
    USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price, parent_order.payment_method;
    IF NOT has_payment_proof THEN
        RAISE EXCEPTION 'Server-verified payment proof is required before merchant stock can be allocated.';
    END IF;
    SELECT latitude, longitude, delivery_radius_km
    INTO application_latitude, application_longitude, application_radius
    FROM public.merchant_applications
    WHERE id = (SELECT application_id FROM public.merchant_product_batches WHERE id = NEW.batch_id);
    IF application_latitude IS NULL
       OR application_longitude IS NULL
       OR application_radius IS NULL THEN
        RAISE EXCEPTION 'Merchant coordinates and delivery radius are required before allocation.';
    END IF;
    IF 6371 * 2 * asin(sqrt(
        power(sin(radians(application_latitude - parent_order.latitude) / 2), 2)
        + cos(radians(parent_order.latitude)) * cos(radians(application_latitude))
        * power(sin(radians(application_longitude - parent_order.longitude) / 2), 2)
    )) > application_radius THEN
        RAISE EXCEPTION 'Merchant is outside its configured delivery radius for this order.';
    END IF;
    SELECT coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0)::INTEGER
    INTO already_traced
    FROM public.merchant_order_item_trace trace
    LEFT JOIN LATERAL (
        SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
        FROM public.merchant_inventory_movements movement
        WHERE movement.batch_id = trace.batch_id
          AND movement.order_item_id = trace.order_item_id
          AND movement.movement_type = 'returned'
          AND movement.note = 'Returned for offline merchant redistribution'
    ) returned ON true
    WHERE trace.order_item_id = NEW.order_item_id
      AND (TG_OP <> 'UPDATE' OR trace.id <> NEW.id);
    IF already_traced + NEW.quantity > coalesce(order_quantity, 1) THEN
        RAISE EXCEPTION 'Batch trace quantity cannot exceed the order item quantity.';
    END IF;
    IF application_status <> 'approved' THEN
        RAISE EXCEPTION 'Only an approved merchant can fulfil an order.';
    END IF;
    IF NOT coalesce(application_accepting, false) OR NOT coalesce(application_open, false) THEN
        RAISE EXCEPTION 'Merchant is offline or outside operating hours and cannot receive a new order allocation.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.merchant_product_batches batch
        JOIN public.merchant_fulfillment_events event
          ON event.application_id = batch.application_id
        WHERE batch.id = NEW.batch_id
          AND event.order_id = parent_order.id
          AND event.event_type = 'rejected'
    ) THEN
        RAISE EXCEPTION 'A merchant that rejected this order cannot receive another allocation for it.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.merchant_document_requirements requirement
        WHERE requirement.is_active
          AND requirement.is_required
          AND requirement.id = (
              SELECT candidate.id
              FROM public.merchant_document_requirements candidate
              JOIN public.merchant_product_batches batch ON batch.id = NEW.batch_id
              JOIN public.merchant_applications application ON application.id = batch.application_id
              WHERE candidate.document_type = requirement.document_type
                AND candidate.business_type IN ('*', application.business_type)
                AND candidate.county IN ('*', lower(application.county))
              ORDER BY
                (candidate.business_type = application.business_type)::INTEGER * 2
                + (candidate.county = lower(application.county))::INTEGER * 3 DESC
              LIMIT 1
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_product_batches batch
              JOIN public.merchant_applications application ON application.id = batch.application_id
              CROSS JOIN LATERAL jsonb_array_elements(application.documents) document
              WHERE batch.id = NEW.batch_id
                AND document->>'type' = requirement.document_type
                AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::DATE >= CURRENT_DATE)
          )
    ) THEN
        RAISE EXCEPTION 'Merchant has an expired or missing required compliance document.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.merchant_batch_holds
        WHERE batch_id = NEW.batch_id AND released_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Batch is on hold and cannot be allocated.';
    END IF;
    IF batch_expiry IS NOT NULL AND batch_expiry < CURRENT_DATE THEN
        RAISE EXCEPTION 'Expired batch cannot be allocated.';
    END IF;
    SELECT coalesce(sum(quantity_delta), 0)::INTEGER
    INTO available_quantity
    FROM public.merchant_inventory_movements
    WHERE batch_id = NEW.batch_id;
    IF available_quantity < NEW.quantity THEN
        RAISE EXCEPTION 'Batch does not have enough available inventory.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_order_trace_allocation_guard ON public.merchant_order_item_trace;
CREATE TRIGGER merchant_order_trace_allocation_guard
    BEFORE INSERT OR UPDATE ON public.merchant_order_item_trace
    FOR EACH ROW EXECUTE FUNCTION public.prevent_held_batch_allocation();

CREATE OR REPLACE FUNCTION public.log_merchant_batch_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_order_id BIGINT;
BEGIN
    SELECT order_id INTO parent_order_id
    FROM public.order_items
    WHERE id = NEW.order_item_id;
    INSERT INTO public.merchant_inventory_movements (
        batch_id, movement_type, quantity_delta, order_id, order_item_id, actor, note
    )
    VALUES (
        NEW.batch_id, 'allocated', -NEW.quantity, parent_order_id, NEW.order_item_id,
        NEW.created_by, 'Allocated to traced order item'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_order_trace_ledger_entry ON public.merchant_order_item_trace;
CREATE TRIGGER merchant_order_trace_ledger_entry
    AFTER INSERT ON public.merchant_order_item_trace
    FOR EACH ROW EXECUTE FUNCTION public.log_merchant_batch_allocation();

CREATE OR REPLACE FUNCTION public.allocate_tracked_product_on_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_order public.orders%ROWTYPE;
    has_payment_proof BOOLEAN := false;
    remaining_quantity INTEGER := coalesce(NEW.quantity, 1);
    batch_record RECORD;
    available_quantity INTEGER;
    allocation_quantity INTEGER;
    has_tracked_batches BOOLEAN;
BEGIN
    IF NEW.product_id IS NULL OR remaining_quantity < 1 THEN
        RETURN NEW;
    END IF;

    SELECT orders.*
    INTO parent_order
    FROM public.orders orders
    WHERE orders.id = NEW.order_id;

    IF NOT FOUND
       OR lower(coalesce(parent_order.status, '')) <> 'paid'
       OR parent_order.payment_verified_at IS NULL
       OR lower(coalesce(parent_order.payment_method, '')) NOT IN ('paystack', 'payhero')
       OR to_regclass('public.payment_confirmations') IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE
        'SELECT EXISTS (
            SELECT 1
            FROM public.payment_confirmations confirmation
            WHERE confirmation.order_id = $1
              AND confirmation.provider = CASE
                  WHEN lower($4) = ''payhero'' THEN ''PayHero''
                  ELSE ''Paystack''
              END
              AND confirmation.reference = $2
              AND confirmation.amount_kobo = round($3 * 100)::BIGINT
              AND confirmation.currency = ''KES''
        )'
    INTO has_payment_proof
    USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price, parent_order.payment_method;

    IF NOT has_payment_proof OR parent_order.latitude IS NULL OR parent_order.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT greatest(
        coalesce(NEW.quantity, 1)
        - coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0),
        0
    )::INTEGER
    INTO remaining_quantity
    FROM public.merchant_order_item_trace trace
    JOIN public.merchant_product_batches traced_batch ON traced_batch.id = trace.batch_id
    JOIN public.merchant_applications traced_merchant ON traced_merchant.id = traced_batch.application_id
    LEFT JOIN LATERAL (
        SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
        FROM public.merchant_inventory_movements movement
        WHERE movement.batch_id = trace.batch_id
          AND movement.order_item_id = trace.order_item_id
          AND movement.movement_type = 'returned'
          AND movement.note = 'Returned for offline merchant redistribution'
    ) returned ON true
    WHERE trace.order_item_id = NEW.id
      AND traced_merchant.status = 'approved'
      AND (traced_batch.expiry_at IS NULL OR traced_batch.expiry_at >= CURRENT_DATE)
      AND NOT EXISTS (
          SELECT 1 FROM public.merchant_batch_holds hold
          WHERE hold.batch_id = traced_batch.id AND hold.released_at IS NULL
      )
      AND (
          (
              traced_merchant.accepting_orders
              AND public.merchant_is_open(traced_merchant.operating_hours, now())
              AND NOT EXISTS (
                  SELECT 1 FROM public.merchant_fulfillment_events rejected
                  WHERE rejected.order_id = parent_order.id
                    AND rejected.application_id = traced_merchant.id
                    AND rejected.event_type = 'rejected'
              )
          )
          OR EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events accepted
              WHERE accepted.order_id = parent_order.id
                AND accepted.application_id = traced_merchant.id
                AND accepted.event_type = 'accepted'
          )
      );
    IF remaining_quantity <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_product_batches
        WHERE product_id = NEW.product_id
    ) INTO has_tracked_batches;
    IF NOT has_tracked_batches THEN
        RETURN NEW;
    END IF;

    FOR batch_record IN
        SELECT b.id, b.expiry_at, b.received_at
        FROM public.merchant_product_batches b
        JOIN public.merchant_applications application ON application.id = b.application_id
        JOIN public.orders order_header ON order_header.id = NEW.order_id
        WHERE b.product_id = NEW.product_id
          AND application.status = 'approved'
          AND application.accepting_orders
          AND public.merchant_is_open(application.operating_hours, now())
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events rejected
              WHERE rejected.order_id = parent_order.id
                AND rejected.application_id = application.id
                AND rejected.event_type = 'rejected'
          )
          AND application.latitude IS NOT NULL
          AND application.longitude IS NOT NULL
          AND application.delivery_radius_km IS NOT NULL
          AND 6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - order_header.latitude) / 2), 2)
              + cos(radians(order_header.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - order_header.longitude) / 2), 2)
          )) <= application.delivery_radius_km
          AND (b.expiry_at IS NULL OR b.expiry_at >= CURRENT_DATE)
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_batch_holds hold
              WHERE hold.batch_id = b.id AND hold.released_at IS NULL
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_document_requirements requirement
              WHERE requirement.is_active
                AND requirement.is_required
                AND requirement.id = (
                    SELECT candidate.id
                    FROM public.merchant_document_requirements candidate
                    WHERE candidate.document_type = requirement.document_type
                      AND candidate.business_type IN ('*', application.business_type)
                      AND candidate.county IN ('*', lower(application.county))
                    ORDER BY
                      (candidate.business_type = application.business_type)::INTEGER * 2
                      + (candidate.county = lower(application.county))::INTEGER * 3 DESC
                    LIMIT 1
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(application.documents) document
                    WHERE document->>'type' = requirement.document_type
                      AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::DATE >= CURRENT_DATE)
                )
          )
        ORDER BY
          6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - order_header.latitude) / 2), 2)
              + cos(radians(order_header.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - order_header.longitude) / 2), 2)
          )),
          b.expiry_at NULLS LAST,
          b.received_at,
          b.id
        FOR UPDATE OF b
    LOOP
        SELECT coalesce(sum(quantity_delta), 0)::INTEGER
        INTO available_quantity
        FROM public.merchant_inventory_movements
        WHERE batch_id = batch_record.id;

        IF available_quantity <= 0 THEN
            CONTINUE;
        END IF;
        allocation_quantity := least(remaining_quantity, available_quantity);
        INSERT INTO public.merchant_order_item_trace (
            order_item_id, batch_id, quantity, created_by
        )
        VALUES (
            NEW.id, batch_record.id, allocation_quantity, 'checkout'
        );
        remaining_quantity := remaining_quantity - allocation_quantity;
        EXIT WHEN remaining_quantity = 0;
    END LOOP;

    IF remaining_quantity > 0 THEN
        RAISE EXCEPTION 'Insufficient available merchant batch inventory for product %.', NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_auto_allocate_order_item ON public.order_items;
CREATE TRIGGER merchant_auto_allocate_order_item
    AFTER INSERT OR UPDATE OF quantity ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.allocate_tracked_product_on_order_item();

CREATE OR REPLACE FUNCTION public.receive_merchant_product_batch(
    p_application_id UUID,
    p_product_id BIGINT,
    p_lot_code TEXT,
    p_supplier_name TEXT,
    p_expiry_at DATE,
    p_quantity INTEGER,
    p_storage_notes TEXT,
    p_actor TEXT
)
RETURNS public.merchant_product_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    received_batch public.merchant_product_batches;
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000000 THEN
        RAISE EXCEPTION 'Received quantity must be between 1 and 1000000.';
    END IF;
    IF p_lot_code IS NULL OR char_length(trim(p_lot_code)) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'A lot code is required.';
    END IF;
    IF p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RAISE EXCEPTION 'A receiving administrator is required.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.merchant_applications
        WHERE id = p_application_id AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Only an approved merchant can receive tracked inventory.';
    END IF;

    INSERT INTO public.merchant_product_batches (
        application_id, product_id, lot_code, supplier_name, expiry_at,
        quantity_received, storage_notes, created_by
    )
    VALUES (
        p_application_id, p_product_id, trim(p_lot_code),
        nullif(trim(coalesce(p_supplier_name, '')), ''), p_expiry_at,
        p_quantity, nullif(trim(coalesce(p_storage_notes, '')), ''), p_actor
    )
    RETURNING * INTO received_batch;

    INSERT INTO public.merchant_inventory_movements (
        batch_id, movement_type, quantity_delta, actor, note
    )
    VALUES (
        received_batch.id, 'received', p_quantity, p_actor, 'Initial batch receipt'
    );
    RETURN received_batch;
END;
$$;

DROP TRIGGER IF EXISTS merchant_order_trace_immutable ON public.merchant_order_item_trace;
CREATE TRIGGER merchant_order_trace_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_order_item_trace
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_inventory_movements_immutable ON public.merchant_inventory_movements;
CREATE TRIGGER merchant_inventory_movements_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_inventory_movements
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_application_events_immutable ON public.merchant_application_events;
CREATE TRIGGER merchant_application_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_application_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_document_requirement_events_immutable ON public.merchant_document_requirement_events;
CREATE TRIGGER merchant_document_requirement_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_document_requirement_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_incident_events_immutable ON public.merchant_incident_events;
CREATE TRIGGER merchant_incident_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_incident_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_batch_hold_events_immutable ON public.merchant_batch_hold_events;
CREATE TRIGGER merchant_batch_hold_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_batch_hold_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

DROP TRIGGER IF EXISTS merchant_trace_access_events_immutable ON public.merchant_trace_access_events;
CREATE TRIGGER merchant_trace_access_events_immutable
    BEFORE UPDATE OR DELETE ON public.merchant_trace_access_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_merchant_ledger_mutation();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'merchant-application-documents',
    'merchant-application-documents',
    false,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'merchant_application_documents_are_private'
    ) THEN
        CREATE POLICY merchant_application_documents_are_private
            ON storage.objects AS RESTRICTIVE
            FOR ALL TO anon, authenticated
            USING (bucket_id <> 'merchant-application-documents')
            WITH CHECK (bucket_id <> 'merchant-application-documents');
    END IF;
END;
$$;

ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_document_requirement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_order_item_trace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_order_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_batch_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_batch_hold_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_trace_access_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.merchant_applications,
    public.merchant_document_requirements,
    public.merchant_document_requirement_events,
    public.merchant_application_events,
    public.merchant_product_batches,
    public.merchant_inventory_movements,
    public.merchant_order_item_trace,
    public.merchant_fulfillment_events,
    public.merchant_incidents,
    public.customer_order_complaints,
    public.merchant_incident_events,
    public.merchant_batch_holds,
    public.merchant_batch_hold_events,
    public.merchant_trace_access_events
FROM anon, authenticated;

GRANT ALL ON public.merchant_applications,
    public.merchant_document_requirements,
    public.merchant_document_requirement_events,
    public.merchant_application_events,
    public.merchant_product_batches,
    public.merchant_inventory_movements,
    public.merchant_order_item_trace,
    public.merchant_fulfillment_events,
    public.merchant_incidents,
    public.merchant_incident_events,
    public.merchant_batch_holds,
    public.merchant_batch_hold_events,
    public.merchant_trace_access_events
TO service_role;
GRANT SELECT, INSERT ON public.customer_order_complaints TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_code_sequence TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_application_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_document_requirement_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_inventory_movements_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_order_item_trace_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_fulfillment_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_batch_holds_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_incident_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_batch_hold_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_trace_access_events_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.review_merchant_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_merchant_application(UUID, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.update_merchant_availability(UUID, JSONB, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_availability(UUID, JSONB, BOOLEAN, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.receive_merchant_product_batch(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_merchant_product_batch(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT) TO service_role;

-- ===== DISPATCH_MIGRATION.sql =====
-- Payment-confirmed order dispatch with auditable rider selection decisions.
-- Run after the core and merchant operations schemas.

DO $$
BEGIN
    IF to_regclass('public.orders') IS NULL OR to_regclass('public.order_items') IS NULL THEN
        RAISE EXCEPTION 'Dispatch migration requires public.orders and public.order_items.'
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql first.';
    END IF;
    IF to_regclass('public.merchant_order_item_trace') IS NULL
       OR to_regclass('public.merchant_product_batches') IS NULL
       OR to_regclass('public.merchant_fulfillment_events') IS NULL THEN
        RAISE EXCEPTION 'Dispatch migration requires merchant traceability tables.'
            USING HINT = 'Run supabase/MERCHANT_OPERATIONS_MIGRATION.sql first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rider_status (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    rider_name TEXT NOT NULL,
    rider_phone TEXT UNIQUE NOT NULL,
    vehicle_type TEXT DEFAULT 'Motorbike',
    vehicle_reg TEXT,
    pin TEXT DEFAULT '1234',
    current_location TEXT,
    status TEXT NOT NULL DEFAULT 'Offline',
    battery_level INTEGER NOT NULL DEFAULT 100,
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    rating NUMERIC NOT NULL DEFAULT 5,
    area_zone TEXT DEFAULT 'Nairobi',
    health_score INTEGER NOT NULL DEFAULT 100,
    current_tier TEXT DEFAULT 'Bronze',
    acceptance_rate INTEGER NOT NULL DEFAULT 100,
    online_since TIMESTAMPTZ,
    biometric_key JSONB,
    verification_status TEXT NOT NULL DEFAULT 'Pending',
    last_known_lat NUMERIC,
    last_known_lng NUMERIC,
    location_updated_at TIMESTAMPTZ,
    max_deliveries INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_status
    ADD COLUMN IF NOT EXISTS last_known_lat NUMERIC,
    ADD COLUMN IF NOT EXISTS last_known_lng NUMERIC,
    ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS max_deliveries INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS latitude NUMERIC,
    ADD COLUMN IF NOT EXISTS longitude NUMERIC;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'merchant_applications_coordinates_check'
          AND conrelid = 'public.merchant_applications'::regclass
    ) THEN
        ALTER TABLE public.merchant_applications
            ADD CONSTRAINT merchant_applications_coordinates_check CHECK (
                (latitude IS NULL AND longitude IS NULL)
                OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_tracked_product_on_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent_order public.orders%ROWTYPE;
    has_payment_proof BOOLEAN := false;
    remaining_quantity INTEGER := coalesce(NEW.quantity, 1);
    batch_record RECORD;
    available_quantity INTEGER;
    allocation_quantity INTEGER;
    has_tracked_batches BOOLEAN;
BEGIN
    IF NEW.product_id IS NULL OR remaining_quantity < 1 THEN
        RETURN NEW;
    END IF;

    SELECT orders.* INTO parent_order
    FROM public.orders orders
    WHERE orders.id = NEW.order_id;

    IF NOT FOUND
       OR lower(coalesce(parent_order.status, '')) <> 'paid'
       OR parent_order.payment_verified_at IS NULL
       OR lower(coalesce(parent_order.payment_method, '')) NOT IN ('paystack', 'payhero')
       OR parent_order.latitude IS NULL
       OR parent_order.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE
        'SELECT EXISTS (
            SELECT 1
            FROM public.payment_confirmations confirmation
            WHERE confirmation.order_id = $1
              AND confirmation.provider = CASE
                  WHEN lower($4) = ''payhero'' THEN ''PayHero''
                  ELSE ''Paystack''
              END
              AND confirmation.reference = $2
              AND confirmation.amount_kobo = round($3 * 100)::BIGINT
              AND confirmation.currency = ''KES''
        )'
    INTO has_payment_proof
    USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price, parent_order.payment_method;

    IF NOT has_payment_proof THEN
        RETURN NEW;
    END IF;

    SELECT greatest(
        coalesce(NEW.quantity, 1)
        - coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0),
        0
    )::INTEGER
    INTO remaining_quantity
    FROM public.merchant_order_item_trace trace
    JOIN public.merchant_product_batches traced_batch ON traced_batch.id = trace.batch_id
    JOIN public.merchant_applications traced_merchant ON traced_merchant.id = traced_batch.application_id
    LEFT JOIN LATERAL (
        SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
        FROM public.merchant_inventory_movements movement
        WHERE movement.batch_id = trace.batch_id
          AND movement.order_item_id = trace.order_item_id
          AND movement.movement_type = 'returned'
          AND movement.note = 'Returned for offline merchant redistribution'
    ) returned ON true
    WHERE trace.order_item_id = NEW.id
      AND traced_merchant.status = 'approved'
      AND (traced_batch.expiry_at IS NULL OR traced_batch.expiry_at >= CURRENT_DATE)
      AND NOT EXISTS (
          SELECT 1 FROM public.merchant_batch_holds hold
          WHERE hold.batch_id = traced_batch.id AND hold.released_at IS NULL
      )
      AND (
          (
              traced_merchant.accepting_orders
              AND public.merchant_is_open(traced_merchant.operating_hours, now())
              AND NOT EXISTS (
                  SELECT 1 FROM public.merchant_fulfillment_events rejected
                  WHERE rejected.order_id = parent_order.id
                    AND rejected.application_id = traced_merchant.id
                    AND rejected.event_type = 'rejected'
              )
          )
          OR EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events accepted
              WHERE accepted.order_id = parent_order.id
                AND accepted.application_id = traced_merchant.id
                AND accepted.event_type = 'accepted'
          )
      );
    IF remaining_quantity <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_product_batches
        WHERE product_id = NEW.product_id
    ) INTO has_tracked_batches;
    IF NOT has_tracked_batches THEN
        RETURN NEW;
    END IF;

    FOR batch_record IN
        SELECT b.id, b.expiry_at, b.received_at
        FROM public.merchant_product_batches b
        JOIN public.merchant_applications application ON application.id = b.application_id
        WHERE b.product_id = NEW.product_id
          AND application.status = 'approved'
          AND application.accepting_orders
          AND public.merchant_is_open(application.operating_hours, now())
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events rejected
              WHERE rejected.order_id = parent_order.id
                AND rejected.application_id = application.id
                AND rejected.event_type = 'rejected'
          )
          AND application.latitude IS NOT NULL
          AND application.longitude IS NOT NULL
          AND application.delivery_radius_km IS NOT NULL
          AND 6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - parent_order.latitude) / 2), 2)
              + cos(radians(parent_order.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - parent_order.longitude) / 2), 2)
          )) <= application.delivery_radius_km
          AND (b.expiry_at IS NULL OR b.expiry_at >= CURRENT_DATE)
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_batch_holds hold
              WHERE hold.batch_id = b.id AND hold.released_at IS NULL
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.merchant_document_requirements requirement
              WHERE requirement.is_active
                AND requirement.is_required
                AND requirement.id = (
                    SELECT candidate.id
                    FROM public.merchant_document_requirements candidate
                    WHERE candidate.document_type = requirement.document_type
                      AND candidate.business_type IN ('*', application.business_type)
                      AND candidate.county IN ('*', lower(application.county))
                    ORDER BY
                      (candidate.business_type = application.business_type)::INTEGER * 2
                      + (candidate.county = lower(application.county))::INTEGER * 3 DESC
                    LIMIT 1
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(application.documents) document
                    WHERE document->>'type' = requirement.document_type
                      AND (document->>'expiresAt' IS NULL OR (document->>'expiresAt')::DATE >= CURRENT_DATE)
                )
          )
        ORDER BY
          6371 * 2 * asin(sqrt(
              power(sin(radians(application.latitude - parent_order.latitude) / 2), 2)
              + cos(radians(parent_order.latitude)) * cos(radians(application.latitude))
              * power(sin(radians(application.longitude - parent_order.longitude) / 2), 2)
          )),
          b.expiry_at NULLS LAST,
          b.received_at,
          b.id
        FOR UPDATE OF b
    LOOP
        SELECT coalesce(sum(quantity_delta), 0)::INTEGER
        INTO available_quantity
        FROM public.merchant_inventory_movements
        WHERE batch_id = batch_record.id;

        IF available_quantity <= 0 THEN
            CONTINUE;
        END IF;
        allocation_quantity := least(remaining_quantity, available_quantity);
        INSERT INTO public.merchant_order_item_trace (
            order_item_id, batch_id, quantity, created_by
        ) VALUES (
            NEW.id, batch_record.id, allocation_quantity, 'payment-confirmed dispatch'
        );
        remaining_quantity := remaining_quantity - allocation_quantity;
        EXIT WHEN remaining_quantity = 0;
    END LOOP;

    IF remaining_quantity > 0 THEN
        RAISE EXCEPTION 'Insufficient in-range merchant stock for paid order item %.', NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_auto_allocate_order_item ON public.order_items;
CREATE TRIGGER merchant_auto_allocate_order_item
    AFTER INSERT OR UPDATE OF quantity ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.allocate_tracked_product_on_order_item();

CREATE OR REPLACE FUNCTION public.allocate_paid_order_items_after_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    item_record RECORD;
BEGIN
    IF lower(coalesce(NEW.status, '')) <> 'paid'
       OR NEW.payment_verified_at IS NULL
       OR lower(coalesce(NEW.payment_method, '')) NOT IN ('paystack', 'payhero')
       OR (
           OLD.status IS NOT DISTINCT FROM NEW.status
           AND OLD.payment_verified_at IS NOT DISTINCT FROM NEW.payment_verified_at
       ) THEN
        RETURN NEW;
    END IF;

    FOR item_record IN
        SELECT id, quantity
        FROM public.order_items
        WHERE order_id = NEW.id
        ORDER BY id
    LOOP
        BEGIN
            UPDATE public.order_items
            SET quantity = item_record.quantity
            WHERE id = item_record.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Merchant allocation for paid order item % was not completed: %',
                item_record.id, SQLERRM;
        END;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_allocate_paid_order_items ON public.orders;
CREATE TRIGGER merchant_allocate_paid_order_items
    AFTER UPDATE OF status, payment_verified_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.allocate_paid_order_items_after_confirmation();

CREATE TABLE IF NOT EXISTS public.dispatch_decisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    selected_rider_phone TEXT,
    selected_rider_name TEXT,
    selected_vendor_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    decision_type TEXT NOT NULL CHECK (decision_type IN ('recommended', 'admin_override')),
    criteria JSONB NOT NULL DEFAULT '{}'::JSONB,
    chosen_by TEXT NOT NULL,
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_decisions_order_created_idx
    ON public.dispatch_decisions (order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_merchant_dispatch_location(
    p_application_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_actor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (p_latitude IS NULL) <> (p_longitude IS NULL)
       OR (p_latitude IS NOT NULL AND p_latitude NOT BETWEEN -90 AND 90)
       OR (p_longitude IS NOT NULL AND p_longitude NOT BETWEEN -180 AND 180) THEN
        RAISE EXCEPTION 'Provide both valid coordinates or clear both values.';
    END IF;

    UPDATE public.merchant_applications
    SET latitude = p_latitude,
        longitude = p_longitude,
        updated_at = now()
    WHERE id = p_application_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant application not found.';
    END IF;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (
        p_application_id,
        'dispatch_location_updated',
        coalesce(nullif(trim(p_actor), ''), 'admin'),
        jsonb_build_object(
            'latitude', p_latitude,
            'longitude', p_longitude,
            'updated_at', now()
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.update_merchant_dispatch_location(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_dispatch_location(UUID, NUMERIC, NUMERIC, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_confirmations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL CHECK (provider IN ('Paystack', 'PayHero')),
    reference TEXT NOT NULL UNIQUE,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    currency TEXT NOT NULL CHECK (currency = 'KES'),
    confirmation_source TEXT NOT NULL CHECK (confirmation_source IN ('webhook', 'server_verification')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_confirmations_order_idx
    ON public.payment_confirmations (order_id, verified_at DESC);
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_confirmations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_confirmations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payment_confirmations_id_seq TO service_role;

ALTER TABLE public.dispatch_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dispatch_decisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dispatch_decisions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dispatch_decisions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.retry_paid_order_merchant_allocation(
    p_order_id BIGINT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_order public.orders%ROWTYPE;
    item_record RECORD;
    allocated_quantity INTEGER;
    retried_items INTEGER := 0;
    unallocated_items JSONB := '[]'::JSONB;
BEGIN
    IF p_actor IS NULL OR char_length(trim(p_actor)) < 1 THEN
        RAISE EXCEPTION 'An administrator identity is required to retry merchant allocation.';
    END IF;
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Order not found.');
    END IF;
    IF lower(coalesce(target_order.status, '')) <> 'paid'
       OR target_order.payment_verified_at IS NULL
       OR lower(coalesce(target_order.payment_method, '')) NOT IN ('paystack', 'payhero')
       OR target_order.checkout_request_id IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM public.payment_confirmations confirmation
           WHERE confirmation.order_id = target_order.id
             AND confirmation.provider = CASE
                 WHEN lower(target_order.payment_method) = 'payhero' THEN 'PayHero'
                 ELSE 'Paystack'
             END
             AND confirmation.reference = target_order.checkout_request_id
             AND confirmation.amount_kobo = round(target_order.total_price * 100)::BIGINT
             AND confirmation.currency = 'KES'
       ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_NOT_CONFIRMED',
            'error', 'Retry is limited to orders with a matching server-verified online payment.'
        );
    END IF;
    IF target_order.rider_phone IS NOT NULL
       AND target_order.status IN ('Dispatched', 'Out for Delivery', 'Delivered') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_ALREADY_DISPATCHED',
            'error', 'Merchant allocation cannot be changed after rider dispatch.'
        );
    END IF;

    FOR item_record IN
        SELECT item.id, item.product_id, coalesce(item.quantity, 1)::INTEGER AS quantity,
               product.name AS product_name
        FROM public.order_items item
        LEFT JOIN public.products product ON product.id = item.product_id
        WHERE item.order_id = target_order.id
          AND item.product_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM public.merchant_product_batches tracked
              WHERE tracked.product_id = item.product_id
          )
        ORDER BY item.id
    LOOP
        INSERT INTO public.merchant_inventory_movements (
            batch_id, movement_type, quantity_delta, order_id, order_item_id, actor, note
        )
        SELECT traced.batch_id,
               'returned',
               (traced.traced_quantity - coalesce(previous_return.returned_quantity, 0))::INTEGER,
               target_order.id,
               item_record.id,
               trim(p_actor),
               'Returned for offline merchant redistribution'
        FROM (
            SELECT trace.batch_id, sum(trace.quantity)::INTEGER AS traced_quantity
            FROM public.merchant_order_item_trace trace
            WHERE trace.order_item_id = item_record.id
            GROUP BY trace.batch_id
        ) traced
        JOIN public.merchant_product_batches batch ON batch.id = traced.batch_id
        JOIN public.merchant_applications application ON application.id = batch.application_id
        LEFT JOIN LATERAL (
            SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS returned_quantity
            FROM public.merchant_inventory_movements movement
            WHERE movement.batch_id = traced.batch_id
              AND movement.order_item_id = item_record.id
              AND movement.movement_type = 'returned'
              AND movement.note = 'Returned for offline merchant redistribution'
        ) previous_return ON true
        WHERE application.status = 'approved'
          AND (
              NOT application.accepting_orders
              OR NOT public.merchant_is_open(application.operating_hours, now())
              OR EXISTS (
                  SELECT 1 FROM public.merchant_fulfillment_events rejected
                  WHERE rejected.order_id = target_order.id
                    AND rejected.application_id = application.id
                    AND rejected.event_type = 'rejected'
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_fulfillment_events accepted
              WHERE accepted.order_id = target_order.id
                AND accepted.application_id = application.id
                AND accepted.event_type = 'accepted'
          )
          AND traced.traced_quantity > coalesce(previous_return.returned_quantity, 0);

        BEGIN
            UPDATE public.order_items
            SET quantity = item_record.quantity
            WHERE id = item_record.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Merchant allocation retry for order item % did not complete: %',
                item_record.id, SQLERRM;
        END;

        SELECT coalesce(sum(greatest(trace.quantity - coalesce(returned.quantity, 0), 0)), 0)::INTEGER
        INTO allocated_quantity
        FROM public.merchant_order_item_trace trace
        JOIN public.merchant_product_batches batch ON batch.id = trace.batch_id
        JOIN public.merchant_applications application ON application.id = batch.application_id
        LEFT JOIN LATERAL (
            SELECT coalesce(sum(movement.quantity_delta), 0)::INTEGER AS quantity
            FROM public.merchant_inventory_movements movement
            WHERE movement.batch_id = trace.batch_id
              AND movement.order_item_id = trace.order_item_id
              AND movement.movement_type = 'returned'
              AND movement.note = 'Returned for offline merchant redistribution'
        ) returned ON true
        WHERE trace.order_item_id = item_record.id
          AND application.status = 'approved'
          AND (batch.expiry_at IS NULL OR batch.expiry_at >= CURRENT_DATE)
          AND NOT EXISTS (
              SELECT 1 FROM public.merchant_batch_holds hold
              WHERE hold.batch_id = batch.id AND hold.released_at IS NULL
          )
          AND (
              (
                  application.accepting_orders
                  AND public.merchant_is_open(application.operating_hours, now())
                  AND NOT EXISTS (
                      SELECT 1 FROM public.merchant_fulfillment_events rejected
                      WHERE rejected.order_id = target_order.id
                        AND rejected.application_id = application.id
                        AND rejected.event_type = 'rejected'
                  )
              )
              OR EXISTS (
                  SELECT 1 FROM public.merchant_fulfillment_events accepted
                  WHERE accepted.order_id = target_order.id
                    AND accepted.application_id = application.id
                    AND accepted.event_type = 'accepted'
              )
          );
        retried_items := retried_items + 1;
        IF allocated_quantity < item_record.quantity THEN
            unallocated_items := unallocated_items || jsonb_build_array(jsonb_build_object(
                'order_item_id', item_record.id,
                'product_name', coalesce(item_record.product_name, 'Product'),
                'requested_quantity', item_record.quantity,
                'allocated_quantity', allocated_quantity
            ));
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', target_order.id,
        'retried_items', retried_items,
        'fully_allocated', jsonb_array_length(unallocated_items) = 0,
        'unallocated_items', unallocated_items
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_paid_order_rider(
    p_order_id BIGINT,
    p_rider_phone TEXT,
    p_actor TEXT,
    p_is_override BOOLEAN DEFAULT false,
    p_override_reason TEXT DEFAULT NULL,
    p_criteria JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_order public.orders%ROWTYPE;
    target_rider public.rider_status%ROWTYPE;
    active_load INTEGER;
    max_load INTEGER;
    new_decision_id BIGINT;
    vendors UUID[];
BEGIN
    SELECT * INTO target_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Order not found.');
    END IF;

    IF lower(coalesce(target_order.status, '')) <> 'paid'
       OR target_order.payment_verified_at IS NULL
       OR lower(coalesce(target_order.payment_method, '')) NOT IN ('paystack', 'payhero') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_NOT_CONFIRMED',
            'error', 'Dispatch is limited to verified online orders. COD and manual orders remain unassigned.'
        );
    END IF;
    IF target_order.checkout_request_id IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.payment_confirmations confirmation
           WHERE confirmation.order_id = target_order.id
             AND confirmation.provider = CASE
                 WHEN lower(target_order.payment_method) = 'payhero' THEN 'PayHero'
                 ELSE 'Paystack'
             END
             AND confirmation.reference = target_order.checkout_request_id
             AND confirmation.amount_kobo = round(target_order.total_price * 100)::BIGINT
             AND confirmation.currency = 'KES'
       ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_PROOF_MISSING',
            'error', 'A server-verified online payment record is required before dispatch.'
        );
    END IF;

    IF target_order.rider_phone IS NOT NULL
       AND target_order.status IN ('Dispatched', 'Out for Delivery', 'Delivered') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_ASSIGNED', 'error', 'This order already has a rider assignment.');
    END IF;

    IF coalesce(p_is_override, false) AND length(trim(coalesce(p_override_reason, ''))) < 8 THEN
        RETURN jsonb_build_object('success', false, 'code', 'OVERRIDE_REASON_REQUIRED', 'error', 'Enter an override reason of at least 8 characters.');
    END IF;
    IF NOT coalesce((p_criteria->>'vendor_ready')::BOOLEAN, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FULFILLMENT_UNAVAILABLE',
            'error', 'Vendor fulfillment must be verified before assigning any rider. A rider override does not bypass merchant, stock, or acceptance checks.'
        );
    END IF;

    SELECT * INTO target_rider
    FROM public.rider_status
    WHERE rider_phone = p_rider_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_NOT_FOUND', 'error', 'Selected rider was not found.');
    END IF;
    IF coalesce(target_rider.verification_status, '') <> 'Verified' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_NOT_VERIFIED', 'error', 'Only verified riders can be assigned.');
    END IF;
    IF coalesce(target_rider.status, '') NOT IN ('Idle', 'Delivering') THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_OFFLINE', 'error', 'Selected rider is not online and available.');
    END IF;
    IF target_rider.updated_at IS NULL OR target_rider.updated_at < now() - INTERVAL '15 minutes' THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_STALE', 'error', 'Selected rider has no recent online heartbeat.');
    END IF;

    SELECT count(*)::INTEGER INTO active_load
    FROM public.orders
    WHERE rider_phone = p_rider_phone
      AND status IN ('Dispatched', 'Out for Delivery');
    max_load := greatest(coalesce(target_rider.max_deliveries, 3), 1);
    IF active_load >= max_load THEN
        RETURN jsonb_build_object('success', false, 'code', 'RIDER_AT_CAPACITY', 'error', 'Selected rider is at the active delivery limit.');
    END IF;

    vendors := ARRAY[]::UUID[];
    IF jsonb_typeof(p_criteria->'selected_vendor_ids') = 'array' THEN
        SELECT coalesce(array_agg(value::UUID), ARRAY[]::UUID[])
        INTO vendors
        FROM jsonb_array_elements_text(p_criteria->'selected_vendor_ids') AS value;
    END IF;

    UPDATE public.orders
    SET rider_name = target_rider.rider_name,
        rider_phone = target_rider.rider_phone,
        status = 'Dispatched',
        updated_at = now()
    WHERE id = target_order.id;

    UPDATE public.rider_status
    SET status = 'Delivering', updated_at = now()
    WHERE rider_phone = target_rider.rider_phone;

    INSERT INTO public.dispatch_decisions (
        order_id, selected_rider_phone, selected_rider_name, selected_vendor_ids,
        decision_type, criteria, chosen_by, override_reason
    ) VALUES (
        target_order.id, target_rider.rider_phone, target_rider.rider_name, vendors,
        CASE WHEN coalesce(p_is_override, false) THEN 'admin_override' ELSE 'recommended' END,
        coalesce(p_criteria, '{}'::JSONB),
        coalesce(nullif(trim(p_actor), ''), 'admin'),
        CASE WHEN coalesce(p_is_override, false) THEN trim(p_override_reason) ELSE NULL END
    ) RETURNING id INTO new_decision_id;

    RETURN jsonb_build_object(
        'success', true,
        'decision_id', new_decision_id,
        'order_id', target_order.id,
        'rider_phone', target_rider.rider_phone,
        'rider_name', target_rider.rider_name,
        'decision_type', CASE WHEN coalesce(p_is_override, false) THEN 'admin_override' ELSE 'recommended' END,
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_paid_order_rider(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_paid_order_rider(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.retry_paid_order_merchant_allocation(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_paid_order_merchant_allocation(BIGINT, TEXT) TO service_role;

-- ===== DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql =====
-- Delivery lifecycle, ETA history, and Buzz map schema additions.
-- Run after FINAL_ESTABLISHMENT_SQL.sql, MERCHANT_OPERATIONS_MIGRATION.sql,
-- and DISPATCH_MIGRATION.sql. Safe to re-run.


DO $$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.rider_status') IS NULL
       OR to_regclass('public.buzz_posts') IS NULL THEN
        RAISE EXCEPTION 'Delivery and Buzz migration prerequisites are missing.'
            USING HINT = 'Run FINAL_ESTABLISHMENT_SQL.sql and DISPATCH_MIGRATION.sql first.';
    END IF;
END;
$$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS delivery_address TEXT,
    ADD COLUMN IF NOT EXISTS delivery_area TEXT,
    ADD COLUMN IF NOT EXISTS delivery_building TEXT,
    ADD COLUMN IF NOT EXISTS delivery_landmark TEXT,
    ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
    ADD COLUMN IF NOT EXISTS delivery_eta_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS delivery_eta_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_route_distance_meters INTEGER,
    ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.delivery_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'rider', 'admin', 'payment')),
    actor_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_events_order_created_idx
    ON public.delivery_events (order_id, created_at);
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delivery_events TO service_role;
DO $$
DECLARE
    event_sequence TEXT;
BEGIN
    event_sequence := pg_get_serial_sequence('public.delivery_events', 'id');
    IF event_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', event_sequence);
        EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', event_sequence);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_delivery_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    status_actor_type TEXT := 'system';
    status_actor_id TEXT;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.rider_phone IS NOT NULL AND NEW.rider_phone IS DISTINCT FROM OLD.rider_phone THEN
        status_actor_type := 'admin';
        status_actor_id := NEW.rider_phone;
    ELSIF NEW.status IN ('Picked Up', 'Out for Delivery', 'Delivered') AND NEW.rider_phone IS NOT NULL THEN
        status_actor_type := 'rider';
        status_actor_id := NEW.rider_phone;
    ELSIF NEW.status IN ('Paid', 'Payment Failed') THEN
        status_actor_type := 'payment';
    END IF;

    INSERT INTO public.delivery_events (
        order_id, from_status, to_status, actor_type, actor_id
    )
    VALUES (
        NEW.id, OLD.status, NEW.status, status_actor_type, status_actor_id
    );

    IF NEW.status = 'Picked Up' AND NEW.picked_up_at IS NULL THEN
        NEW.picked_up_at := now();
    ELSIF NEW.status = 'Out for Delivery' AND NEW.out_for_delivery_at IS NULL THEN
        NEW.out_for_delivery_at := now();
    ELSIF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_delivery_status_event ON public.orders;
CREATE TRIGGER orders_delivery_status_event
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.log_delivery_status_event();

CREATE TABLE IF NOT EXISTS public.delivery_route_estimates (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    leg TEXT NOT NULL CHECK (leg IN ('rider_to_pickup', 'pickup_to_dropoff')),
    provider TEXT NOT NULL,
    distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
    traffic_aware BOOLEAN NOT NULL DEFAULT false,
    encoded_polyline TEXT,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_route_estimates_order_calculated_idx
    ON public.delivery_route_estimates (order_id, calculated_at DESC);
ALTER TABLE public.delivery_route_estimates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_route_estimates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delivery_route_estimates TO service_role;

CREATE TABLE IF NOT EXISTS public.rider_wallets (
    rider_phone TEXT PRIMARY KEY,
    balance NUMERIC NOT NULL DEFAULT 0,
    total_earned NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rider_wallets
    ADD COLUMN IF NOT EXISTS rider_phone TEXT,
    ADD COLUMN IF NOT EXISTS balance NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_earned NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS rider_wallets_rider_phone_uidx
    ON public.rider_wallets (rider_phone);
ALTER TABLE public.rider_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_wallets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_wallets TO service_role;

INSERT INTO public.rider_wallets (rider_phone)
SELECT rider_phone FROM public.rider_status
ON CONFLICT (rider_phone) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_rider_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.rider_wallets (rider_phone)
    VALUES (NEW.rider_phone)
    ON CONFLICT (rider_phone) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rider_status_create_wallet ON public.rider_status;
CREATE TRIGGER rider_status_create_wallet
    AFTER INSERT ON public.rider_status
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_rider_wallet();
REVOKE ALL ON FUNCTION public.ensure_rider_wallet() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_rider_wallet() TO service_role;

CREATE TABLE IF NOT EXISTS public.rider_delivery_commissions (
    order_id BIGINT PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
    rider_phone TEXT NOT NULL,
    amount_ksh NUMERIC NOT NULL CHECK (amount_ksh > 0),
    credited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rider_delivery_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_delivery_commissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_delivery_commissions TO service_role;

CREATE OR REPLACE FUNCTION public.advance_rider_delivery(
    p_order_id BIGINT,
    p_rider_phone TEXT,
    p_next_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_status TEXT;
    assigned_phone TEXT;
    expected_status TEXT;
    commission_added BOOLEAN := false;
    inserted_rows INTEGER := 0;
BEGIN
    IF p_next_status NOT IN ('Picked Up', 'Out for Delivery', 'Delivered') THEN
        RAISE EXCEPTION 'Invalid delivery status transition.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.rider_status
        WHERE rider_phone = p_rider_phone AND verification_status = 'Verified'
    ) THEN
        RAISE EXCEPTION 'Only verified riders can update delivery status.';
    END IF;

    SELECT status, rider_phone
      INTO current_status, assigned_phone
      FROM public.orders
     WHERE id = p_order_id
     FOR UPDATE;

    IF NOT FOUND OR assigned_phone IS DISTINCT FROM p_rider_phone THEN
        RAISE EXCEPTION 'Order is not assigned to this rider.';
    END IF;

    IF current_status = p_next_status THEN
        RETURN current_status;
    END IF;

    expected_status := CASE current_status
        WHEN 'Dispatched' THEN 'Picked Up'
        WHEN 'Picked Up' THEN 'Out for Delivery'
        WHEN 'Out for Delivery' THEN 'Delivered'
        ELSE NULL
    END;
    IF expected_status IS DISTINCT FROM p_next_status THEN
        RAISE EXCEPTION 'Delivery status cannot advance from % to %.', current_status, p_next_status;
    END IF;

    UPDATE public.orders
       SET status = p_next_status, updated_at = now()
     WHERE id = p_order_id;

    IF p_next_status = 'Delivered' THEN
        INSERT INTO public.rider_delivery_commissions (order_id, rider_phone, amount_ksh)
        VALUES (p_order_id, p_rider_phone, 150)
        ON CONFLICT (order_id) DO NOTHING;
        GET DIAGNOSTICS inserted_rows = ROW_COUNT;
        commission_added := inserted_rows > 0;

        IF commission_added THEN
            UPDATE public.rider_wallets
               SET balance = COALESCE(balance, 0) + 150,
                   total_earned = COALESCE(total_earned, 0) + 150,
                   updated_at = now()
             WHERE rider_phone = p_rider_phone;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Rider wallet is not set up for commission credit.';
            END IF;
        END IF;
    END IF;

    RETURN p_next_status;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_rider_delivery(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_rider_delivery(BIGINT, TEXT, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.buzz_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL UNIQUE,
    slug TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buzz_categories
    ADD COLUMN IF NOT EXISTS label TEXT,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.buzz_categories
   SET label = COALESCE(NULLIF(label, ''), NULLIF(to_jsonb(buzz_categories)->>'name', ''), 'Uncategorized')
 WHERE label IS NULL OR label = '';

INSERT INTO public.buzz_categories (label, slug)
SELECT seed.label, seed.slug
FROM (VALUES
    ('Nightlife', 'nightlife'),
    ('Food & Drink', 'food-drink'),
    ('Live Music', 'live-music')
) AS seed(label, slug)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.buzz_categories existing_category
    WHERE lower(existing_category.label) = lower(seed.label)
);

CREATE TABLE IF NOT EXISTS public.buzz_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL DEFAULT 'Nairobi',
    category TEXT NOT NULL DEFAULT 'Venue',
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    hero_image_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    rating NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
ALTER TABLE public.buzz_venues
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT 'Nairobi',
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Venue',
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS latitude NUMERIC,
    ADD COLUMN IF NOT EXISTS longitude NUMERIC,
    ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rating NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.venue_managers (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_managers_venue_id_idx
    ON public.venue_managers (venue_id);
ALTER TABLE public.venue_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venue_managers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venue_managers TO authenticated;
GRANT ALL ON public.venue_managers TO service_role;
DROP POLICY IF EXISTS venue_managers_read_own ON public.venue_managers;
CREATE POLICY venue_managers_read_own
    ON public.venue_managers
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

ALTER TABLE public.buzz_posts
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.buzz_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS latitude NUMERIC,
    ADD COLUMN IF NOT EXISTS longitude NUMERIC,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS impressions BIGINT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS buzz_posts_status_start_idx
    ON public.buzz_posts (status, start_at);
CREATE INDEX IF NOT EXISTS buzz_posts_coordinates_idx
    ON public.buzz_posts (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.buzz_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buzz_id UUID NOT NULL REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL DEFAULT 'image',
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buzz_media
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS buzz_media_buzz_created_idx
    ON public.buzz_media (buzz_id, created_at);

CREATE TABLE IF NOT EXISTS public.buzz_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buzz_id UUID REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buzz_updates
    ADD COLUMN IF NOT EXISTS buzz_id UUID REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS message TEXT,
    ADD COLUMN IF NOT EXISTS media_url TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS buzz_updates_buzz_created_idx
    ON public.buzz_updates (buzz_id, created_at DESC);


COMMIT;
