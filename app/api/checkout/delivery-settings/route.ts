import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { parseDeliveryAreas, parseDeliveryPricing } from '@/lib/deliveryAreas';

export const dynamic = 'force-dynamic';

const settingKeys = ['free_delivery_areas', 'delivery_pricing'] as const;

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Delivery settings are not configured.' }, { status: 503 });
  }

  let data;
  try {
    const result = await database.from('settings')
      .select('key,value')
      .eq('is_published', true)
      .in('key', [...settingKeys])
      .abortSignal(AbortSignal.timeout(8_000));
    if (result.error) {
      console.error('[CheckoutDeliverySettings] Could not load delivery settings:', result.error);
      return NextResponse.json({ error: 'Delivery settings could not be loaded. Please retry.' }, { status: 503 });
    }
    data = result.data;
  } catch (error) {
    console.error('[CheckoutDeliverySettings] Delivery settings query failed:', error);
    return NextResponse.json({
      error: 'The delivery settings service returned an invalid response. Please contact support and try again later.'
    }, { status: 503 });
  }

  const settings = new Map((data || []).map(setting => [setting.key, setting.value]));
  try {
    return NextResponse.json({
      areas: parseDeliveryAreas(settings.get('free_delivery_areas') ?? []),
      pricing: parseDeliveryPricing(settings.get('delivery_pricing'))
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (validationError) {
    console.error('[CheckoutDeliverySettings] Published delivery settings are invalid:', validationError);
    return NextResponse.json({ error: 'Delivery settings need to be reviewed by the store. Please retry later.' }, { status: 503 });
  }
}
