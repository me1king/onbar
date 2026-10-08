-- Makes business audit events append-only and hash-chained from this migration onward.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path = public, extensions;

DO $$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.delivery_events') IS NULL THEN
        RAISE EXCEPTION 'Forensics requires the core orders and delivery event schemas.'
            USING HINT = 'Run DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql before this migration.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_email TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    resource_type TEXT,
    resource_id TEXT,
    old_value JSONB,
    new_value JSONB,
    correlation_id TEXT,
    request_id TEXT,
    ip_address TEXT,
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'staff',
    ADD COLUMN IF NOT EXISTS actor_label TEXT,
    ADD COLUMN IF NOT EXISTS actor_role TEXT,
    ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'SUCCESS',
    ADD COLUMN IF NOT EXISTS previous_hash TEXT,
    ADD COLUMN IF NOT EXISTS event_hash TEXT,
    ADD COLUMN IF NOT EXISTS chain_position BIGINT;

-- Keep actor IDs as historical identifiers even if an auth account is removed.
DO $$
DECLARE
    actor_fk RECORD;
BEGIN
    FOR actor_fk IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.audit_logs'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (actor_id)%'
    LOOP
        EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', actor_fk.conname);
    END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS audit_logs_resource_time_idx
    ON public.audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_time_idx
    ON public.audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_time_idx
    ON public.audit_logs (staff_email, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_event_hash_uidx
    ON public.audit_logs (event_hash)
    WHERE event_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_chain_position_uidx
    ON public.audit_logs (chain_position)
    WHERE chain_position IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_log_chain_head (
    chain_name TEXT PRIMARY KEY,
    latest_hash TEXT NOT NULL,
    latest_event_id UUID,
    latest_position BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log_chain_head
    ADD COLUMN IF NOT EXISTS latest_position BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.audit_log_chain_head ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_log_chain_head FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.audit_log_chain_head (chain_name, latest_hash)
VALUES (
    'primary',
    encode(digest(convert_to('onlinebar:audit-chain:v1', 'UTF8'), 'sha256'), 'hex')
)
ON CONFLICT (chain_name) DO NOTHING;

-- Import existing delivery status events into the central, hash-chained trail.
DO $$
DECLARE
    delivery_event RECORD;
    event_label TEXT;
BEGIN
    FOR delivery_event IN
        SELECT id, order_id, from_status, to_status, actor_type, actor_id, metadata, created_at
        FROM public.delivery_events
        ORDER BY created_at, id
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.audit_logs
            WHERE details ->> 'delivery_event_id' = delivery_event.id::TEXT
        ) THEN
            event_label := CASE delivery_event.actor_type
                WHEN 'rider' THEN 'Rider ' || COALESCE(NULLIF(delivery_event.actor_id, ''), '(unknown)')
                WHEN 'admin' THEN 'Operations admin'
                WHEN 'payment' THEN 'Payment system'
                ELSE 'Operations system'
            END;

            INSERT INTO public.audit_logs (
                staff_email, actor_type, actor_label, actor_role, action, outcome,
                details, resource_type, resource_id, old_value, new_value,
                correlation_id, request_id, created_at
            )
            VALUES (
                event_label,
                delivery_event.actor_type,
                event_label,
                delivery_event.actor_type,
                'ORDER_STATUS_CHANGED',
                'SUCCESS',
                jsonb_build_object('source', 'delivery_events', 'delivery_event_id', delivery_event.id),
                'order',
                delivery_event.order_id::TEXT,
                CASE WHEN delivery_event.from_status IS NULL THEN NULL ELSE to_jsonb(delivery_event.from_status) END,
                to_jsonb(delivery_event.to_status),
                'delivery_event_' || delivery_event.id::TEXT,
                'delivery_event_' || delivery_event.id::TEXT,
                delivery_event.created_at
            );
        END IF;
    END LOOP;
END;
$$;

-- Anchor the existing history at migration time before enabling the append-only triggers.
DO $$
DECLARE
    event_row public.audit_logs%ROWTYPE;
    prior_hash TEXT := encode(digest(convert_to('onlinebar:audit-chain:v1', 'UTF8'), 'sha256'), 'hex');
    position_value BIGINT := 0;
    event_payload JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.audit_log_chain_head
        WHERE chain_name = 'primary' AND latest_event_id IS NOT NULL
    ) THEN
        FOR event_row IN
            SELECT * FROM public.audit_logs ORDER BY created_at, id
        LOOP
            position_value := position_value + 1;
            event_row.previous_hash := prior_hash;
            event_row.chain_position := position_value;
            event_payload := to_jsonb(event_row) - 'event_hash';
            event_row.event_hash := encode(
                digest(convert_to(event_payload::TEXT, 'UTF8'), 'sha256'),
                'hex'
            );

            UPDATE public.audit_logs
            SET previous_hash = event_row.previous_hash,
                chain_position = event_row.chain_position,
                event_hash = event_row.event_hash
            WHERE id = event_row.id;

            prior_hash := event_row.event_hash;
        END LOOP;

        UPDATE public.audit_log_chain_head
        SET latest_hash = prior_hash,
            latest_event_id = event_row.id,
            latest_position = position_value,
            updated_at = now()
        WHERE chain_name = 'primary';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.chain_audit_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    prior_hash TEXT;
    prior_position BIGINT;
    event_payload JSONB;
BEGIN
    SELECT latest_hash, latest_position
    INTO prior_hash, prior_position
    FROM public.audit_log_chain_head
    WHERE chain_name = 'primary'
    FOR UPDATE;

    IF prior_hash IS NULL THEN
        RAISE EXCEPTION 'Audit hash-chain head is missing.';
    END IF;

    NEW.previous_hash := prior_hash;
    NEW.chain_position := prior_position + 1;
    event_payload := to_jsonb(NEW) - 'event_hash';
    NEW.event_hash := encode(
        digest(convert_to(event_payload::TEXT, 'UTF8'), 'sha256'),
        'hex'
    );

    UPDATE public.audit_log_chain_head
    SET latest_hash = NEW.event_hash,
        latest_event_id = NEW.id,
        latest_position = NEW.chain_position,
        updated_at = now()
    WHERE chain_name = 'primary';

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_audit_log_chain()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    event_row public.audit_logs%ROWTYPE;
    expected_previous TEXT := encode(digest(convert_to('onlinebar:audit-chain:v1', 'UTF8'), 'sha256'), 'hex');
    expected_position BIGINT := 1;
    recomputed_hash TEXT;
BEGIN
    FOR event_row IN
        SELECT * FROM public.audit_logs ORDER BY chain_position
    LOOP
        IF event_row.chain_position IS DISTINCT FROM expected_position
            OR event_row.previous_hash IS DISTINCT FROM expected_previous THEN
            RETURN jsonb_build_object(
                'valid', false,
                'checked_events', expected_position - 1,
                'broken_event_id', event_row.id
            );
        END IF;

        recomputed_hash := encode(
            digest(convert_to((to_jsonb(event_row) - 'event_hash')::TEXT, 'UTF8'), 'sha256'),
            'hex'
        );
        IF recomputed_hash IS DISTINCT FROM event_row.event_hash THEN
            RETURN jsonb_build_object(
                'valid', false,
                'checked_events', expected_position - 1,
                'broken_event_id', event_row.id
            );
        END IF;

        expected_previous := event_row.event_hash;
        expected_position := expected_position + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', true,
        'checked_events', expected_position - 1,
        'broken_event_id', NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_audit_log_chain() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_log_chain() TO service_role;

CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Forensic event records are append-only.';
END;
$$;

CREATE OR REPLACE FUNCTION public.mirror_delivery_event_to_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    event_label TEXT;
BEGIN
    event_label := CASE NEW.actor_type
        WHEN 'rider' THEN 'Rider ' || COALESCE(NULLIF(NEW.actor_id, ''), '(unknown)')
        WHEN 'admin' THEN 'Operations admin'
        WHEN 'payment' THEN 'Payment system'
        ELSE 'Operations system'
    END;

    INSERT INTO public.audit_logs (
        staff_email, actor_type, actor_label, actor_role, action, outcome,
        details, resource_type, resource_id, old_value, new_value,
        correlation_id, request_id, created_at
    )
    VALUES (
        event_label,
        NEW.actor_type,
        event_label,
        NEW.actor_type,
        'ORDER_STATUS_CHANGED',
        'SUCCESS',
        jsonb_build_object('source', 'delivery_events', 'delivery_event_id', NEW.id),
        'order',
        NEW.order_id::TEXT,
        CASE WHEN NEW.from_status IS NULL THEN NULL ELSE to_jsonb(NEW.from_status) END,
        to_jsonb(NEW.to_status),
        'delivery_event_' || NEW.id::TEXT,
        'delivery_event_' || NEW.id::TEXT,
        NEW.created_at
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_order_creation_forensics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    INSERT INTO public.audit_logs (
        staff_email, actor_type, actor_label, actor_role, action, outcome,
        details, resource_type, resource_id, old_value, new_value,
        correlation_id, request_id, created_at
    )
    VALUES (
        CASE
            WHEN NEW.captured_by IS NOT NULL AND NEW.captured_by <> 'system' THEN NEW.captured_by
            ELSE 'Storefront customer'
        END,
        CASE
            WHEN NEW.captured_by IS NOT NULL AND NEW.captured_by <> 'system' THEN 'staff'
            ELSE 'customer'
        END,
        CASE
            WHEN NEW.captured_by IS NOT NULL AND NEW.captured_by <> 'system' THEN NEW.captured_by
            ELSE 'Storefront checkout'
        END,
        CASE
            WHEN NEW.captured_by IS NOT NULL AND NEW.captured_by <> 'system' THEN 'staff'
            ELSE 'customer'
        END,
        'ORDER_CREATED',
        'SUCCESS',
        jsonb_build_object(
            'total_price', NEW.total_price,
            'payment_method', NEW.payment_method,
            'initial_status', NEW.status,
            'origin', CASE
                WHEN NEW.captured_by IS NOT NULL AND NEW.captured_by <> 'system' THEN 'admin'
                ELSE 'storefront'
            END
        ),
        'order',
        NEW.id::TEXT,
        NULL,
        jsonb_build_object('status', NEW.status),
        'order_' || NEW.id::TEXT || '_created',
        'order_' || NEW.id::TEXT || '_created',
        NEW.created_at
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_chain_insert ON public.audit_logs;
CREATE TRIGGER audit_logs_chain_insert
    BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log_insert();

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();

DROP TRIGGER IF EXISTS delivery_events_mirror_audit ON public.delivery_events;
CREATE TRIGGER delivery_events_mirror_audit
    AFTER INSERT ON public.delivery_events
    FOR EACH ROW EXECUTE FUNCTION public.mirror_delivery_event_to_audit_log();

DROP TRIGGER IF EXISTS delivery_events_append_only ON public.delivery_events;
CREATE TRIGGER delivery_events_append_only
    BEFORE UPDATE OR DELETE ON public.delivery_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON public.delivery_events FROM service_role;
GRANT SELECT, INSERT ON public.delivery_events TO service_role;

DROP TRIGGER IF EXISTS orders_forensics_insert ON public.orders;
CREATE TRIGGER orders_forensics_insert
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.record_order_creation_forensics();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
