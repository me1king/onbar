-- Admin-controlled per-ticket fees for the isolated Online Bar ticketing tables.
-- Apply after TICKETING_CORE_MIGRATION.sql.

BEGIN;

ALTER TABLE public.ticketing_events
    ADD COLUMN IF NOT EXISTS service_fee_minor BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.ticketing_events'::regclass
          AND conname = 'ticketing_events_service_fee_nonnegative'
    ) THEN
        ALTER TABLE public.ticketing_events
            ADD CONSTRAINT ticketing_events_service_fee_nonnegative
            CHECK (service_fee_minor >= 0);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_update_event_service_fee(
    p_event_id UUID,
    p_service_fee_minor BIGINT,
    p_actor_email TEXT,
    p_allow_on_sale BOOLEAN
)
RETURNS public.ticketing_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event public.ticketing_events%ROWTYPE;
    v_old_fee BIGINT;
BEGIN
    IF p_service_fee_minor IS NULL OR p_service_fee_minor NOT BETWEEN 0 AND 100000000 THEN
        RAISE EXCEPTION 'The service fee is outside the allowed range.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_event
    FROM public.ticketing_events
    WHERE id = p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF v_event.status NOT IN ('draft', 'scheduled', 'on_sale') THEN
        RAISE EXCEPTION 'Service fees cannot be changed for this event.' USING ERRCODE = 'P0001';
    END IF;
    IF v_event.status = 'on_sale' AND NOT COALESCE(p_allow_on_sale, false) THEN
        RAISE EXCEPTION 'Only the platform owner can change a service fee while sales are open.' USING ERRCODE = '42501';
    END IF;

    v_old_fee := v_event.service_fee_minor;
    UPDATE public.ticketing_events
    SET service_fee_minor = p_service_fee_minor,
        updated_at = now()
    WHERE id = p_event_id
    RETURNING * INTO v_event;

    INSERT INTO public.ticketing_audit_logs (
        actor_email, action, entity_type, entity_id, before_state, after_state
    ) VALUES (
        COALESCE(p_actor_email, ''), 'event.service_fee_changed', 'event', p_event_id::TEXT,
        jsonb_build_object('service_fee_minor', v_old_fee),
        jsonb_build_object('service_fee_minor', v_event.service_fee_minor)
    );
    RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_update_event_service_fee(UUID, BIGINT, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketing_update_event_service_fee(UUID, BIGINT, TEXT, BOOLEAN)
    TO service_role;

COMMIT;
