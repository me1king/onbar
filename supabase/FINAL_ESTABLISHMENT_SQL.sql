-- ==========================================
-- ONLINE BAR OS: MASTER ESTABLISHMENT V12 (THE BUZZ v2)
-- ==========================================
-- ⚠️ Instructions: Run this entire script in your Supabase SQL Editor once.
-- This establishes the complete city-discovery, venue promotion, and live-pulse grid.

-- 0. CORE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ... existing repair engine ... (re-pasting to ensure completeness)
-- REPAIR PRODUCTS
ALTER TABLE IF EXISTS public.products
ADD COLUMN IF NOT EXISTS is_snack BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sub_category TEXT,
ADD COLUMN IF NOT EXISTS low_stock_alert INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS image_quality_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_metadata JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS beverage_specs JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS tech_specs JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS variant_stock JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS old_price NUMERIC,
ADD COLUMN IF NOT EXISTS featured_rank INTEGER DEFAULT 99,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Live',
ADD COLUMN IF NOT EXISTS min_loyalty_tier TEXT DEFAULT 'Explorer';

-- REPAIR PROFILES
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS taste_dna JSONB DEFAULT '{"whiskey": 0, "wine": 0, "gin": 0, "beer": 0, "vodka": 0, "tequila": 0}'::JSONB,
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Newcomer',
ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS status_flag TEXT DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'New Customer',
ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'Standard',
ADD COLUMN IF NOT EXISTS preferred_comm_channel TEXT DEFAULT 'WhatsApp',
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT true;

-- ... existing tables ...

-- 12. THE BUZZ: LIVE CITY INTELLIGENCE
CREATE TABLE IF NOT EXISTS public.buzz_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- 'Bar', 'Club', 'Lounge', 'Restaurant', 'Rooftop'
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    opening_hours JSONB DEFAULT '{}'::JSONB,
    amenities TEXT[] DEFAULT ARRAY[]::TEXT[],
    price_band TEXT DEFAULT '$$',
    hero_image_url TEXT,
    gallery_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    rating NUMERIC DEFAULT 5.0,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venue_managers (
    venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'MANAGER', -- 'OWNER', 'MANAGER', 'ADVERTISER'
    PRIMARY KEY (venue_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.buzz_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.buzz_categories(id),
    status TEXT DEFAULT 'DRAFT', -- 'DRAFT', 'SUBMITTED', 'APPROVED', 'LIVE', 'ENDED'

    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_at TIMESTAMP WITH TIME ZONE NOT NULL,

    trend_score INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buzz_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buzz_id UUID REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.buzz_venues(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buzz_interests (
    buzz_id UUID REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    interest_type TEXT DEFAULT 'INTERESTED', -- 'INTERESTED', 'GOING'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (buzz_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.buzz_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buzz_id UUID REFERENCES public.buzz_posts(id) ON DELETE CASCADE,
    boost_type TEXT NOT NULL, -- 'SPOTLIGHT', 'AREA_BOOST', 'TRENDING'
    status TEXT DEFAULT 'ACTIVE',
    budget NUMERIC,
    reach_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 13. INTELLIGENCE: CALCULATE BUZZ LEVEL
CREATE OR REPLACE FUNCTION public.calculate_live_buzz_level(p_buzz_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_views INTEGER;
    v_interests INTEGER;
    v_updates INTEGER;
    v_score INTEGER;
BEGIN
    SELECT count(*) INTO v_views FROM public.session_forensics WHERE metadata->>'buzzId' = p_buzz_id::text;
    SELECT count(*) INTO v_interests FROM public.buzz_interests WHERE buzz_id = p_buzz_id;
    SELECT count(*) INTO v_updates FROM public.buzz_updates WHERE buzz_id = p_buzz_id AND created_at > (now() - interval '2 hours');

    v_score := (v_views * 1) + (v_interests * 5) + (v_updates * 20);
    RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql STABLE;

-- ... existing RPCs & Refresh ...
NOTIFY pgrst, 'reload schema';
