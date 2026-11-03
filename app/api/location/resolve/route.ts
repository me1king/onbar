import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  approximateArea,
  DEFAULT_LOCATION_CATALOG,
  normalizeLocationCatalogConfig
} from '@/lib/locationCatalog';

export async function POST(request: Request) {
  let body: { latitude?: unknown; longitude?: unknown; city?: unknown; county?: unknown; area?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Location coordinates were invalid.' }, { status: 400 });
  }

  const hasCoordinates = body.latitude !== undefined || body.longitude !== undefined;
  const database = createServerSupabaseClient();
  let catalog = DEFAULT_LOCATION_CATALOG;
  let dispatchZones = ['CBD', 'Westlands', 'Kilimani', 'Lavington', 'Kileleshwa', 'Karen', 'Langata', 'South C', 'South B', 'Embakasi', 'Roysambu', 'Kasarani', 'Kahawa', 'Githurai', 'Zimmerman', 'Utawala', 'Syokimau', 'Kitengela', 'Rongai', 'Ngong', 'Kikuyu', 'Thika Road', 'Mombasa Road'];
  if (database) {
    const { data: settings, error } = await database.from('settings')
      .select('key,value')
      .in('key', ['logistics', 'location_catalog']);
    if (error) {
      console.error('[Location] Could not load location and delivery settings:', error);
      return NextResponse.json({ error: 'Delivery coverage could not be checked right now. Your area was not saved.' }, { status: 503 });
    }
    const locationSetting = settings?.find((setting) => setting.key === 'location_catalog');
    if (locationSetting) {
      const savedCatalog = normalizeLocationCatalogConfig(locationSetting.value);
      if (!savedCatalog) {
        console.error('[Location] Saved area catalog has an invalid format.');
        return NextResponse.json({ error: 'Location options need to be reviewed by an administrator.' }, { status: 503 });
      }
      catalog = savedCatalog;
    }
    const logisticsSetting = settings?.find((setting) => setting.key === 'logistics');
    const configuredZones = logisticsSetting?.value && typeof logisticsSetting.value === 'object'
      ? (logisticsSetting.value as { dispatch_zones?: unknown }).dispatch_zones
      : null;
    if (Array.isArray(configuredZones) && configuredZones.every(zone => typeof zone === 'string')) {
      dispatchZones = configuredZones;
    }
  }

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
      Math.round(longitude * 100) / 100,
      catalog.areas
    );
  } else {
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 100) : '';
    const county = typeof body.county === 'string' ? body.county.trim().slice(0, 80) : '';
    const areaName = typeof body.area === 'string' ? body.area.trim().slice(0, 100) : '';
    if (!city || !county || !areaName) {
      return NextResponse.json({ error: 'Choose a valid area to check service coverage.' }, { status: 400 });
    }
    const knownArea = catalog.areas.find((item) =>
      item.county.toLowerCase() === county.toLowerCase()
      && item.city.toLowerCase() === city.toLowerCase()
      && item.area.toLowerCase() === areaName.toLowerCase()
    ) || catalog.areas.find((item) =>
      item.county.toLowerCase() === county.toLowerCase()
      && item.area.toLowerCase() === areaName.toLowerCase()
    );
    area = knownArea || {
      country: 'Kenya',
      county,
      city,
      area: areaName
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

  return NextResponse.json({
    country: area.country,
    county: area.county,
    city: area.city,
    area: area.area,
    serviceAvailable: dispatchZones.some(zone => zone.toLowerCase() === area.area.toLowerCase())
  });
}
