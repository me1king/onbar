-- Verified merchant business accounts with multiple independently managed locations.
-- Apply after MERCHANT_OPERATIONS_MIGRATION.sql and MERCHANT_ONBOARDING_EXPERIENCE_MIGRATION.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NULL
     OR to_regclass('public.merchant_application_events') IS NULL THEN
    RAISE EXCEPTION 'Merchant business branches require the merchant operations migrations.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.merchant_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  owner_email TEXT NOT NULL,
  business_name TEXT NOT NULL CHECK (char_length(trim(business_name)) BETWEEN 2 AND 160),
  business_type TEXT NOT NULL CHECK (business_type IN ('bar', 'food_vendor', 'supplier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_applications
  ADD COLUMN IF NOT EXISTS business_id UUID
    REFERENCES public.merchant_businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS merchant_applications_business_idx
  ON public.merchant_applications (business_id, status, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.merchant_business_branch_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.merchant_businesses(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_application_id UUID UNIQUE REFERENCES public.merchant_applications(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS merchant_business_branch_invites_business_idx
  ON public.merchant_business_branch_invites (business_id, created_at DESC);

ALTER TABLE public.merchant_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_business_branch_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_businesses, public.merchant_business_branch_invites
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_businesses, public.merchant_business_branch_invites TO service_role;

CREATE OR REPLACE FUNCTION public.create_merchant_business_for_owner(
  p_owner_user_id UUID,
  p_owner_email TEXT,
  p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_application public.merchant_applications%ROWTYPE;
  created_business public.merchant_businesses%ROWTYPE;
BEGIN
  IF p_owner_user_id IS NULL
     OR nullif(trim(p_owner_email), '') IS NULL
     OR p_application_id IS NULL THEN
    RAISE EXCEPTION 'A verified owner and approved primary location are required.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.merchant_businesses
    WHERE owner_user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'A business account already exists for this owner.';
  END IF;

  SELECT * INTO source_application
  FROM public.merchant_applications
  WHERE id = p_application_id
    AND status = 'approved'
    AND lower(email) = lower(trim(p_owner_email))
    AND business_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an approved location associated with your verified account email.';
  END IF;
  IF source_application.business_type NOT IN ('bar', 'food_vendor', 'supplier') THEN
    RAISE EXCEPTION 'Business accounts are currently available for alcohol retailers, food vendors, and suppliers.';
  END IF;

  INSERT INTO public.merchant_businesses (
    owner_user_id, owner_email, business_name, business_type
  )
  VALUES (
    p_owner_user_id, lower(trim(p_owner_email)), source_application.business_name,
    source_application.business_type
  )
  RETURNING * INTO created_business;

  UPDATE public.merchant_applications
  SET business_id = created_business.id
  WHERE id = source_application.id;

  INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
  VALUES (
    source_application.id,
    'business_account_created',
    trim(p_owner_email),
    jsonb_build_object('business_id', created_business.id)
  );

  RETURN jsonb_build_object(
    'id', created_business.id,
    'business_name', created_business.business_name,
    'business_type', created_business.business_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_merchant_business_branch_invite(
  p_token_hash TEXT,
  p_application_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invite public.merchant_business_branch_invites%ROWTYPE;
  application_business_type TEXT;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_application_id IS NULL THEN
    RAISE EXCEPTION 'Branch invitation details are invalid.';
  END IF;

  SELECT * INTO invite
  FROM public.merchant_business_branch_invites
  WHERE token_hash = p_token_hash
    AND expires_at > now()
    AND used_application_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This branch link is invalid, expired, or already used.';
  END IF;

  SELECT business_type INTO application_business_type
  FROM public.merchant_applications
  WHERE id = p_application_id AND status = 'submitted'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The submitted branch application could not be linked.';
  END IF;

  IF application_business_type IS DISTINCT FROM (
    SELECT business_type FROM public.merchant_businesses WHERE id = invite.business_id
  ) THEN
    RAISE EXCEPTION 'The branch business type does not match the business account.';
  END IF;

  UPDATE public.merchant_applications
  SET business_id = invite.business_id
  WHERE id = p_application_id;

  UPDATE public.merchant_business_branch_invites
  SET used_application_id = p_application_id
  WHERE id = invite.id;

  INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
  VALUES (
    p_application_id,
    'business_branch_application_linked',
    'applicant',
    jsonb_build_object('business_id', invite.business_id, 'invite_id', invite.id)
  );

  RETURN invite.business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_merchant_business_location_availability(
  p_owner_user_id UUID,
  p_business_id UUID,
  p_application_id UUID,
  p_accepting_orders BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_application_id UUID;
BEGIN
  IF p_accepting_orders IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.merchant_businesses
    WHERE id = p_business_id AND owner_user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'This business account cannot control the requested location.';
  END IF;

  UPDATE public.merchant_applications
  SET accepting_orders = p_accepting_orders,
      availability_updated_at = now()
  WHERE id = p_application_id
    AND business_id = p_business_id
    AND status = 'approved'
  RETURNING id INTO updated_application_id;
  IF updated_application_id IS NULL THEN
    RAISE EXCEPTION 'Only an approved location in this business account can be paused or resumed.';
  END IF;

  INSERT INTO public.merchant_application_events (application_id, event_type, actor, details)
  SELECT p_application_id,
         'owner_availability_updated',
         business.owner_email,
         jsonb_build_object('accepting_orders', p_accepting_orders)
  FROM public.merchant_businesses business
  WHERE business.id = p_business_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_merchant_business_for_owner(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_merchant_business_branch_invite(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_merchant_business_location_availability(UUID, UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_merchant_business_for_owner(UUID, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_merchant_business_branch_invite(TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_merchant_business_location_availability(UUID, UUID, UUID, BOOLEAN)
  TO service_role;

COMMIT;
