import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { loadDemandIntelligenceFallback } from '@/lib/demandIntelligenceFallback';
import { parseDeliveryAreas } from '@/lib/deliveryAreas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (!['owner', 'admin'].includes(session.role) && session.permissions.can_view_revenue !== true)) {
    return NextResponse.json({ error: 'Revenue analytics access is required.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Demand intelligence database access is not configured.' }, { status: 503 });
  }

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(7, Math.floor(requestedDays))) : 30;
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rpcData, error } = await database.rpc('get_demand_intelligence', { p_days: days });
  let data = rpcData;
  if (error && (error.code === '42883' || error.code === 'PGRST202')) {
    try {
      console.warn('[DemandIntelligence] Aggregate RPC is missing; using the server-side table fallback.');
      data = await loadDemandIntelligenceFallback(database, days);
    } catch (fallbackError) {
      console.error('[DemandIntelligence] Could not load demand data using the table fallback:', fallbackError);
      const tablesMissing = fallbackError instanceof Error
        && /could not find the table|schema cache/i.test(fallbackError.message);
      return NextResponse.json({
        error: tablesMissing
          ? 'Demand location tables are not installed in this Supabase project. Run supabase/DEMAND_INTELLIGENCE_MIGRATION.sql in its SQL Editor, then refresh.'
          : 'Demand intelligence is only partially installed. Run supabase/DEMAND_INTELLIGENCE_MIGRATION.sql in Supabase, then retry.'
      }, { status: 503 });
    }
  } else if (error) {
    console.error('[DemandIntelligence] Could not load location aggregates:', error);
    return NextResponse.json({
      error: 'Demand intelligence data could not be loaded. Check the Supabase connection and migration status.'
    }, { status: 503 });
  }

  const { data: deliverySettings, error: logisticsError } = await database
    .from('settings')
    .select('key,value')
    .in('key', ['logistics', 'free_delivery_areas']);
  if (logisticsError) {
    console.error('[DemandIntelligence] Could not read dispatch coverage settings:', logisticsError);
    return NextResponse.json({ error: 'Demand data loaded, but configured service areas could not be checked.' }, { status: 503 });
  }
  const deliveryAreasSetting = deliverySettings?.find(setting => setting.key === 'free_delivery_areas');
  const logisticsSetting = deliverySettings?.find(setting => setting.key === 'logistics');
  let dispatchZones: string[];
  if (deliveryAreasSetting) {
    try {
      dispatchZones = parseDeliveryAreas(deliveryAreasSetting.value).map(area => area.name);
    } catch (parseError) {
      console.error('[DemandIntelligence] Saved delivery zones are invalid:', parseError);
      return NextResponse.json({ error: 'Configured delivery zones could not be checked. Review the Delivery Zone Map settings.' }, { status: 503 });
    }
  } else {
    const configuredZones = logisticsSetting?.value && typeof logisticsSetting.value === 'object'
      ? (logisticsSetting.value as { dispatch_zones?: unknown }).dispatch_zones
      : null;
    dispatchZones = Array.isArray(configuredZones)
      && configuredZones.every((zone) => typeof zone === 'string')
      ? configuredZones as string[]
      : ['CBD', 'Westlands', 'Kilimani', 'Lavington', 'Kileleshwa', 'Karen', 'Langata', 'South C', 'South B', 'Embakasi', 'Roysambu', 'Kasarani', 'Kahawa', 'Githurai', 'Zimmerman', 'Utawala', 'Syokimau', 'Kitengela', 'Rongai', 'Ngong', 'Kikuyu', 'Thika Road', 'Mombasa Road'];
  }
  const result = data as {
    days?: number;
    locations?: Array<{ area?: string }>;
    waitlistContacts?: Array<{
      id: string;
      email: string;
      phone: string | null;
      county: string;
      city: string;
      area: string;
      source: string;
      status: string;
      createdAt: string;
      fullName?: string | null;
    }>;
    [key: string]: unknown;
  };
  const contacts = result.waitlistContacts || [];
  if (contacts.length) {
    const { data: people, error: peopleError } = await database
      .from('market_waitlist')
      .select('id,full_name')
      .eq('notification_consent', true)
      .in('id', contacts.map((contact) => contact.id));
    if (peopleError) {
      console.error('[DemandIntelligence] Could not load opted-in contact names:', peopleError);
      return NextResponse.json({
        error: 'Contact names are unavailable. Run supabase/DEMAND_INTELLIGENCE_CONTACT_NAMES_MIGRATION.sql, then refresh.'
      }, { status: 503 });
    }
    const nameById = new Map((people || []).map((person) => [person.id, person.full_name]));
    result.waitlistContacts = contacts.map((contact) => ({
      ...contact,
      fullName: nameById.get(contact.id) || null
    }));
  }
  const response = {
    ...result,
    locations: (result.locations || []).map((location) => ({
      ...location,
      serviceAvailable: dispatchZones.some((zone) => zone.toLowerCase() === (location.area || '').toLowerCase())
    }))
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
