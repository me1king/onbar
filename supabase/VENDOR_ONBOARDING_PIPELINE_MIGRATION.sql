BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 1 AND 160),
  owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) BETWEEN 1 AND 160),
  phone TEXT NOT NULL CHECK (length(trim(phone)) BETWEEN 5 AND 40),
  whatsapp TEXT,
  area TEXT NOT NULL CHECK (length(trim(area)) BETWEEN 1 AND 160),
  vendor_type TEXT NOT NULL CHECK (vendor_type IN ('retailer', 'wholesaler', 'street_food', 'rider')),
  agent TEXT NOT NULL DEFAULT 'Unassigned',
  stage TEXT NOT NULL DEFAULT 'called'
    CHECK (stage IN ('called', 'phone_approved', 'visit_booked', 'visited_verified', 'test_order', 'live')),
  source TEXT,
  notes TEXT,
  first_call_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  visit_scheduled_at TIMESTAMPTZ,
  visit_at TIMESTAMPTZ,
  check_in_at TIMESTAMPTZ,
  check_in_lat NUMERIC(10, 7),
  check_in_lng NUMERIC(10, 7),
  test_order_passed BOOLEAN NOT NULL DEFAULT false,
  second_review_passed BOOLEAN NOT NULL DEFAULT false,
  launched_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((check_in_lat IS NULL) = (check_in_lng IS NULL)),
  CHECK (check_in_lat IS NULL OR check_in_lat BETWEEN -90 AND 90),
  CHECK (check_in_lng IS NULL OR check_in_lng BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_checklist (
  id BIGSERIAL PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.vendor_onboarding_leads(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  UNIQUE (lead_id, item_key),
  CHECK ((is_complete AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR (NOT is_complete AND completed_at IS NULL AND completed_by IS NULL))
);

ALTER TABLE public.vendor_onboarding_leads
  ADD COLUMN IF NOT EXISTS visit_scheduled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_events (
  id BIGSERIAL PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.vendor_onboarding_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_onboarding_leads_stage_idx
  ON public.vendor_onboarding_leads (stage, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_onboarding_leads_agent_idx
  ON public.vendor_onboarding_leads (agent, vendor_type, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_onboarding_checklist_lead_idx
  ON public.vendor_onboarding_checklist (lead_id, is_complete);
CREATE INDEX IF NOT EXISTS vendor_onboarding_events_lead_idx
  ON public.vendor_onboarding_events (lead_id, created_at DESC);

ALTER TABLE public.vendor_onboarding_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_onboarding_leads FROM anon, authenticated;
REVOKE ALL ON public.vendor_onboarding_checklist FROM anon, authenticated;
REVOKE ALL ON public.vendor_onboarding_events FROM anon, authenticated;
GRANT ALL ON public.vendor_onboarding_leads TO service_role;
GRANT ALL ON public.vendor_onboarding_checklist TO service_role;
GRANT ALL ON public.vendor_onboarding_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_onboarding_checklist_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_onboarding_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.create_vendor_onboarding_leads(
  p_leads JSONB,
  p_actor TEXT
)
RETURNS SETOF public.vendor_onboarding_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  submitted RECORD;
  created_lead public.vendor_onboarding_leads%ROWTYPE;
  lead_count INTEGER;
BEGIN
  IF jsonb_typeof(p_leads) <> 'array' THEN
    RAISE EXCEPTION 'A list of onboarding leads is required';
  END IF;
  lead_count := jsonb_array_length(p_leads);
  IF lead_count < 1 OR lead_count > 100 THEN
    RAISE EXCEPTION 'Add between 1 and 100 leads at a time';
  END IF;

  FOR submitted IN
    SELECT * FROM jsonb_to_recordset(p_leads) AS row_data(
      business_name TEXT,
      owner_name TEXT,
      phone TEXT,
      whatsapp TEXT,
      area TEXT,
      vendor_type TEXT,
      agent TEXT,
      source TEXT,
      notes TEXT
    )
  LOOP
    INSERT INTO public.vendor_onboarding_leads (
      business_name, owner_name, phone, whatsapp, area, vendor_type,
      agent, source, notes, created_by
    )
    VALUES (
      submitted.business_name, submitted.owner_name, submitted.phone, submitted.whatsapp,
      submitted.area, submitted.vendor_type, COALESCE(NULLIF(trim(submitted.agent), ''), 'Unassigned'),
      submitted.source, submitted.notes, p_actor
    )
    RETURNING * INTO created_lead;

    IF created_lead.vendor_type = 'retailer' THEN
      INSERT INTO public.vendor_onboarding_checklist (lead_id, item_key, label) VALUES
        (created_lead.id, 'owner_id_verified', 'Owner ID verified'),
        (created_lead.id, 'liquor_licence_verified', 'Current liquor licence verified'),
        (created_lead.id, 'payout_confirmed', 'Payout number confirmed'),
        (created_lead.id, 'catalog_ready', 'At least 10 catalog items and prices confirmed'),
        (created_lead.id, 'alert_tested', 'Order alert device tested'),
        (created_lead.id, 'agreement_signed', 'Vendor agreement signed');
    ELSIF created_lead.vendor_type = 'wholesaler' THEN
      INSERT INTO public.vendor_onboarding_checklist (lead_id, item_key, label) VALUES
        (created_lead.id, 'owner_id_verified', 'Owner ID verified'),
        (created_lead.id, 'wholesale_licence_verified', 'Wholesale and liquor licences verified'),
        (created_lead.id, 'payout_confirmed', 'Payout number confirmed'),
        (created_lead.id, 'catalog_ready', 'Catalog and bulk prices confirmed'),
        (created_lead.id, 'alert_tested', 'Order alert device tested'),
        (created_lead.id, 'agreement_signed', 'Vendor agreement signed');
    ELSIF created_lead.vendor_type = 'street_food' THEN
      INSERT INTO public.vendor_onboarding_checklist (lead_id, item_key, label) VALUES
        (created_lead.id, 'owner_id_verified', 'Owner ID verified'),
        (created_lead.id, 'food_hygiene_verified', 'Food hygiene certificate verified'),
        (created_lead.id, 'medical_certificate_verified', 'Food-handler medical certificate verified'),
        (created_lead.id, 'payout_confirmed', 'Payout number confirmed'),
        (created_lead.id, 'menu_ready', 'Menu and prices confirmed'),
        (created_lead.id, 'alert_tested', 'Order alert device tested'),
        (created_lead.id, 'agreement_signed', 'Vendor agreement signed');
    ELSE
      INSERT INTO public.vendor_onboarding_checklist (lead_id, item_key, label) VALUES
        (created_lead.id, 'identity_verified', 'Rider identity verified'),
        (created_lead.id, 'driving_licence_verified', 'Driving licence verified'),
        (created_lead.id, 'vehicle_plate_verified', 'Vehicle plate verified'),
        (created_lead.id, 'insurance_verified', 'Vehicle insurance verified'),
        (created_lead.id, 'good_conduct_verified', 'Certificate of good conduct verified'),
        (created_lead.id, 'training_quiz_passed', 'Rider training quiz passed'),
        (created_lead.id, 'agreement_signed', 'Rider agreement signed');
    END IF;

    INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
    VALUES (created_lead.id, 'lead_created', p_actor,
      jsonb_build_object('vendor_type', created_lead.vendor_type, 'agent', created_lead.agent));
    RETURN NEXT created_lead;
  END LOOP;
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

CREATE OR REPLACE FUNCTION public.schedule_vendor_onboarding_visit(
  p_lead_id UUID,
  p_visit_scheduled_at TIMESTAMPTZ,
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
  IF p_visit_scheduled_at IS NULL OR p_visit_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Choose a future visit date and time';
  END IF;

  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;
  IF current_lead.stage <> 'phone_approved' THEN
    RAISE EXCEPTION 'A visit can only be scheduled after phone approval';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET visit_scheduled_at = p_visit_scheduled_at, updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'visit_scheduled', p_actor,
    jsonb_build_object('visit_scheduled_at', p_visit_scheduled_at));
  RETURN updated_lead;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_onboarding_checklist_item(
  p_lead_id UUID,
  p_item_key TEXT,
  p_is_complete BOOLEAN,
  p_actor TEXT
)
RETURNS public.vendor_onboarding_checklist
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_lead public.vendor_onboarding_leads%ROWTYPE;
  updated_item public.vendor_onboarding_checklist%ROWTYPE;
BEGIN
  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;
  IF current_lead.stage <> 'visit_booked' THEN
    RAISE EXCEPTION 'The visit checklist can only be updated during a booked visit';
  END IF;

  UPDATE public.vendor_onboarding_checklist
  SET is_complete = p_is_complete,
      completed_at = CASE WHEN p_is_complete THEN now() ELSE NULL END,
      completed_by = CASE WHEN p_is_complete THEN p_actor ELSE NULL END
  WHERE lead_id = p_lead_id AND item_key = p_item_key
  RETURNING * INTO updated_item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding checklist item not found';
  END IF;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'checklist_updated', p_actor,
    jsonb_build_object('item_key', p_item_key, 'is_complete', p_is_complete));
  RETURN updated_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vendor_onboarding_lead(
  p_lead_id UUID,
  p_agent TEXT,
  p_notes TEXT,
  p_actor TEXT
)
RETURNS public.vendor_onboarding_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_lead public.vendor_onboarding_leads%ROWTYPE;
BEGIN
  IF length(trim(p_agent)) NOT BETWEEN 1 AND 160 OR length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Agent and notes are outside the allowed length';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET agent = trim(p_agent), notes = NULLIF(trim(p_notes), ''), updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'lead_updated', p_actor,
    jsonb_build_object('agent', updated_lead.agent, 'notes_updated', true));
  RETURN updated_lead;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_vendor_onboarding_checkin(
  p_lead_id UUID,
  p_lat NUMERIC,
  p_lng NUMERIC,
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
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid visit coordinates';
  END IF;

  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;
  IF current_lead.stage <> 'visit_booked' THEN
    RAISE EXCEPTION 'Field check-in is only available for a booked visit';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET check_in_at = now(), check_in_lat = p_lat, check_in_lng = p_lng, updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'field_check_in', p_actor,
    jsonb_build_object('latitude', p_lat, 'longitude', p_lng));
  RETURN updated_lead;
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
  IF p_check <> 'test_order' THEN
    RAISE EXCEPTION 'Unsupported launch check';
  END IF;

  SELECT * INTO current_lead
  FROM public.vendor_onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;
  IF current_lead.stage <> 'test_order' THEN
    RAISE EXCEPTION 'Launch checks are only available during the test-order stage';
  END IF;
  UPDATE public.vendor_onboarding_leads
  SET test_order_passed = p_passed,
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'launch_check_updated', p_actor,
    jsonb_build_object('check', p_check, 'passed', p_passed, 'review_mode', 'single_admin'));
  RETURN updated_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_onboarding_leads(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_vendor_onboarding_lead(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_vendor_onboarding_visit(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_vendor_onboarding_checklist_item(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_vendor_onboarding_lead(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_vendor_onboarding_checkin(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_vendor_onboarding_launch_checks(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_onboarding_leads(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_vendor_onboarding_lead(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_vendor_onboarding_visit(UUID, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_onboarding_checklist_item(UUID, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_vendor_onboarding_lead(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_vendor_onboarding_checkin(UUID, NUMERIC, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_onboarding_launch_checks(UUID, TEXT, BOOLEAN, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
