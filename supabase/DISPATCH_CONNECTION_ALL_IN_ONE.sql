-- ONLINE BAR: dispatch connection setup for an EXISTING Supabase project.
-- Prerequisite: FINAL_ESTABLISHMENT_SQL.sql has already been applied.
-- Paste this entire file into Supabase SQL Editor and run once.
-- This combines merchant traceability, dispatch, and admin dashboard recovery
-- migrations in dependency order. It does not install the core schema.

BEGIN;

DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(required.table_name, ', ')
      INTO missing_tables
      FROM (VALUES
        ('public.products'),
        ('public.orders'),
        ('public.order_items'),
        ('public.staff'),
        ('public.financial_ledger')
      ) AS required(table_name)
     WHERE to_regclass(required.table_name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Dispatch setup requires the existing core tables: %.', missing_tables
            USING HINT = 'Run supabase/FINAL_ESTABLISHMENT_SQL.sql on a blank project first; do not run it over an existing production database.';
    END IF;
END;
$$;

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
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS offered_goods JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS offered_goods_pricing JSONB NOT NULL DEFAULT '[]'::JSONB;

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
        RAISE EXCEPTION 'Merchant inventory can only be allocated to an online order with confirmed payment and delivery coordinates.';
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

-- ===== ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql =====
-- Restore schema objects used by the admin analytics, finance, and dispatch dashboards.
-- Run after FINAL_ESTABLISHMENT_SQL.sql, MERCHANT_OPERATIONS_MIGRATION.sql,
-- and DISPATCH_MIGRATION.sql. The rider wallet table is created below if absent.

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

DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(required.table_name, ', ')
    INTO missing_tables
    FROM (VALUES
        ('public.orders'),
        ('public.products'),
        ('public.staff'),
        ('public.financial_ledger'),
        ('public.rider_status'),
        ('public.dispatch_decisions')
    ) AS required(table_name)
    WHERE to_regclass(required.table_name) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Admin dashboard recovery requires base tables: %.', missing_tables
            USING HINT = 'Apply the core, merchant, and dispatch migrations listed at the top of this file first.';
    END IF;
END;
$$;

ALTER TABLE public.rider_status
    ADD COLUMN IF NOT EXISTS id_number TEXT,
    ADD COLUMN IF NOT EXISTS license_number TEXT,
    ADD COLUMN IF NOT EXISTS plate_number TEXT,
    ADD COLUMN IF NOT EXISTS rider_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS weekly_salary NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS runner_xp INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS runner_level INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS can_accept_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS can_reject_orders BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS can_view_earnings BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS overdue_tasks INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS can_manage_kitchen BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries
    ADD COLUMN IF NOT EXISTS account_id TEXT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ledger_entries_account_created_idx
    ON public.ledger_entries (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reconciliation_staging (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    source TEXT,
    external_reference TEXT,
    amount NUMERIC NOT NULL,
    is_matched BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    matched_at TIMESTAMPTZ
);

ALTER TABLE public.reconciliation_staging
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS external_reference TEXT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC,
    ADD COLUMN IF NOT EXISTS is_matched BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS reconciliation_staging_match_created_idx
    ON public.reconciliation_staging (is_matched, created_at DESC);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ledger_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ledger_entries TO service_role;

ALTER TABLE public.reconciliation_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reconciliation_staging FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reconciliation_staging TO service_role;

ALTER TABLE public.rider_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_wallets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rider_wallets TO service_role;

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

GRANT EXECUTE ON FUNCTION public.get_completed_order_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_listed_price_stock_value() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_order_delivery_demand_zones() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification: all should be true for dispatch setup to be complete.
SELECT
    to_regclass('public.merchant_applications') IS NOT NULL AS merchant_applications_ready,
    to_regclass('public.merchant_order_item_trace') IS NOT NULL AS merchant_order_trace_ready,
    to_regclass('public.merchant_product_batches') IS NOT NULL AS merchant_batches_ready,
    to_regclass('public.merchant_fulfillment_events') IS NOT NULL AS merchant_fulfillment_ready,
    to_regclass('public.rider_status') IS NOT NULL AS rider_status_ready,
    to_regclass('public.dispatch_decisions') IS NOT NULL AS dispatch_decisions_ready,
    to_regclass('public.payment_confirmations') IS NOT NULL AS payment_confirmations_ready,
    to_regclass('public.rider_wallets') IS NOT NULL AS rider_wallets_ready,
    to_regprocedure('public.assign_paid_order_rider(bigint,text,text,boolean,text,jsonb)') IS NOT NULL AS rider_assignment_function_ready,
    to_regprocedure('public.get_order_delivery_demand_zones()') IS NOT NULL AS dispatch_heatmap_function_ready;