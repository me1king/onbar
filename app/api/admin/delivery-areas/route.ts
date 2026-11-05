import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { parseDeliveryAreas, parseDeliveryPricing } from '@/lib/deliveryAreas';

export const dynamic = 'force-dynamic';

const settingKeys = ['free_delivery_areas', 'delivery_pricing', 'logistics'] as const;
type DeliverySettingKey = typeof settingKeys[number];

function isDeliverySettingKey(value: unknown): value is DeliverySettingKey {
  return typeof value === 'string' && settingKeys.includes(value as DeliverySettingKey);
}

function isMissingSettingColumn(error: { code?: string; message?: string }) {
  return error.code === '42703' || error.code === 'PGRST204'
    || /is_published|updated_at/i.test(error.message || '');
}

async function authorize() {
  const session = await getAdminSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  }
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return { response: NextResponse.json({ error: 'Delivery settings management access is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 }) };
  }
  return { database };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const { data, error } = await access.database.from('settings')
    .select('key,value')
    .in('key', [...settingKeys]);
  if (error) {
    console.error('[DeliveryAreas] Could not load delivery settings:', error);
    return NextResponse.json({ error: 'Delivery settings could not be loaded.' }, { status: 503 });
  }

  const settings = Object.fromEntries((data || []).map(setting => [setting.key, setting.value]));
  return NextResponse.json({
    areas: settings.free_delivery_areas ?? [],
    pricing: settings.delivery_pricing ?? { free_delivery_over: 3000 },
    logistics: settings.logistics ?? null
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid delivery settings data is required.' }, { status: 400 });
  }
  if (!isDeliverySettingKey(body.key) || JSON.stringify(body).length > 500_000) {
    return NextResponse.json({ error: 'Delivery settings data is invalid or too large.' }, { status: 400 });
  }

  let value: unknown;
  try {
    if (body.key === 'free_delivery_areas') {
      const areas = parseDeliveryAreas(body.value);
      value = areas;
      if (areas.length > 500) throw new Error('You can save up to 500 delivery zones.');
      const names = new Set<string>();
      for (const area of areas) {
        const normalizedName = area.name.trim().toLowerCase();
        if (names.has(normalizedName)) throw new Error(`The delivery zone "${area.name.trim()}" is listed more than once.`);
        names.add(normalizedName);
      }
    } else if (body.key === 'delivery_pricing') {
      value = parseDeliveryPricing(body.value);
    } else {
      if (typeof body.value !== 'object' || body.value === null || Array.isArray(body.value)) {
        throw new Error('Dispatch settings must be an object.');
      }
      value = body.value;
    }
  } catch (validationError) {
    return NextResponse.json({
      error: validationError instanceof Error ? validationError.message : 'Delivery settings are invalid.'
    }, { status: 400 });
  }

  const { error } = await access.database.from('settings').upsert({
    key: body.key,
    value,
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[DeliveryAreas] Could not save delivery settings:', error);
    if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
      return NextResponse.json({
        error: 'Supabase rejected the delivery settings write. Confirm SUPABASE_SERVICE_ROLE_KEY is configured for this project and redeploy.'
      }, { status: 503 });
    }
    if (isMissingSettingColumn(error)) {
      return NextResponse.json({
        error: 'The settings table is missing required columns. Apply the project settings migration before saving delivery zones.'
      }, { status: 503 });
    }
    return NextResponse.json({ error: `Delivery settings could not be saved: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ saved: true, key: body.key });
}
