import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createMarketingUnsubscribeToken } from '@/lib/marketingUnsubscribe';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

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
    referred_by_code: string | null;
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
      .select('id,full_name,email,referral_code,referred_by_code,converted_to_user,country,county,city,area')
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
  const knownReferralCodes = new Set(members
    .flatMap(member => member.referral_code ? [member.referral_code.toLowerCase()] : []));
  const directReferralInvitees = members.filter(member =>
    member.referred_by_code && knownReferralCodes.has(member.referred_by_code.toLowerCase())
  );
  const creditedDirectInvitees = new Set(credits
    .filter(credit => credit.generation === 1)
    .map(credit => credit.invitee_id));
  const uncreditedDirectReferrals = directReferralInvitees
    .filter(invitee => !creditedDirectInvitees.has(invitee.id)).length;
  return { referrers, credits: referralCredits, uncreditedDirectReferrals };
}

async function loadWaitlistStats(database: ReturnType<typeof getDatabase>) {
  if (!database) throw new Error('Waitlist database access is not configured.');
  const stats = {
    total: 0,
    inArea: 0,
    outsideArea: 0,
    unknownArea: 0,
    emailOptIns: 0,
    smsOptIns: 0,
    whatsappOptIns: 0,
    totalAreaCount: 0,
    areas: [] as Array<{ country: string; county: string; city: string; area: string; total: number; inArea: number }>,
    interests: [] as Array<{ name: string; count: number }>,
    ageGroups: [
      { group: '18_20', label: '18–20', count: 0 },
      { group: '21_24', label: '21–24', count: 0 },
      { group: '25_34', label: '25–34', count: 0 },
      { group: '35_44', label: '35–44', count: 0 },
      { group: '45_plus', label: '45+', count: 0 }
    ],
    rewardPaths: [
      { path: 'wine', label: 'Wine tastings & curated gifts', count: 0 },
      { path: 'adventure', label: 'Hosted adventures for two', count: 0 },
      { path: 'music', label: 'Soul Fest ticket draw', count: 0 }
    ]
  };
  const areaCounts = new Map<string, { country: string; county: string; city: string; area: string; total: number; inArea: number }>();
  const interestCounts = new Map<string, number>();
  const ageGroups = new Map(stats.ageGroups.map(group => [group.group, group]));
  const { data: siteContent, error: contentError } = await database.from('waitlist_site_content')
    .select('campaign_settings')
    .eq('id', 'default')
    .maybeSingle();
  if (contentError) {
    console.warn('[AdminWaitlist] Could not read experience card labels; using standard labels:', contentError);
  } else {
    const campaign = siteContent?.campaign_settings as { experiences?: unknown } | null;
    if (Array.isArray(campaign?.experiences)) {
      const labelByPath = new Map(campaign.experiences.flatMap(experience => {
        if (!experience || typeof experience !== 'object') return [];
        const item = experience as { id?: unknown; title?: unknown };
        return typeof item.id === 'string' && typeof item.title === 'string'
          ? [[item.id, item.title] as const]
          : [];
      }));
      for (const path of stats.rewardPaths) path.label = labelByPath.get(path.path) || path.label;
    }
  }
  const rewardPaths = new Map(stats.rewardPaths.map(path => [path.path, path]));

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from('market_waitlist')
      .select('country,county,city,area,service_area_status,email_updates_consent,sms_consent,whatsapp_consent,status,age_group,reward_path,product_interests')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;

    for (const member of data) {
      stats.total += 1;
      if (member.service_area_status === 'in_area') stats.inArea += 1;
      else if (member.service_area_status === 'outside_area') stats.outsideArea += 1;
      else stats.unknownArea += 1;

      if (member.status !== 'UNSUBSCRIBED') {
        if (member.email_updates_consent) stats.emailOptIns += 1;
        if (member.sms_consent) stats.smsOptIns += 1;
        if (member.whatsapp_consent) stats.whatsappOptIns += 1;
      }

      const areaKey = JSON.stringify([member.country, member.county, member.city, member.area]);
      const area = areaCounts.get(areaKey) || {
        country: member.country || '',
        county: member.county || '',
        city: member.city || '',
        area: member.area || '',
        total: 0,
        inArea: 0
      };
      area.total += 1;
      if (member.service_area_status === 'in_area') area.inArea += 1;
      areaCounts.set(areaKey, area);

      const ageGroup = ageGroups.get(member.age_group || '');
      if (ageGroup) ageGroup.count += 1;
      const rewardPath = rewardPaths.get(member.reward_path || '');
      if (rewardPath) rewardPath.count += 1;
      for (const interest of member.product_interests || []) {
        interestCounts.set(interest, (interestCounts.get(interest) || 0) + 1);
      }
    }

    if (data.length < 1000) break;
  }

  stats.totalAreaCount = areaCounts.size;
  stats.areas = [...areaCounts.values()]
    .sort((left, right) => right.total - left.total || left.area.localeCompare(right.area))
    .slice(0, 500);
  stats.interests = [...interestCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  return stats;
}

async function loadPreciseDemandLocations(database: ReturnType<typeof getDatabase>) {
  if (!database) throw new Error('Waitlist database access is not configured.');
  const cells = new Map<string, { latitude: number; longitude: number; signups: number; accuracyTotalM: number }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from('waitlist_demand_locations')
      .select('latitude,longitude,accuracy_m')
      .order('latitude', { ascending: true })
      .order('longitude', { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.warn('[AdminWaitlist] Precise demand map is not enabled; apply WAITLIST_DEMAND_GPS_MIGRATION.sql.');
        return { locations: [], preciseLocationOptIns: 0, setupRequired: true };
      }
      throw error;
    }

    for (const row of data) {
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      const accuracyM = Number(row.accuracy_m);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || !Number.isFinite(accuracyM) || accuracyM <= 0) continue;
      const key = `${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
      const cell = cells.get(key) || { latitude, longitude, signups: 0, accuracyTotalM: 0 };
      cell.signups += 1;
      cell.accuracyTotalM += accuracyM;
      cells.set(key, cell);
    }
    if (data.length < 1000) break;
  }

  const locations = [...cells.values()].map(cell => ({
    latitude: cell.latitude,
    longitude: cell.longitude,
    signups: cell.signups,
    averageAccuracyM: Math.round(cell.accuracyTotalM / cell.signups)
  }));
  return {
    locations,
    preciseLocationOptIns: locations.reduce((total, cell) => total + cell.signups, 0),
    setupRequired: false
  };
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function renderHalloweenInvitation(message: string, name: string, ticketUrl: string) {
  const personalizedMessage = message
    .replaceAll('{{name}}', name || 'there')
    .replaceAll('{{tickets_link}}', ticketUrl)
    .replace(/\bADD DATE\b|\bADD TIME\b|ADD PRIVATE VENUE DETAILS/gi, '');
  const cleanedMessage = personalizedMessage.trim();
  return cleanedMessage.includes(ticketUrl)
    ? cleanedMessage
    : `${cleanedMessage}\n\nGet your tickets: ${ticketUrl}`;
}

async function sendHalloweenInvitation(input: {
  database: NonNullable<ReturnType<typeof getDatabase>>;
  member: { id: string; full_name: string | null; email: string; status: string };
  subject: string;
  message: string;
  origin: string;
  campaignId: string;
}) {
  const config = getTransactionalEmailConfig();
  if (!config.configured || !config.from) {
    throw new Error('Email delivery is not configured. Set up a verified sender before inviting waitlist members.');
  }

  const ticketUrl = `${input.origin}/tickets`;
  const personalizedMessage = renderHalloweenInvitation(input.message, input.member.full_name || '', ticketUrl);
  const unsubscribeUrl = `${input.origin}/newsletter/unsubscribe?token=${encodeURIComponent(createMarketingUnsubscribeToken(input.member.email))}`;
  const htmlMessage = escapeHtml(personalizedMessage)
    .replace(/\r?\n/g, '<br>')
    .replaceAll(escapeHtml(ticketUrl), `<a href="${escapeHtml(ticketUrl)}">Get your Apex Market tickets</a>`);
  const emailResult = await sendTransactionalEmail({
    from: config.from,
    to: input.member.email,
    subject: input.subject,
    text: `${personalizedMessage}\n\nYou received this because you opted in to Apex Market waitlist email updates. Unsubscribe: ${unsubscribeUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#262626"><h1 style="color:#7c2d12">🎃 Halloween Private House Party</h1><p>${htmlMessage}</p><hr style="border:0;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#777">You received this because you opted in to Apex Market waitlist email updates.</p><p style="font-size:12px"><a href="${unsubscribeUrl}">Unsubscribe from marketing emails</a></p></div>`,
    idempotencyKey: `waitlist-invite-${input.campaignId}-${input.member.id}`
  });

  if (input.member.status === 'WAITLIST') {
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await input.database
      .from('market_waitlist')
      .update({ status: 'INVITED', notified_at: updatedAt, updated_at: updatedAt })
      .eq('id', input.member.id)
      .eq('status', 'WAITLIST')
      .eq('email_updates_consent', true)
      .is('unsubscribed_at', null);
    if (updateError) {
      console.error('[AdminWaitlist] Halloween invitation sent but status could not be updated:', updateError);
    }
  }

  return emailResult;
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

  const [list, statsResult] = await Promise.all([
    query,
    loadWaitlistStats(database)
      .then(stats => ({ stats, error: null }))
      .catch(error => ({ stats: null, error }))
  ]);
  if (list.error || statsResult.error) {
    const error = list.error || statsResult.error;
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
  let demandLocations;
  try {
    demandLocations = await loadPreciseDemandLocations(database);
  } catch (error) {
    console.error('[AdminWaitlist] Could not load aggregated precise demand locations:', error);
    return NextResponse.json({ error: 'Aggregated demand locations could not be loaded. Check waitlist location table access.' }, { status: 503 });
  }
  return NextResponse.json({
    contacts: list.data || [],
    stats: statsResult.stats || {},
    referralAnalytics,
    demandLocations: demandLocations.locations,
    preciseLocationOptIns: demandLocations.preciseLocationOptIns,
    demandLocationSetupRequired: demandLocations.setupRequired,
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
  let body: { id?: unknown; status?: unknown; invitationSubject?: unknown; invitationMessage?: unknown };
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
  if (body.status === 'INVITED') {
    return NextResponse.json({
      error: 'Status changes do not send invitations. Use the Waitlist Invitations page and press the send button.'
    }, { status: 409 });
  }

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

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const { response } = await authorize();
  if (response) return response;

  let body: { action?: unknown; subject?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid invitation campaign is required.' }, { status: 400 });
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (body.action !== 'send_halloween_invitations' || !subject || subject.length > 200 || !message || message.length > 5000) {
    return NextResponse.json({ error: 'Enter an invitation subject and message under 5,000 characters.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Waitlist database access is not configured.' }, { status: 503 });
  const emailConfig = getTransactionalEmailConfig();
  if (!emailConfig.configured || !emailConfig.from) {
    return NextResponse.json({ error: 'Email delivery is not configured. Set up a verified sender before inviting waitlist members.' }, { status: 503 });
  }

  const members: Array<{ id: string; full_name: string | null; email: string; status: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await database.from('market_waitlist')
      .select('id,full_name,email,status')
      .neq('status', 'UNSUBSCRIBED')
      .eq('email_updates_consent', true)
      .is('unsubscribed_at', null)
      .order('id')
      .range(offset, offset + 499);
    if (error) {
      console.error('[AdminWaitlist] Could not load eligible Halloween invitees:', error);
      return NextResponse.json({ error: 'Eligible waitlist members could not be loaded.' }, { status: 503 });
    }
    members.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  if (!members.length) {
    return NextResponse.json({ error: 'There are no waitlist members with active email consent to invite.' }, { status: 409 });
  }

  const campaignId = crypto.randomUUID();
  let invited = 0;
  let failed = 0;
  for (let offset = 0; offset < members.length; offset += 20) {
    const batch = members.slice(offset, offset + 20);
    const results = await Promise.all(batch.map(async member => {
      try {
        await sendHalloweenInvitation({
          database,
          member,
          subject,
          message,
          origin: new URL(request.url).origin,
          campaignId
        });
        return true;
      } catch (invitationError) {
        console.error(`[AdminWaitlist] Halloween invitation failed for signup ${member.id}:`, invitationError);
        return false;
      }
    }));
    invited += results.filter(Boolean).length;
    failed += results.filter(result => !result).length;
  }
  return NextResponse.json({ invited, failed, eligible: members.length }, {
    status: failed ? 207 : 200,
    headers: { 'Cache-Control': 'no-store' }
  });
}
