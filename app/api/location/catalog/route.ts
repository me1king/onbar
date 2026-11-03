import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import {
  DEFAULT_LOCATION_CATALOG,
  normalizeLocationCatalogConfig
} from '@/lib/locationCatalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ config: DEFAULT_LOCATION_CATALOG }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'location_catalog')
    .maybeSingle();
  if (error) {
    console.error('[LocationCatalog] Could not load the public area catalog:', error);
    return NextResponse.json({ error: 'Location options could not be loaded.' }, { status: 503 });
  }

  const config = data
    ? normalizeLocationCatalogConfig(data.value)
    : DEFAULT_LOCATION_CATALOG;
  if (!config) {
    console.error('[LocationCatalog] Saved area catalog has an invalid format.');
    return NextResponse.json({ error: 'Location options need to be reviewed by an administrator.' }, { status: 503 });
  }
  return NextResponse.json({ config }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  }
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Location settings management access is required.' }, { status: 403 });
  }

  let body: { config?: unknown };
  try {
    body = await request.json() as { config?: unknown };
  } catch {
    return NextResponse.json({ error: 'Valid location settings are required.' }, { status: 400 });
  }
  if (JSON.stringify(body).length > 500000) {
    return NextResponse.json({ error: 'Location settings are too large.' }, { status: 413 });
  }
  const config = normalizeLocationCatalogConfig(body.config);
  if (!config) {
    return NextResponse.json({
      error: 'Add at least one valid area. Counties, cities, and areas must be unique, and GPS coordinates must be complete and valid.'
    }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }
  const { error } = await database.from('settings').upsert({
    key: 'location_catalog',
    value: config,
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[LocationCatalog] Could not save location settings:', error);
    return NextResponse.json({ error: 'Location settings could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({ saved: true, config });
}
