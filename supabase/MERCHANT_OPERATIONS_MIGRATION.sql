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

CREATE INDEX IF NOT EXISTS merchant_applications_status_created_idx
    ON public.merchant_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_applications_area_idx
    ON public.merchant_applications USING GIN (operating_areas);

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
    SELECT b.expiry_at, b.product_id, b.quantity_received, a.status
    INTO batch_expiry, batch_product, quantity_received, application_status
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
       OR lower(coalesce(parent_order.payment_method, '')) <> 'paystack'
       OR parent_order.latitude IS NULL
       OR parent_order.longitude IS NULL
       OR to_regclass('public.payment_confirmations') IS NULL THEN
        RAISE EXCEPTION 'Merchant inventory can only be allocated to a Paystack order with confirmed payment and delivery coordinates.';
    END IF;
    EXECUTE
        'SELECT EXISTS (
            SELECT 1 FROM public.payment_confirmations confirmation
            WHERE confirmation.order_id = $1
              AND confirmation.provider = ''Paystack''
              AND confirmation.reference = $2
              AND confirmation.amount_kobo = round($3 * 100)::BIGINT
              AND confirmation.currency = ''KES''
        )'
    INTO has_payment_proof
    USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price;
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
    SELECT coalesce(sum(quantity), 0)::INTEGER INTO already_traced
    FROM public.merchant_order_item_trace
    WHERE order_item_id = NEW.order_item_id
      AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
    IF already_traced + NEW.quantity > coalesce(order_quantity, 1) THEN
        RAISE EXCEPTION 'Batch trace quantity cannot exceed the order item quantity.';
    END IF;
    IF application_status <> 'approved' THEN
        RAISE EXCEPTION 'Only an approved merchant can fulfil an order.';
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
       OR lower(coalesce(parent_order.payment_method, '')) <> 'paystack'
       OR to_regclass('public.payment_confirmations') IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE
        'SELECT EXISTS (
            SELECT 1
            FROM public.payment_confirmations confirmation
            WHERE confirmation.order_id = $1
              AND confirmation.provider = ''Paystack''
              AND confirmation.reference = $2
              AND confirmation.amount_kobo = round($3 * 100)::BIGINT
              AND confirmation.currency = ''KES''
        )'
    INTO has_payment_proof
    USING parent_order.id, parent_order.checkout_request_id, parent_order.total_price;

    IF NOT has_payment_proof OR parent_order.latitude IS NULL OR parent_order.longitude IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.merchant_order_item_trace trace
        WHERE trace.order_item_id = NEW.id
    ) THEN
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
REVOKE ALL ON FUNCTION public.receive_merchant_product_batch(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_merchant_product_batch(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT) TO service_role;
