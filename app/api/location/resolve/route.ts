import { NextResponse } from 'next/server';
import { approximateArea, LOCATION_AREAS } from '@/lib/locationCatalog';

export async function POST(request: Request) {
  let body: { latitude?: unknown; longitude?: unknown; city?: unknown; county?: unknown; area?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Location coordinates were invalid.' }, { status: 400 });
  }

  const hasCoordinates = body.latitude !== undefined || body.longitude !== undefined;
  let area: { country: string; county: string; city: string; area: string } | null = null;
  if (hasCoordinates) {
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Location coordinates were outside the valid range.' }, { status: 400 });
    }
    area = approximateArea(
      Math.round(latitude * 100) / 100,
      Math.round(longitude * 100) / 100
    );
  } else {
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 100) : '';
    const county = typeof body.county === 'string' ? body.county.trim().slice(0, 80) : '';
    const areaName = typeof body.area === 'string' ? body.area.trim().slice(0, 100) : '';
    if (!city || !county || !areaName) {
      return NextResponse.json({ error: 'Choose a valid area to check service coverage.' }, { status: 400 });
    }
    const knownArea = LOCATION_AREAS.find((item) =>
      item.city.toLowerCase() === city.toLowerCase()
      && item.area.toLowerCase() === areaName.toLowerCase()
    );
    area = {
      country: 'Kenya',
      county: knownArea?.county || county,
      city,
      area: knownArea?.area || areaName
    };
  }

  if (!area) {
    return NextResponse.json({
      country: 'Kenya',
      county: 'Unspecified',
      city: 'Other Kenya',
      area: 'Please tell us your area',
      serviceAvailable: false
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  let dispatchZones = ['CBD', 'Westlands', 'Kilimani', 'Lavington', 'Kileleshwa', 'Karen', 'Langata', 'South C', 'South B', 'Embakasi', 'Roysambu', 'Kasarani', 'Kahawa', 'Githurai', 'Zimmerman', 'Utawala', 'Syokimau', 'Kitengela', 'Rongai', 'Ngong', 'Kikuyu', 'Thika Road', 'Mombasa Road'];

  if (url && serviceKey) {
    const { createClient } = await import('@supabase/supabase-js');
    const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await database.from('settings').select('value').eq('key', 'logistics').maybeSingle();
    if (error) {
      console.error('[Location] Could not load configured dispatch zones:', error);
      return NextResponse.json({ error: 'Delivery coverage could not be checked right now. Your area was not saved.' }, { status: 503 });
    }
    const configuredZones = data?.value && typeof data.value === 'object'
      ? (data.value as { dispatch_zones?: unknown }).dispatch_zones
      : null;
    if (Array.isArray(configuredZones) && configuredZones.every(zone => typeof zone === 'string')) {
      dispatchZones = configuredZones;
    }
  }

  return NextResponse.json({
    country: area.country,
    county: area.county,
    city: area.city,
    area: area.area,
    serviceAvailable: dispatchZones.some(zone => zone.toLowerCase() === area.area.toLowerCase())
  });
}
