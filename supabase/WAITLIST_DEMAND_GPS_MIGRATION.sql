CREATE TABLE IF NOT EXISTS public.waitlist_demand_locations (
    waitlist_id UUID PRIMARY KEY
        REFERENCES public.market_waitlist(id) ON DELETE CASCADE,
    latitude NUMERIC(6, 3) NOT NULL,
    longitude NUMERIC(7, 3) NOT NULL,
    accuracy_m NUMERIC(7, 2) NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_demand_locations_latitude_check
        CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT waitlist_demand_locations_longitude_check
        CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT waitlist_demand_locations_accuracy_check
        CHECK (accuracy_m > 0 AND accuracy_m <= 250)
);

CREATE INDEX IF NOT EXISTS waitlist_demand_locations_grid_idx
    ON public.waitlist_demand_locations (latitude, longitude);

ALTER TABLE public.waitlist_demand_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_demand_locations FROM anon, authenticated;
GRANT ALL ON public.waitlist_demand_locations TO service_role;
