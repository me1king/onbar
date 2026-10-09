import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const statuses = ['WAITLIST', 'INVITED', 'NOTIFIED', 'CONVERTED', 'UNSUBSCRIBED'] as const;
const rewardPaths = ['wine', 'adventure', 'music'] as const;
const fields = 'id,full_name,email,phone,country,county,city,area,landmark,location_verified,location_accuracy_m,service_area_status,email_updates_consent,email_updates_consent_at,sms_consent,sms_consent_at,whatsapp_consent,whatsapp_consent_at,preferred_contact_method,product_interests,reward_path,order_frequency,age_group,age_confirmed,age_confirmed_at,referral_code,referred_by_code,campaign,landing_page,consent_version,source,status,notified_at,created_at,updated_at,unsubscribed_at';

async function authorize() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  const allowed = ['owner', 'admin'].includes(session.role.toLowerCase())
    || session.permissions.can_manage_communications === true
    || session.permissions.can_manage_customer_care === true;
  if (!allowed) return { session: null, response: NextResponse.json({ error: 'Waitlist contact access is required.' }, { status: 403 }) };
  return { session, response: null };
}

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function missingMigration(error: { code?: string; message?: string }) {
  return error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST202'
    || /get_waitlist_intelligence|full_name|service_area_status|reward_path|market_waitlist/i.test(error.message || '');
}

export async function GET(request: Request) {
  const { response } = await authorize();
  if (response) return response;
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist database access is not configured.' }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const search = (params.get('search') || '').replace(/[,%()_*]/g, '').trim().slice(0, 80);
  const status = params.get('status') || 'all';
  if (status !== 'all' && !statuses.includes(status as typeof statuses[number])) {
    return NextResponse.json({ error: 'Choose a valid waitlist status filter.' }, { status: 400 });
  }
  const rewardPath = params.get('rewardPath') || 'all';
  if (rewardPath !== 'all' && !rewardPaths.includes(rewardPath as typeof rewardPaths[number])) {
    return NextResponse.json({ error: 'Choose a valid waitlist experience filter.' }, { status: 400 });
  }
  const requestedPage = Number.parseInt(params.get('page') || '0', 10);
  const page = Number.isFinite(requestedPage) ? Math.min(100_000, Math.max(0, requestedPage)) : 0;
  const pageSize = 30;
  let query = database.from('market_waitlist').select(fields).order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status !== 'all' && statuses.includes(status as typeof statuses[number])) query = query.eq('status', status);
  if (rewardPath !== 'all') query = query.eq('reward_path', rewardPath);
  if (search) {
    const term = `%${search}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term},city.ilike.${term},area.ilike.${term}`);
  }

  const [list, intelligence] = await Promise.all([
    query,
    database.rpc('get_waitlist_intelligence')
  ]);
  if (list.error || intelligence.error) {
    const error = list.error || intelligence.error!;
    console.error('[AdminWaitlist] Could not load waitlist data:', error);
    return NextResponse.json({
      error: missingMigration(error)
        ? 'Run supabase/WAITLIST_SITE_MIGRATION.sql from the WAITLIST repository after DEMAND_INTELLIGENCE_MIGRATION.sql, then refresh.'
        : 'Waitlist data could not be loaded. Check Supabase connectivity and permissions.'
    }, { status: 503 });
  }
  return NextResponse.json({
    contacts: list.data || [],
    stats: intelligence.data || {},
    page,
    pageSize,
    hasMore: (list.data || []).length === pageSize
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const { response } = await authorize();
  if (response) return response;
  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid waitlist update is required.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)
    || typeof body.status !== 'string' || !statuses.includes(body.status as typeof statuses[number])) {
    return NextResponse.json({ error: 'Choose a valid signup and status.' }, { status: 400 });
  }
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist database access is not configured.' }, { status: 503 });
  const updatedAt = new Date().toISOString();
  const updates: { status: string; updated_at: string; notified_at?: string; unsubscribed_at?: string | null } = {
    status: body.status,
    updated_at: updatedAt
  };
  if (body.status === 'NOTIFIED') updates.notified_at = updatedAt;
  updates.unsubscribed_at = body.status === 'UNSUBSCRIBED' ? updatedAt : null;
  const { data, error } = await database.from('market_waitlist')
    .update(updates)
    .eq('id', body.id)
    .select('id,status,notified_at,unsubscribed_at,updated_at')
    .maybeSingle();
  if (error) {
    console.error('[AdminWaitlist] Could not update signup status:', error);
    return NextResponse.json({ error: 'Waitlist status could not be updated.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'That waitlist signup was not found.' }, { status: 404 });
  return NextResponse.json({ contact: data }, { headers: { 'Cache-Control': 'no-store' } });
}
