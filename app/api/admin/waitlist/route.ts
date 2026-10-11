import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const statuses = ['WAITLIST', 'INVITED', 'NOTIFIED', 'CONVERTED', 'UNSUBSCRIBED'] as const;
const rewardPaths = ['wine', 'adventure', 'music'] as const;
const fields = 'id,full_name,email,phone,country,county,city,area,landmark,location_verified,location_accuracy_m,service_area_status,email_updates_consent,email_updates_consent_at,sms_consent,sms_consent_at,whatsapp_consent,whatsapp_consent_at,preferred_contact_method,product_interests,reward_path,order_frequency,age_group,age_confirmed,age_confirmed_at,referral_code,referred_by_code,campaign,landing_page,consent_version,source,status,notified_at,created_at,updated_at,unsubscribed_at';

async function loadReferralAnalytics(database: ReturnType<typeof getDatabase>) {
  if (!database) throw new Error('Waitlist database access is not configured.');
  const members: Array<{
    id: string;
    full_name: string | null;
    email: string;
    referral_code: string | null;
    converted_to_user: string | null;
    country: string;
    county: string;
    city: string;
    area: string;
  }> = [];
  const credits: Array<{
    id: string;
    referrer_id: string;
    invitee_id: string;
    token_amount: number;
    generation: number;
    created_at: string;
  }> = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from('market_waitlist')
      .select('id,full_name,email,referral_code,converted_to_user,country,county,city,area')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    members.push(...data);
    if (data.length < 1000) break;
  }

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from('waitlist_referral_credits')
      .select('id,referrer_id,invitee_id,token_amount,generation,created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    credits.push(...data);
    if (data.length < 1000) break;
  }

  const memberById = new Map(members.map(member => [member.id, member]));
  const convertedUserIds = [...new Set(members
    .map(member => member.converted_to_user)
    .filter((userId): userId is string => Boolean(userId)))];
  const turnoverByUser = new Map<string, number>();
  for (let start = 0; start < convertedUserIds.length; start += 200) {
    const userIds = convertedUserIds.slice(start, start + 200);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await database.from('orders')
        .select('user_id,total_price')
        .in('user_id', userIds)
        .in('status', ['Delivered', 'Completed'])
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      for (const order of data) {
        const amount = Number(order.total_price || 0);
        if (Number.isFinite(amount) && amount > 0) {
          turnoverByUser.set(order.user_id, (turnoverByUser.get(order.user_id) || 0) + amount);
        }
      }
      if (data.length < 1000) break;
    }
  }

  const leaderboard = new Map<string, {
    referrerId: string;
    name: string;
    referralCode: string;
    directReferrals: number;
    networkReferrals: number;
    positiveTurnoverReferrals: number;
    turnover: number;
    pointsEarned: number;
  }>();
  const referralCredits = credits.map(credit => {
    const referrer = memberById.get(credit.referrer_id);
    const invitee = memberById.get(credit.invitee_id);
    const turnover = invitee?.converted_to_user
      ? turnoverByUser.get(invitee.converted_to_user) || 0
      : 0;
    const aggregate = leaderboard.get(credit.referrer_id) || {
      referrerId: credit.referrer_id,
      name: referrer?.full_name || referrer?.email || credit.referrer_id,
      referralCode: referrer?.referral_code || '',
      directReferrals: 0,
      networkReferrals: 0,
      positiveTurnoverReferrals: 0,
      turnover: 0,
      pointsEarned: 0
    };
    aggregate.networkReferrals += 1;
    if (credit.generation === 1) aggregate.directReferrals += 1;
    if (turnover > 0) aggregate.positiveTurnoverReferrals += 1;
    aggregate.turnover += turnover;
    aggregate.pointsEarned += Number(credit.token_amount || 0);
    leaderboard.set(credit.referrer_id, aggregate);
    return {
      id: credit.id,
      referrerId: credit.referrer_id,
      referrerName: aggregate.name,
      inviteeId: credit.invitee_id,
      inviteeName: invitee?.full_name || invitee?.email || credit.invitee_id,
      inviteeEmail: invitee?.email || '',
      depth: credit.generation,
      points: credit.token_amount,
      turnover,
      country: invitee?.country || '',
      county: invitee?.county || '',
      city: invitee?.city || '',
      area: invitee?.area || '',
      createdAt: credit.created_at
    };
  });

  const referrers = [...leaderboard.values()]
    .sort((left, right) =>
      right.positiveTurnoverReferrals - left.positiveTurnoverReferrals
      || right.turnover - left.turnover
      || right.directReferrals - left.directReferrals
    );
  return { referrers, credits: referralCredits };
}

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
  let referralAnalytics;
  try {
    referralAnalytics = await loadReferralAnalytics(database);
  } catch (error) {
    console.error('[AdminWaitlist] Could not load referral points and turnover:', error);
    return NextResponse.json({
      error: 'Waitlist referral analytics could not be loaded. Apply the latest supabase/WAITLIST_SITE_MIGRATION.sql to the shared Supabase project and confirm orders can be read.'
    }, { status: 503 });
  }
  return NextResponse.json({
    contacts: list.data || [],
    stats: intelligence.data || {},
    referralAnalytics,
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
