-- Structured, private onboarding details for alcohol retailers.
-- Verification decisions remain in the existing merchant application review flow.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql, DELIVERY_VENDOR_PERFORMANCE_MIGRATION.sql,
-- and MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql.

ALTER TABLE public.merchant_applications
    ADD COLUMN IF NOT EXISTS alcohol_onboarding JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.merchant_product_batches
    ADD COLUMN IF NOT EXISTS excise_stamp_confirmed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.merchant_document_requirements
    DROP CONSTRAINT IF EXISTS merchant_document_requirements_document_type_check;

ALTER TABLE public.merchant_document_requirements
    ADD CONSTRAINT merchant_document_requirements_document_type_check CHECK (document_type IN (
        'business_registration', 'county_license', 'liquor_licence',
        'online_alcohol_licence', 'wholesale_licence', 'government_id',
        'selfie_photo', 'shopfront_photo', 'business_permit', 'supplier_invoice',
        'kra_pin', 'medical_cert', 'food_hygiene', 'tax_document',
        'premises_document', 'other_permit'
    ));

INSERT INTO public.merchant_document_requirements (business_type, county, document_type, label, is_required)
VALUES
    ('bar', '*', 'government_id', 'National ID document', true),
    ('bar', '*', 'selfie_photo', 'Owner selfie for manual review', true),
    ('bar', '*', 'shopfront_photo', 'Shopfront photo', true),
    ('bar', '*', 'liquor_licence', 'County alcohol licence', true),
    ('bar', '*', 'online_alcohol_licence', 'Nairobi online alcohol licence', true),
    ('bar', '*', 'business_permit', 'Business permit', true),
    ('bar', '*', 'kra_pin', 'KRA PIN certificate', true),
    ('bar', '*', 'premises_document', 'Lease or premises proof', true),
    ('bar', '*', 'supplier_invoice', 'Supplier invoice', true)
ON CONFLICT (business_type, county, document_type) DO UPDATE
SET label = EXCLUDED.label,
    is_required = true,
    is_active = true;

CREATE OR REPLACE FUNCTION public.update_merchant_alcohol_rules(
    p_application_id UUID,
    p_actor TEXT,
    p_minimum_age INTEGER,
    p_maximum_bottles INTEGER,
    p_school_buffer_meters INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_profile JSONB;
BEGIN
    IF p_minimum_age NOT IN (18, 21)
       OR p_maximum_bottles NOT BETWEEN 1 AND 100
       OR p_school_buffer_meters NOT BETWEEN 0 AND 5000
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'Alcohol compliance settings are invalid.';
    END IF;

    SELECT alcohol_onboarding INTO current_profile
    FROM public.merchant_applications
    WHERE id = p_application_id
      AND status = 'approved'
      AND business_type = 'bar'
      AND vendor_type = 'retailer'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'An approved alcohol retailer is required.';
    END IF;

    UPDATE public.merchant_applications
    SET alcohol_onboarding = coalesce(current_profile, '{}'::JSONB) || jsonb_build_object(
            'rules', jsonb_build_object(
                'minimumAge', p_minimum_age,
                'maximumBottlesPerOrder', p_maximum_bottles,
                'schoolBufferMeters', p_school_buffer_meters
            ),
            'rulesUpdatedAt', now(),
            'rulesUpdatedBy', p_actor
        ),
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (p_application_id, 'alcohol_rules_updated', p_actor, jsonb_build_object(
        'minimum_age', p_minimum_age,
        'maximum_bottles_per_order', p_maximum_bottles,
        'school_buffer_meters', p_school_buffer_meters
    ));

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_alcohol_merchant_application(
    p_application_id UUID,
    p_review_note TEXT,
    p_actor TEXT,
    p_checks JSONB
)
RETURNS public.merchant_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    application_profile JSONB;
    reviewed_application public.merchant_applications;
BEGIN
    IF char_length(trim(coalesce(p_actor, ''))) < 1
       OR p_checks IS NULL
       OR jsonb_typeof(p_checks) IS DISTINCT FROM 'object'
       OR coalesce((p_checks->>'identity_verified')::BOOLEAN, false) IS NOT TRUE
       OR coalesce((p_checks->>'county_licence_verified')::BOOLEAN, false) IS NOT TRUE
       OR coalesce((p_checks->>'online_licence_verified')::BOOLEAN, false) IS NOT TRUE
       OR coalesce((p_checks->>'till_name_verified')::BOOLEAN, false) IS NOT TRUE
       OR coalesce((p_checks->>'premises_distance_verified')::BOOLEAN, false) IS NOT TRUE
       OR coalesce((p_checks->>'excise_and_supplier_documents_verified')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'All alcohol retailer manual verification checks must be completed before approval.';
    END IF;

    SELECT alcohol_onboarding INTO application_profile
    FROM public.merchant_applications
    WHERE id = p_application_id
      AND business_type = 'bar'
      AND vendor_type = 'retailer'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alcohol retailer application not found.';
    END IF;

    UPDATE public.merchant_applications
    SET alcohol_onboarding = coalesce(application_profile, '{}'::JSONB) || jsonb_build_object(
            'manualReview', p_checks || jsonb_build_object(
                'reviewedAt', now(),
                'reviewedBy', p_actor
            )
        ),
        updated_at = now()
    WHERE id = p_application_id;

    INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
    VALUES (p_application_id, 'alcohol_manual_checks_completed', p_actor, p_checks);

    reviewed_application := public.review_merchant_application(
        p_application_id, 'approved', p_review_note, p_actor
    );
    RETURN reviewed_application;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_merchant_counterfeit_incident(
    p_application_id UUID,
    p_batch_id UUID,
    p_description TEXT,
    p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    incident_row public.merchant_incidents%ROWTYPE;
BEGIN
    IF char_length(trim(coalesce(p_description, ''))) NOT BETWEEN 10 AND 5000
       OR char_length(trim(coalesce(p_actor, ''))) < 1 THEN
        RAISE EXCEPTION 'Counterfeit report details are invalid.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.merchant_applications application
        JOIN public.merchant_product_batches batch ON batch.application_id = application.id
        WHERE application.id = p_application_id
          AND application.status = 'approved'
          AND application.business_type = 'bar'
          AND application.vendor_type = 'retailer'
          AND batch.id = p_batch_id
    ) THEN
        RAISE EXCEPTION 'An approved retailer batch is required.';
    END IF;

    INSERT INTO public.merchant_incidents (
        application_id, batch_id, category, description, reporter_contact, created_by, severity
    )
    VALUES (
        p_application_id, p_batch_id, 'suspected_counterfeit', trim(p_description),
        p_actor, p_actor, 'high'
    )
    RETURNING * INTO incident_row;

    INSERT INTO public.merchant_batch_holds (batch_id, reason, placed_by)
    VALUES (
        p_batch_id,
        left('Suspected counterfeit: ' || trim(p_description), 2000),
        p_actor
    );

    RETURN jsonb_build_object(
        'id', incident_row.id,
        'incident_code', incident_row.incident_code,
        'category', incident_row.category,
        'description', incident_row.description,
        'status', incident_row.status,
        'severity', incident_row.severity,
        'created_at', incident_row.created_at,
        'batch_on_hold', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_merchant_product_batch_with_excise(
    p_application_id UUID,
    p_product_id BIGINT,
    p_lot_code TEXT,
    p_supplier_name TEXT,
    p_expiry_at DATE,
    p_quantity INTEGER,
    p_storage_notes TEXT,
    p_actor TEXT,
    p_excise_stamp_confirmed BOOLEAN
)
RETURNS public.merchant_product_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    received_batch public.merchant_product_batches;
BEGIN
    IF p_excise_stamp_confirmed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Excise stamp confirmation is required for alcohol stock.';
    END IF;

    received_batch := public.receive_merchant_product_batch(
        p_application_id, p_product_id, p_lot_code, p_supplier_name,
        p_expiry_at, p_quantity, p_storage_notes, p_actor
    );

    UPDATE public.merchant_product_batches
    SET excise_stamp_confirmed = true
    WHERE id = received_batch.id
    RETURNING * INTO received_batch;

    RETURN received_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.update_merchant_alcohol_rules(UUID, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_alcohol_rules(UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.approve_alcohol_merchant_application(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_alcohol_merchant_application(UUID, TEXT, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.report_merchant_counterfeit_incident(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_merchant_counterfeit_incident(UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.receive_merchant_product_batch_with_excise(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_merchant_product_batch_with_excise(UUID, BIGINT, TEXT, TEXT, DATE, INTEGER, TEXT, TEXT, BOOLEAN) TO service_role;

ALTER TABLE public.merchant_incidents
    DROP CONSTRAINT IF EXISTS merchant_incidents_category_check;

ALTER TABLE public.merchant_incidents
    ADD CONSTRAINT merchant_incidents_category_check CHECK (category IN (
        'product_quality', 'food_safety', 'delivery', 'conduct', 'other',
        'age_check_failed', 'suspected_counterfeit'
    ));

NOTIFY pgrst, 'reload schema';
