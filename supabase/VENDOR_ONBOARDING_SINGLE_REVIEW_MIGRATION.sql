-- Remove the mandatory second-person review from the internal vendor launch
-- pipeline. A real, recorded test order remains required before launch.
-- Run after VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.vendor_onboarding_leads') IS NULL
     OR to_regclass('public.vendor_onboarding_checklist') IS NULL
     OR to_regclass('public.vendor_onboarding_events') IS NULL THEN
    RAISE EXCEPTION 'Vendor onboarding pipeline migration is required first.'
      USING HINT = 'Run supabase/VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql first.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_vendor_onboarding_lead(
  p_lead_id UUID,
  p_stage TEXT,
  p_actor TEXT
)
RETURNS public.vendor_onboarding_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_lead public.vendor_onboarding_leads%ROWTYPE;
  stages TEXT[] := ARRAY['called', 'phone_approved', 'visit_booked', 'visited_verified', 'test_order', 'live'];
  current_index INTEGER;
  requested_index INTEGER;
BEGIN
  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;

  current_index := array_position(stages, current_lead.stage);
  requested_index := array_position(stages, p_stage);
  IF requested_index IS NULL OR requested_index <> current_index + 1 THEN
    RAISE EXCEPTION 'Only the next onboarding stage is permitted';
  END IF;

  IF p_stage = 'visit_booked' AND (
    current_lead.visit_scheduled_at IS NULL OR current_lead.visit_scheduled_at <= now()
  ) THEN
    RAISE EXCEPTION 'Schedule a future visit before moving this lead to visit booked';
  END IF;

  IF p_stage = 'visited_verified' AND EXISTS (
    SELECT 1 FROM public.vendor_onboarding_checklist
    WHERE lead_id = p_lead_id AND is_required AND NOT is_complete
  ) THEN
    RAISE EXCEPTION 'Complete and verify the required visit checklist before this stage';
  END IF;

  IF p_stage = 'visited_verified' AND current_lead.check_in_at IS NULL THEN
    RAISE EXCEPTION 'A field visit check-in is required before verification';
  END IF;

  IF p_stage = 'live' AND NOT current_lead.test_order_passed THEN
    RAISE EXCEPTION 'A passed test order is required before launch';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET stage = p_stage,
      approved_at = CASE WHEN p_stage = 'phone_approved' THEN now() ELSE approved_at END,
      visit_at = CASE WHEN p_stage = 'visit_booked' THEN now() ELSE visit_at END,
      launched_at = CASE WHEN p_stage = 'live' THEN now() ELSE launched_at END,
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO current_lead;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'stage_changed', p_actor,
    jsonb_build_object('stage', p_stage, 'visit_scheduled_at', current_lead.visit_scheduled_at));
  RETURN current_lead;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_onboarding_launch_checks(
  p_lead_id UUID,
  p_check TEXT,
  p_passed BOOLEAN,
  p_actor TEXT
)
RETURNS public.vendor_onboarding_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_lead public.vendor_onboarding_leads%ROWTYPE;
  updated_lead public.vendor_onboarding_leads%ROWTYPE;
BEGIN
  IF p_check IS DISTINCT FROM 'test_order' THEN
    RAISE EXCEPTION 'Only the test-order result needs to be recorded';
  END IF;

  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;
  IF current_lead.stage <> 'test_order' THEN
    RAISE EXCEPTION 'Test-order results can only be recorded during the test-order stage';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET test_order_passed = p_passed,
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'launch_check_updated', p_actor,
    jsonb_build_object('check', p_check, 'passed', p_passed, 'review_mode', 'single_admin'));
  RETURN updated_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_vendor_onboarding_lead(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_vendor_onboarding_launch_checks(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_vendor_onboarding_lead(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_onboarding_launch_checks(UUID, TEXT, BOOLEAN, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
