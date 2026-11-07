BEGIN;

ALTER TABLE public.rider_account_security_events
  DROP CONSTRAINT IF EXISTS rider_account_security_events_action_check;

ALTER TABLE public.rider_account_security_events
  ADD CONSTRAINT rider_account_security_events_action_check
  CHECK (action IN ('approved', 'pin_reset', 'pin_changed'));

CREATE OR REPLACE FUNCTION public.change_rider_pin(
  phone_input TEXT,
  current_pin_input TEXT,
  new_pin_input TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rider_id BIGINT;
  stored_pin TEXT;
BEGIN
  IF phone_input IS NULL OR length(trim(phone_input)) NOT BETWEEN 1 AND 50
     OR current_pin_input IS NULL
     OR new_pin_input IS NULL
     OR current_pin_input !~ '^[0-9]{4}$'
     OR new_pin_input !~ '^[0-9]{4}$'
     OR new_pin_input = '0000'
     OR new_pin_input = current_pin_input THEN
    RAISE EXCEPTION 'Invalid rider PIN change.';
  END IF;

  SELECT rider.id, rider.pin
  INTO rider_id, stored_pin
  FROM public.rider_status AS rider
  WHERE rider.rider_phone = phone_input
    AND rider.verification_status = 'Verified'
  FOR UPDATE;

  IF NOT FOUND OR stored_pin IS NULL
     OR stored_pin IS DISTINCT FROM crypt(current_pin_input, stored_pin) THEN
    RETURN false;
  END IF;

  UPDATE public.rider_status
  SET pin = crypt(new_pin_input, gen_salt('bf')),
      updated_at = now()
  WHERE id = rider_id;

  INSERT INTO public.rider_account_security_events (rider_phone, action, actor)
  VALUES (phone_input, 'pin_changed', 'rider-self-service');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.change_rider_pin(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_rider_pin(TEXT, TEXT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
