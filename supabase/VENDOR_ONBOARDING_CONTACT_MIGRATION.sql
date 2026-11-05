-- Allow authorized admins to update lead contact numbers with an audit event.
-- Run after VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql.

DO $$
BEGIN
  IF to_regclass('public.vendor_onboarding_leads') IS NULL
    OR to_regclass('public.vendor_onboarding_events') IS NULL THEN
    RAISE EXCEPTION 'Vendor onboarding contact updates require the pipeline tables.'
      USING HINT = 'Run supabase/VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.vendor_onboarding_leads
  ALTER COLUMN owner_name DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.vendor_onboarding_leads
  DROP CONSTRAINT IF EXISTS vendor_onboarding_leads_owner_name_check,
  DROP CONSTRAINT IF EXISTS vendor_onboarding_leads_phone_check,
  ADD CONSTRAINT vendor_onboarding_leads_owner_name_check
    CHECK (owner_name IS NULL OR length(trim(owner_name)) BETWEEN 1 AND 160),
  ADD CONSTRAINT vendor_onboarding_leads_phone_check
    CHECK (phone IS NULL OR length(trim(phone)) BETWEEN 5 AND 40);

CREATE OR REPLACE FUNCTION public.update_vendor_onboarding_contact(
  p_lead_id UUID,
  p_phone TEXT,
  p_whatsapp TEXT,
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
  IF length(trim(p_phone)) NOT BETWEEN 5 AND 40
    OR (p_whatsapp IS NOT NULL AND length(trim(p_whatsapp)) > 40) THEN
    RAISE EXCEPTION 'Lead phone number is outside the allowed length';
  END IF;

  UPDATE public.vendor_onboarding_leads
  SET phone = trim(p_phone),
      whatsapp = NULLIF(trim(p_whatsapp), ''),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO updated_lead;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding lead not found';
  END IF;

  INSERT INTO public.vendor_onboarding_events (lead_id, event_type, actor, details)
  VALUES (p_lead_id, 'lead_contact_updated', p_actor,
    jsonb_build_object('phone_updated', true, 'whatsapp_updated', true));

  RETURN updated_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.update_vendor_onboarding_contact(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_onboarding_contact(UUID, TEXT, TEXT, TEXT)
  TO service_role;
