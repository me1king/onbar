import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  points: {
    order_earn_percent: 5,
    points_per_ksh: 10,
    photo_review: 50,
    referral_bonus: 100,
    welcome_back_bonus: 50
  },
  rewards: {
    crate_probabilities: [],
    spin_probabilities: []
  }
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Loyalty settings are not configured.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await database
    .from('loyalty_config')
    .select('value')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    console.error('[LoyaltyConfig] Could not load public rewards config:', error);
    return NextResponse.json({ error: 'Could not load loyalty settings.' }, { status: 503 });
  }

  return NextResponse.json({ config: data?.value ?? DEFAULT_CONFIG }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
