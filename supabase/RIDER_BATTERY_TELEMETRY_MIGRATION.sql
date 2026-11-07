ALTER TABLE public.rider_status
  ADD COLUMN IF NOT EXISTS battery_updated_at TIMESTAMPTZ;

ALTER TABLE public.rider_status
  ALTER COLUMN battery_level DROP DEFAULT,
  ALTER COLUMN battery_level DROP NOT NULL;

UPDATE public.rider_status
SET battery_level = NULL
WHERE battery_updated_at IS NULL;
