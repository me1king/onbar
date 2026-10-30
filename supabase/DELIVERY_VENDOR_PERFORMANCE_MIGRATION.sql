-- Merchant type-specific performance targets and rankings.
-- Run after DELIVERY_VENDOR_SCORECARD_MIGRATION.sql.
-- This adapts the vendor scorecard to the existing merchant application and
-- fulfilment-event model; it does not create a parallel vendors/orders schema.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.merchant_applications') IS NULL
       OR to_regclass('public.merchant_fulfillment_events') IS NULL
       OR to_regclass('public.merchant_document_requirements') IS NULL
       OR to_regclass('public.merchant_application_events') IS NULL
       OR to_regclass('public.merchant_vendor_scorecard_events') IS NULL THEN
        RAISE EXCEPTION 'Vendor performance requires the merchant, dispatch, and scorecard migrations.'
            USING HINT = 'Apply FINAL_ESTABLISHMENT_SQL.sql, MERCHANT_OPERATIONS_MIGRATION.sql, DISPATCH_MIGRATION.sql, DELIVERY_VENDOR_SCORECARD_MIGRATION.sql, then this migration.';
    END IF;
END;
$$;

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS vendor_type TEXT,
    ADD COLUMN IF NOT EXISTS prep_target_minutes INTEGER;

UPDATE public.merchant_applications
SET vendor_type = CASE
        WHEN business_type = 'supplier' THEN 'wholesaler'
        WHEN business_type IN ('kitchen', 'restaurant', 'food_vendor') THEN 'street_food'
        WHEN business_type = 'bar' THEN 'retailer'
        ELSE NULL
    END;

ALTER TABLE public.merchant_applications
    DROP CONSTRAINT IF EXISTS merchant_applications_vendor_type_check;
ALTER TABLE public.merchant_applications
    DROP CONSTRAINT IF EXISTS merchant_applications_vendor_business_type_check;
ALTER TABLE public.merchant_applications
    ADD CONSTRAINT merchant_applications_vendor_business_type_check
    CHECK (
        (business_type = 'bar' AND vendor_type = 'retailer')
        OR (business_type = 'supplier' AND vendor_type = 'wholesaler')
        OR (business_type IN ('kitchen', 'restaurant', 'food_vendor') AND vendor_type = 'street_food')
        OR (business_type = 'delivery_partner' AND vendor_type IS NULL)
    );
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'merchant_applications_prep_target_check'
          AND conrelid = 'public.merchant_applications'::regclass
    ) THEN
        ALTER TABLE public.merchant_applications
            ADD CONSTRAINT merchant_applications_prep_target_check
            CHECK (prep_target_minutes IS NULL OR prep_target_minutes BETWEEN 1 AND 240);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_vendor_score_config (
    vendor_type TEXT PRIMARY KEY CHECK (vendor_type IN ('retailer', 'wholesaler', 'street_food')),
    weight_reply NUMERIC(5, 4) NOT NULL,
    weight_acceptance NUMERIC(5, 4) NOT NULL,
    weight_ontime NUMERIC(5, 4) NOT NULL,
    weight_rating NUMERIC(5, 4) NOT NULL,
    weight_complaints NUMERIC(5, 4) NOT NULL,
    target_reply_seconds INTEGER NOT NULL CHECK (target_reply_seconds BETWEEN 1 AND 600),
    timeout_seconds INTEGER NOT NULL DEFAULT 90 CHECK (timeout_seconds BETWEEN 1 AND 3600),
    target_prep_minutes INTEGER NOT NULL CHECK (target_prep_minutes BETWEEN 1 AND 240),
    target_acceptance_pct NUMERIC(5, 2) NOT NULL CHECK (target_acceptance_pct BETWEEN 0 AND 100),
    target_ontime_pct NUMERIC(5, 2) NOT NULL CHECK (target_ontime_pct BETWEEN 0 AND 100),
    target_rating NUMERIC(3, 2) NOT NULL CHECK (target_rating BETWEEN 1 AND 5),
    target_complaints_per_100 NUMERIC(5, 2) NOT NULL CHECK (target_complaints_per_100 >= 0),
    min_decisions INTEGER NOT NULL DEFAULT 10 CHECK (min_decisions BETWEEN 1 AND 1000),
    shrink_k INTEGER NOT NULL DEFAULT 15 CHECK (shrink_k BETWEEN 0 AND 1000),
    CHECK (weight_reply + weight_acceptance + weight_ontime + weight_rating + weight_complaints = 1)
);

INSERT INTO public.merchant_vendor_score_config (
    vendor_type, weight_reply, weight_acceptance, weight_ontime, weight_rating,
    weight_complaints, target_reply_seconds, timeout_seconds, target_prep_minutes,
    target_acceptance_pct, target_ontime_pct, target_rating, target_complaints_per_100,
    min_decisions, shrink_k
)
VALUES
    ('retailer', .30, .25, .20, .15, .10, 30, 90, 12, 90, 95, 4.5, 3, 10, 15),
    ('wholesaler', .20, .25, .30, .10, .15, 60, 90, 30, 90, 95, 4.5, 3, 8, 12),
    ('street_food', .30, .20, .25, .15, .10, 25, 90, 10, 90, 95, 4.5, 3, 10, 15)
ON CONFLICT (vendor_type) DO NOTHING;

UPDATE public.merchant_applications application
SET prep_target_minutes = config.target_prep_minutes
FROM public.merchant_vendor_score_config config
WHERE application.vendor_type = config.vendor_type
  AND application.prep_target_minutes IS NULL;

ALTER TABLE public.merchant_document_requirements
    DROP CONSTRAINT IF EXISTS merchant_document_requirements_document_type_check;
ALTER TABLE public.merchant_document_requirements
    ADD CONSTRAINT merchant_document_requirements_document_type_check CHECK (document_type IN (
        'business_registration', 'county_license', 'liquor_licence', 'wholesale_licence',
        'kra_pin', 'medical_cert', 'food_hygiene', 'tax_document',
        'premises_document', 'other_permit'
    ));

INSERT INTO public.merchant_document_requirements (
    business_type, county, document_type, label, is_required
)
VALUES
    ('bar', '*', 'liquor_licence', 'Alcohol retail licence', true),
    ('supplier', '*', 'wholesale_licence', 'Alcohol wholesale licence', true)
ON CONFLICT (business_type, county, document_type) DO UPDATE
SET label = EXCLUDED.label,
    is_required = TRUE,
    is_active = TRUE;

UPDATE public.merchant_document_requirements
SET label = CASE document_type
        WHEN 'liquor_licence' THEN 'Alcohol retail licence'
        ELSE 'Alcohol wholesale licence'
    END,
    is_required = TRUE,
    is_active = TRUE
WHERE (business_type = 'bar' AND document_type = 'liquor_licence')
   OR (business_type = 'supplier' AND document_type = 'wholesale_licence');

CREATE OR REPLACE FUNCTION public.merchant_document_has_current_license(
    p_documents JSONB,
    p_document_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    document JSONB;
    expiry_text TEXT;
    expiry_date DATE;
BEGIN
    IF p_document_type IS NULL
       OR p_document_type NOT IN ('liquor_licence', 'wholesale_licence')
       OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array' THEN
        RETURN FALSE;
    END IF;

    FOR document IN SELECT value FROM jsonb_array_elements(p_documents)
    LOOP
        IF document->>'type' IS DISTINCT FROM p_document_type THEN
            CONTINUE;
        END IF;
        expiry_text := document->>'expiresAt';
        IF expiry_text IS NULL OR expiry_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
            CONTINUE;
        END IF;

        BEGIN
            expiry_date := expiry_text::DATE;
        EXCEPTION
            WHEN invalid_datetime_format OR datetime_field_overflow THEN
                CONTINUE;
        END;

        IF expiry_date >= CURRENT_DATE THEN
            RETURN TRUE;
        END IF;
    END LOOP;

    RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.merchant_document_has_current_license(JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_document_has_current_license(JSONB, TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_current_vendor_license_for_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    required_document_type TEXT;
    documents_changed BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        documents_changed := NEW.documents IS DISTINCT FROM OLD.documents;
    END IF;

    required_document_type := CASE NEW.vendor_type
        WHEN 'retailer' THEN 'liquor_licence'
        WHEN 'wholesaler' THEN 'wholesale_licence'
        ELSE NULL
    END;

    IF NEW.status = 'approved'
       AND NEW.accepting_orders
       AND required_document_type IS NOT NULL
       AND NOT public.merchant_document_has_current_license(NEW.documents, required_document_type) THEN
        IF documents_changed THEN
            NEW.accepting_orders := FALSE;
            NEW.availability_updated_at := now();
        ELSE
            RAISE EXCEPTION 'A current alcohol licence with an expiry date is required before accepting orders.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_current_vendor_license_for_availability()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS merchant_vendor_license_availability_guard
    ON public.merchant_applications;
CREATE TRIGGER merchant_vendor_license_availability_guard
    BEFORE INSERT OR UPDATE OF business_type, vendor_type, status, accepting_orders, documents
    ON public.merchant_applications
    FOR EACH ROW EXECUTE FUNCTION public.enforce_current_vendor_license_for_availability();

CREATE OR REPLACE FUNCTION public.pause_alcohol_vendors_without_current_licence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    paused_count INTEGER;
BEGIN
    WITH paused AS (
        UPDATE public.merchant_applications application
        SET accepting_orders = FALSE,
            availability_updated_at = now(),
            updated_at = now()
        WHERE application.status = 'approved'
          AND application.accepting_orders
          AND application.vendor_type IN ('retailer', 'wholesaler')
          AND NOT public.merchant_document_has_current_license(
              application.documents,
              CASE application.vendor_type
                  WHEN 'retailer' THEN 'liquor_licence'
                  ELSE 'wholesale_licence'
              END
          )
        RETURNING application.id, application.vendor_type
    )
    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    SELECT id, 'compliance_availability_paused', 'system',
        jsonb_build_object(
            'vendor_type', vendor_type,
            'reason', 'Alcohol licence is missing an expiry date or is expired.'
        )
    FROM paused;
    GET DIAGNOSTICS paused_count = ROW_COUNT;
    RETURN paused_count;
END;
$$;
REVOKE ALL ON FUNCTION public.pause_alcohol_vendors_without_current_licence()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_alcohol_vendors_without_current_licence()
    TO service_role;
SELECT public.pause_alcohol_vendors_without_current_licence();

CREATE TABLE IF NOT EXISTS public.merchant_vendor_ratings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT CHECK (review IS NULL OR char_length(review) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (application_id, order_id)
);
CREATE INDEX IF NOT EXISTS merchant_vendor_ratings_application_created_idx
    ON public.merchant_vendor_ratings (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_vendor_complaints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    issue_type TEXT NOT NULL CHECK (issue_type IN ('wrong_item', 'missing_item', 'warm', 'damaged', 'late', 'other')),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
    fault TEXT NOT NULL DEFAULT 'undecided'
        CHECK (fault IN ('undecided', 'vendor', 'rider', 'customer', 'platform')),
    vendor_reply TEXT CHECK (vendor_reply IS NULL OR char_length(vendor_reply) <= 2000),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS merchant_vendor_complaints_application_created_idx
    ON public.merchant_vendor_complaints (application_id, created_at DESC);

ALTER TABLE public.merchant_vendor_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_vendor_complaints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_vendor_ratings, public.merchant_vendor_complaints
    FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_vendor_ratings, public.merchant_vendor_complaints
    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.merchant_vendor_ratings_id_seq,
    public.merchant_vendor_complaints_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.capture_merchant_prep_commitment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    prep_minutes INTEGER;
    promised_at TIMESTAMPTZ;
BEGIN
    IF NEW.event_type = 'accepted' THEN
        SELECT coalesce(application.prep_target_minutes, config.target_prep_minutes)
        INTO prep_minutes
        FROM public.merchant_applications application
        JOIN public.merchant_vendor_score_config config
          ON config.vendor_type = application.vendor_type
        WHERE application.id = NEW.application_id;

        IF prep_minutes IS NOT NULL THEN
            NEW.details := coalesce(NEW.details, '{}'::JSONB) || jsonb_build_object(
                'prep_target_minutes', prep_minutes,
                'promised_ready_at', NEW.occurred_at + make_interval(mins => prep_minutes)
            );
        END IF;
    ELSIF NEW.event_type = 'ready' THEN
        SELECT (accepted.details->>'promised_ready_at')::TIMESTAMPTZ
        INTO promised_at
        FROM public.merchant_fulfillment_events accepted
        WHERE accepted.order_id = NEW.order_id
          AND accepted.application_id = NEW.application_id
          AND accepted.event_type = 'accepted'
        ORDER BY accepted.occurred_at DESC, accepted.id DESC
        LIMIT 1;

        IF promised_at IS NOT NULL THEN
            NEW.details := coalesce(NEW.details, '{}'::JSONB) || jsonb_build_object(
                'promised_ready_at', promised_at
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fulfillment_event_prep_commitment
    ON public.merchant_fulfillment_events;
CREATE TRIGGER merchant_fulfillment_event_prep_commitment
    BEFORE INSERT ON public.merchant_fulfillment_events
    FOR EACH ROW EXECUTE FUNCTION public.capture_merchant_prep_commitment();
REVOKE ALL ON FUNCTION public.capture_merchant_prep_commitment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_merchant_prep_commitment() TO service_role;

CREATE OR REPLACE VIEW public.merchant_vendor_performance
WITH (security_invoker = true)
AS
WITH decisions AS (
    SELECT *
    FROM public.merchant_vendor_scorecard_events
),
decision_metrics AS (
    SELECT
        application_id,
        count(*) FILTER (WHERE occurred_at >= now() - interval '7 days')::INTEGER AS decisions_7d,
        count(*) FILTER (WHERE event_type = 'accepted'
            AND occurred_at >= now() - interval '7 days')::INTEGER AS accepted_7d,
        count(*) FILTER (WHERE event_type = 'rejected'
            AND occurred_at >= now() - interval '7 days')::INTEGER AS rejected_7d,
        round(avg(response_seconds) FILTER (WHERE occurred_at >= now() - interval '7 days'))::INTEGER AS avg_response_seconds_7d,
        count(*) FILTER (WHERE occurred_at >= now() - interval '30 days')::INTEGER AS decisions_30d,
        count(*) FILTER (WHERE event_type = 'accepted'
            AND occurred_at >= now() - interval '30 days')::INTEGER AS accepted_30d,
        count(*) FILTER (WHERE event_type = 'rejected'
            AND occurred_at >= now() - interval '30 days')::INTEGER AS rejected_30d,
        round(avg(response_seconds) FILTER (WHERE occurred_at >= now() - interval '30 days'))::INTEGER AS avg_response_seconds_30d
    FROM decisions
    GROUP BY application_id
),
fulfilment_events AS (
    SELECT
        event.application_id,
        count(*) FILTER (WHERE event.event_type = 'delivered'
            AND event.occurred_at >= now() - interval '7 days')::INTEGER AS delivered_7d,
        count(*) FILTER (WHERE event.event_type = 'delivered'
            AND event.occurred_at >= now() - interval '30 days')::INTEGER AS delivered_30d,
        count(*) FILTER (WHERE event.event_type = 'exception'
            AND event.occurred_at >= now() - interval '7 days')::INTEGER AS exceptions_7d,
        count(*) FILTER (WHERE event.event_type = 'exception'
            AND event.occurred_at >= now() - interval '30 days')::INTEGER AS exceptions_30d
    FROM public.merchant_fulfillment_events event
    WHERE event.event_type IN ('delivered', 'exception')
    GROUP BY event.application_id
),
accepted_events AS (
    SELECT DISTINCT ON (application_id, order_id)
        application_id,
        order_id,
        occurred_at,
        details
    FROM public.merchant_fulfillment_events
    WHERE event_type = 'accepted'
    ORDER BY application_id, order_id, occurred_at, id
),
preparation AS (
    SELECT
        application.id AS application_id,
        round(avg(extract(epoch FROM (ready.occurred_at - accepted.occurred_at)) / 60)
            FILTER (WHERE accepted.occurred_at >= now() - interval '7 days'
                AND ready.occurred_at IS NOT NULL), 1) AS avg_prep_minutes_7d,
        round(avg(extract(epoch FROM (ready.occurred_at - accepted.occurred_at)) / 60)
            FILTER (WHERE accepted.occurred_at >= now() - interval '30 days'
                AND ready.occurred_at IS NOT NULL), 1) AS avg_prep_minutes_30d,
        round(100.0 * count(*) FILTER (WHERE accepted.occurred_at >= now() - interval '7 days'
                AND ready.occurred_at <= coalesce(
                    (accepted.details->>'promised_ready_at')::TIMESTAMPTZ,
                    accepted.occurred_at
                        + make_interval(mins => coalesce(application.prep_target_minutes, config.target_prep_minutes))
                ))
            / nullif(count(*) FILTER (WHERE accepted.occurred_at >= now() - interval '7 days'
                AND ready.occurred_at IS NOT NULL), 0), 1) AS ontime_pct_7d,
        round(100.0 * count(*) FILTER (WHERE accepted.occurred_at >= now() - interval '30 days'
                AND ready.occurred_at <= coalesce(
                    (accepted.details->>'promised_ready_at')::TIMESTAMPTZ,
                    accepted.occurred_at
                        + make_interval(mins => coalesce(application.prep_target_minutes, config.target_prep_minutes))
                ))
            / nullif(count(*) FILTER (WHERE accepted.occurred_at >= now() - interval '30 days'
                AND ready.occurred_at IS NOT NULL), 0), 1) AS ontime_pct_30d
    FROM accepted_events accepted
    JOIN public.merchant_applications application ON application.id = accepted.application_id
    JOIN public.merchant_vendor_score_config config ON config.vendor_type = application.vendor_type
    LEFT JOIN LATERAL (
        SELECT ready.occurred_at
        FROM public.merchant_fulfillment_events ready
        WHERE ready.application_id = application.id
          AND ready.event_type = 'ready'
          AND ready.order_id = accepted.order_id
          AND ready.occurred_at >= accepted.occurred_at
        ORDER BY ready.occurred_at, ready.id
        LIMIT 1
    ) ready ON true
    GROUP BY application.id, application.prep_target_minutes, config.target_prep_minutes
),
fulfilment AS (
    SELECT
        application.id AS application_id,
        coalesce(events.delivered_7d, 0) AS delivered_7d,
        coalesce(events.delivered_30d, 0) AS delivered_30d,
        coalesce(events.exceptions_7d, 0) AS exceptions_7d,
        coalesce(events.exceptions_30d, 0) AS exceptions_30d,
        preparation.avg_prep_minutes_7d,
        preparation.avg_prep_minutes_30d,
        preparation.ontime_pct_7d,
        preparation.ontime_pct_30d
    FROM public.merchant_applications application
    LEFT JOIN fulfilment_events events ON events.application_id = application.id
    LEFT JOIN preparation ON preparation.application_id = application.id
),
ratings AS (
    SELECT
        application_id,
        round(avg(rating) FILTER (WHERE created_at >= now() - interval '7 days'), 2) AS avg_rating_7d,
        round(avg(rating) FILTER (WHERE created_at >= now() - interval '30 days'), 2) AS avg_rating_30d
    FROM public.merchant_vendor_ratings
    GROUP BY application_id
),
complaints AS (
    SELECT
        application_id,
        count(*) FILTER (WHERE fault = 'vendor'
            AND created_at >= now() - interval '7 days')::INTEGER AS vendor_complaints_7d,
        count(*) FILTER (WHERE fault = 'vendor'
            AND created_at >= now() - interval '30 days')::INTEGER AS vendor_complaints_30d
    FROM public.merchant_vendor_complaints
    GROUP BY application_id
),
required_documents AS (
    SELECT
        application.id AS application_id,
        requirement.document_type,
        application.documents
    FROM public.merchant_applications application
    CROSS JOIN LATERAL (
        SELECT DISTINCT ON (candidate.document_type)
            candidate.document_type
        FROM public.merchant_document_requirements candidate
        WHERE candidate.is_active
          AND candidate.is_required
          AND candidate.business_type IN ('*', application.business_type)
          AND candidate.county IN ('*', lower(application.county))
        ORDER BY candidate.document_type,
            (candidate.business_type = application.business_type)::INTEGER * 2
                + (candidate.county = lower(application.county))::INTEGER * 3 DESC
    ) requirement
    WHERE application.vendor_type IS NOT NULL
    UNION ALL
    SELECT
        application.id AS application_id,
        CASE application.vendor_type
            WHEN 'retailer' THEN 'liquor_licence'
            WHEN 'wholesaler' THEN 'wholesale_licence'
        END AS document_type,
        application.documents
    FROM public.merchant_applications application
    WHERE application.vendor_type IN ('retailer', 'wholesaler')
      AND NOT EXISTS (
          SELECT 1
          FROM public.merchant_document_requirements existing
          WHERE existing.is_active AND existing.is_required
            AND existing.document_type = CASE application.vendor_type
                WHEN 'retailer' THEN 'liquor_licence'
                ELSE 'wholesale_licence'
            END
            AND existing.business_type IN ('*', application.business_type)
            AND existing.county IN ('*', lower(application.county))
      )
),
compliance AS (
    SELECT
        application_id,
        round(100.0 * count(*) FILTER (WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(coalesce(documents, '[]'::JSONB)) AS document
            WHERE document->>'type' = required_documents.document_type
              AND CASE
                  WHEN required_documents.document_type IN ('liquor_licence', 'wholesale_licence')
                      THEN public.merchant_document_has_current_license(
                          required_documents.documents,
                          required_documents.document_type
                      )
                  ELSE document->>'expiresAt' IS NULL
                      OR (document->>'expiresAt')::DATE >= CURRENT_DATE
              END
        )) / nullif(count(*), 0), 1) AS compliance_score
    FROM required_documents
    GROUP BY application_id
),
base AS (
    SELECT
        application.id AS application_id,
        application.business_name,
        application.business_type,
        application.vendor_type,
        application.town,
        application.accepting_orders,
        application.prep_target_minutes,
        config.target_reply_seconds,
        config.timeout_seconds,
        config.target_prep_minutes,
        config.target_acceptance_pct,
        config.target_ontime_pct,
        config.target_rating,
        config.target_complaints_per_100,
        config.min_decisions,
        config.shrink_k,
        config.weight_reply,
        config.weight_acceptance,
        config.weight_ontime,
        config.weight_rating,
        config.weight_complaints,
        coalesce(decisions.decisions_7d, 0) AS decisions_7d,
        coalesce(decisions.accepted_7d, 0) AS accepted_7d,
        coalesce(decisions.rejected_7d, 0) AS rejected_7d,
        decisions.avg_response_seconds_7d,
        coalesce(decisions.decisions_30d, 0) AS decisions_30d,
        coalesce(decisions.accepted_30d, 0) AS accepted_30d,
        coalesce(decisions.rejected_30d, 0) AS rejected_30d,
        decisions.avg_response_seconds_30d,
        coalesce(fulfilment.delivered_7d, 0) AS delivered_7d,
        coalesce(fulfilment.delivered_30d, 0) AS delivered_30d,
        coalesce(fulfilment.exceptions_7d, 0) AS exceptions_7d,
        coalesce(fulfilment.exceptions_30d, 0) AS exceptions_30d,
        fulfilment.avg_prep_minutes_7d,
        fulfilment.avg_prep_minutes_30d,
        fulfilment.ontime_pct_7d,
        fulfilment.ontime_pct_30d,
        ratings.avg_rating_7d,
        ratings.avg_rating_30d,
        coalesce(complaints.vendor_complaints_7d, 0) AS vendor_complaints_7d,
        coalesce(complaints.vendor_complaints_30d, 0) AS vendor_complaints_30d,
        round(100.0 * coalesce(complaints.vendor_complaints_7d, 0)
            / nullif(coalesce(fulfilment.delivered_7d, 0), 0), 1) AS complaints_per_100_7d,
        round(100.0 * coalesce(complaints.vendor_complaints_30d, 0)
            / nullif(coalesce(fulfilment.delivered_30d, 0), 0), 1) AS complaints_per_100_30d,
        compliance.compliance_score
    FROM public.merchant_applications application
    JOIN public.merchant_vendor_score_config config ON config.vendor_type = application.vendor_type
    LEFT JOIN decision_metrics decisions ON decisions.application_id = application.id
    LEFT JOIN fulfilment ON fulfilment.application_id = application.id
    LEFT JOIN ratings ON ratings.application_id = application.id
    LEFT JOIN complaints ON complaints.application_id = application.id
    LEFT JOIN compliance ON compliance.application_id = application.id
    WHERE application.status = 'approved'
),
raw_scored AS (
    SELECT
        base.*,
        (
            coalesce(weight_reply * greatest(0, least(100,
                100.0 * (1 - (avg_response_seconds_7d - target_reply_seconds)::NUMERIC
                    / nullif(timeout_seconds - target_reply_seconds, 0)))), 0)
            + coalesce(weight_acceptance * 100.0 * accepted_7d / nullif(decisions_7d, 0), 0)
            + coalesce(weight_ontime * ontime_pct_7d, 0)
            + coalesce(weight_rating * greatest(0, least(100, (avg_rating_7d - 3) * 50)), 0)
            + coalesce(weight_complaints * greatest(0, 100 - 10 * complaints_per_100_7d), 0)
        ) / nullif(
            (CASE WHEN avg_response_seconds_7d IS NOT NULL THEN weight_reply ELSE 0 END)
            + (CASE WHEN decisions_7d > 0 THEN weight_acceptance ELSE 0 END)
            + (CASE WHEN ontime_pct_7d IS NOT NULL THEN weight_ontime ELSE 0 END)
            + (CASE WHEN avg_rating_7d IS NOT NULL THEN weight_rating ELSE 0 END)
            + (CASE WHEN complaints_per_100_7d IS NOT NULL THEN weight_complaints ELSE 0 END),
            0
        ) AS raw_score_7d,
        (
            coalesce(weight_reply * greatest(0, least(100,
                100.0 * (1 - (avg_response_seconds_30d - target_reply_seconds)::NUMERIC
                    / nullif(timeout_seconds - target_reply_seconds, 0)))), 0)
            + coalesce(weight_acceptance * 100.0 * accepted_30d / nullif(decisions_30d, 0), 0)
            + coalesce(weight_ontime * ontime_pct_30d, 0)
            + coalesce(weight_rating * greatest(0, least(100, (avg_rating_30d - 3) * 50)), 0)
            + coalesce(weight_complaints * greatest(0, 100 - 10 * complaints_per_100_30d), 0)
        ) / nullif(
            (CASE WHEN avg_response_seconds_30d IS NOT NULL THEN weight_reply ELSE 0 END)
            + (CASE WHEN decisions_30d > 0 THEN weight_acceptance ELSE 0 END)
            + (CASE WHEN ontime_pct_30d IS NOT NULL THEN weight_ontime ELSE 0 END)
            + (CASE WHEN avg_rating_30d IS NOT NULL THEN weight_rating ELSE 0 END)
            + (CASE WHEN complaints_per_100_30d IS NOT NULL THEN weight_complaints ELSE 0 END),
            0
        ) AS raw_score_30d
    FROM base
),
scored AS (
    SELECT
        raw_scored.*,
        CASE
            WHEN raw_score_7d IS NULL THEN NULL
            WHEN decisions_7d + shrink_k = 0 THEN raw_score_7d
            ELSE (decisions_7d * raw_score_7d
                + shrink_k * avg(raw_score_7d) OVER (PARTITION BY vendor_type))
                / (decisions_7d + shrink_k)
        END AS score_7d,
        CASE
            WHEN raw_score_30d IS NULL THEN NULL
            WHEN decisions_30d + shrink_k = 0 THEN raw_score_30d
            ELSE (decisions_30d * raw_score_30d
                + shrink_k * avg(raw_score_30d) OVER (PARTITION BY vendor_type))
                / (decisions_30d + shrink_k)
        END AS score_30d
    FROM raw_scored
),
ranked AS (
    SELECT
        scored.*,
        CASE WHEN decisions_7d >= min_decisions
            THEN rank() OVER (PARTITION BY vendor_type, lower(town)
                ORDER BY CASE WHEN decisions_7d >= min_decisions THEN score_7d END DESC NULLS LAST)::INTEGER
            ELSE NULL END AS rank_7d,
        count(*) FILTER (WHERE decisions_7d >= min_decisions)
            OVER (PARTITION BY vendor_type, lower(town))::INTEGER AS zone_size_7d,
        CASE WHEN decisions_30d >= min_decisions
            THEN rank() OVER (PARTITION BY vendor_type, lower(town)
                ORDER BY CASE WHEN decisions_30d >= min_decisions THEN score_30d END DESC NULLS LAST)::INTEGER
            ELSE NULL END AS rank_30d,
        count(*) FILTER (WHERE decisions_30d >= min_decisions)
            OVER (PARTITION BY vendor_type, lower(town))::INTEGER AS zone_size_30d
    FROM scored
)
SELECT
    ranked.*,
    CASE
        WHEN score_7d >= 85 THEN 'A'
        WHEN score_7d >= 72 THEN 'B'
        WHEN score_7d >= 58 THEN 'C'
        WHEN score_7d IS NOT NULL THEN 'D'
        ELSE NULL
    END AS grade_7d,
    CASE
        WHEN score_30d >= 85 THEN 'A'
        WHEN score_30d >= 72 THEN 'B'
        WHEN score_30d >= 58 THEN 'C'
        WHEN score_30d IS NOT NULL THEN 'D'
        ELSE NULL
    END AS grade_30d
FROM ranked;

REVOKE ALL ON public.merchant_vendor_score_config, public.merchant_vendor_performance
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.merchant_vendor_score_config, public.merchant_vendor_performance
    TO service_role;

COMMIT;
