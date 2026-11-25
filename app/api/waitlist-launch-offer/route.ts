import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { DEFAULT_WAITLIST_LAUNCH_OFFER, parseWaitlistLaunchOffer } from '@/lib/waitlistLaunchOffer';

export const dynamic = 'force-dynamic';
const SETTING_KEY = 'waitlist_launch_offer';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      enabled: Date.parse(DEFAULT_WAITLIST_LAUNCH_OFFER.launchAt) > Date.now(),
      launchAt: DEFAULT_WAITLIST_LAUNCH_OFFER.launchAt
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .eq('is_published', true)
    .maybeSingle();
  if (error) {
    console.error('[WaitlistLaunchOffer] Could not load the published launch offer:', error);
    return NextResponse.json({ error: 'The waitlist launch offer could not be loaded.' }, { status: 503 });
  }

  const offer = data ? parseWaitlistLaunchOffer(data.value) : DEFAULT_WAITLIST_LAUNCH_OFFER;
  if (!offer) {
    console.error('[WaitlistLaunchOffer] The published launch offer is invalid.');
    return NextResponse.json({ error: 'The published launch offer is invalid.' }, { status: 503 });
  }

  return NextResponse.json({
    enabled: offer.enabled && Date.parse(offer.launchAt) > Date.now(),
    launchAt: offer.launchAt
  }, { headers: { 'Cache-Control': 'no-store' } });
}
