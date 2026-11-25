import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { DEFAULT_CHECKOUT_LAUNCH_OFFER, parseCheckoutLaunchOffer } from '@/lib/checkoutLaunchOffer';

export const dynamic = 'force-dynamic';
const SETTING_KEY = 'checkout_launch_offer';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      enabled: Date.parse(DEFAULT_CHECKOUT_LAUNCH_OFFER.launchAt) > Date.now(),
      launchAt: DEFAULT_CHECKOUT_LAUNCH_OFFER.launchAt
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .eq('is_published', true)
    .maybeSingle();
  if (error) {
    console.error('[CheckoutLaunchOffer] Could not load the published launch offer:', error);
    return NextResponse.json({ error: 'The launch offer could not be loaded.' }, { status: 503 });
  }

  const offer = data ? parseCheckoutLaunchOffer(data.value) : DEFAULT_CHECKOUT_LAUNCH_OFFER;
  if (!offer) {
    console.error('[CheckoutLaunchOffer] The published launch offer is invalid.');
    return NextResponse.json({ error: 'The published launch offer is invalid.' }, { status: 503 });
  }

  return NextResponse.json({
    enabled: offer.enabled && Date.parse(offer.launchAt) > Date.now(),
    launchAt: offer.launchAt
  }, { headers: { 'Cache-Control': 'no-store' } });
}
