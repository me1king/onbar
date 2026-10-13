import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const statuses = ['new', 'reviewing', 'matched', 'in_progress', 'completed', 'closed'] as const;
const serviceKeys = [
  'finding_outfit', 'styling', 'makeup_sfx', 'wig_hair',
  'props_accessories', 'tailoring', 'costume_maker', 'inspiration_tutorials'
] as const;
const profileFields = 'id,member_id,concept,character_theme,outfit_status,budget_range,group_plan,status,provider_id,created_at,updated_at,member:market_waitlist!fit_profiles_member_id_fkey!inner(id,full_name,email,phone),help:fit_help_requests!inner(service_key),provider:fit_providers(id,name,service_key,verified,available)';
const serviceLabels: Record<string, string> = {
  finding_outfit: 'Finding the outfit',
  styling: 'Styling and coordination',
  makeup_sfx: 'Makeup or special effects',
  wig_hair: 'Wig or hair styling',
  props_accessories: 'Props and accessories',
  tailoring: 'Tailoring or alterations',
  costume_maker: 'Costume makers',
  inspiration_tutorials: 'Inspiration and tutorials'
};

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

async function authorize(mode: 'view' | 'manage' | 'export' = 'view') {
  const session = await getAdminSession();
  if (!session) return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  const role = session.role.toLowerCase();
  const ownerOrAdmin = role === 'owner' || role === 'admin';
  const allowed = mode === 'view'
    ? ownerOrAdmin || hasAdminPermission(session, 'can_manage_communications')
      || hasAdminPermission(session, 'can_view_sensitive_data')
      || session.permissions.can_manage_customer_care === true
    : mode === 'export'
      ? ownerOrAdmin || hasAdminPermission(session, 'can_view_sensitive_data')
      : ownerOrAdmin || hasAdminPermission(session, 'can_manage_settings');
  if (!allowed) {
    return {
      session,
      response: NextResponse.json({
        error: mode === 'view'
          ? 'Fit Studio member-data access is required.'
          : mode === 'export'
            ? 'Fit Studio export access is required.'
            : 'Fit Studio management access is required.'
      }, { status: 403 })
    };
  }
  return { session, response: null };
}

function migrationError(error: { code?: string } | null) {
  const missing = error && ['42P01', 'PGRST202', 'PGRST205', 'PGRST204', '42883'].includes(error.code || '');
  return NextResponse.json({
    error: missing
      ? 'Fit Studio storage is not configured. Apply supabase/WAITLIST_FIT_STUDIO_MIGRATION.sql from the isolated WAITLIST repository to the shared Supabase project.'
      : 'Fit Studio data could not be loaded. Check shared Supabase connectivity and permissions.'
  }, { status: 503 });
}

async function recordAudit(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  actor: string | undefined,
  action: string,
  profileId: string | null = null,
  details: Record<string, unknown> = {}
) {
  return db.rpc('log_waitlist_fit_studio_action', {
    p_actor_email: actor || 'admin',
    p_action: action,
    p_profile_id: profileId,
    p_details: details
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const exportType = params.get('export');
  const { session, response } = await authorize(exportType ? 'export' : 'view');
  if (response) return response;
  const db = getDatabase();
  if (!db) return migrationError(null);
  const actor = session?.email || session?.role;

  if (exportType) {
    if (exportType !== 'summary' || params.get('purpose') !== 'service_planning') {
      return NextResponse.json({ error: 'Choose the approved service-planning summary export.' }, { status: 400 });
    }
    const audit = await recordAudit(db, actor, 'export_profiles', null, { purpose: 'service_planning', format: 'aggregate_csv' });
    if (audit.error) {
      console.error('[AdminFitStudio] Could not record export audit:', audit.error.code);
      return migrationError(audit.error);
    }
    const { data, error } = await db.rpc('get_waitlist_fit_studio_metrics');
    if (error || !data) return migrationError(error);
    const rows: string[][] = [['Category', 'Option', 'Count']];
    for (const [key, label] of Object.entries(serviceLabels)) rows.push(['Requested help', label, String(data.byService?.[key] || 0)]);
    for (const [key, count] of Object.entries(data.byBudget || {})) rows.push(['Budget', key, String(count)]);
    for (const [key, count] of Object.entries(data.byReadiness || {})) rows.push(['Outfit readiness', key, String(count)]);
    for (const [key, count] of Object.entries(data.byStatus || {})) rows.push(['Request status', key, String(count)]);
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="fit-studio-service-planning.csv"',
        'Cache-Control': 'private, no-store, max-age=0'
      }
    });
  }

  const requestedPage = Number.parseInt(params.get('page') || '0', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.min(10_000, requestedPage)) : 0;
  const pageSize = 25;
  const rawSearch = (params.get('search') || '').replace(/[,%()_*]/g, '').trim().slice(0, 80);
  const status = params.get('status') || 'all';
  if (status !== 'all' && !statuses.includes(status as typeof statuses[number])) {
    return NextResponse.json({ error: 'Choose a valid Fit Studio status.' }, { status: 400 });
  }
  const serviceKey = params.get('service') || 'all';
  if (serviceKey !== 'all' && !serviceKeys.includes(serviceKey as typeof serviceKeys[number])) {
    return NextResponse.json({ error: 'Choose a valid Fit Studio help category.' }, { status: 400 });
  }

  const audit = await recordAudit(db, actor, 'view_queue', null, {
    page, status, service: serviceKey, searched: Boolean(rawSearch)
  });
  if (audit.error) {
    console.error('[AdminFitStudio] Could not record queue view:', audit.error.code);
    return migrationError(audit.error);
  }

  let query = db.from('fit_profiles').select(profileFields, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status !== 'all') query = query.eq('status', status);
  if (rawSearch) query = query.or(
    `full_name.ilike.%${rawSearch}%,email.ilike.%${rawSearch}%,phone.ilike.%${rawSearch}%`,
    { referencedTable: 'member' }
  );
  if (serviceKey !== 'all') query = query.eq('help.service_key', serviceKey);

  const [profilesResult, metricsResult, providersResult, settingsResult, auditResult] = await Promise.all([
    query,
    db.rpc('get_waitlist_fit_studio_metrics'),
    db.from('fit_providers').select('id,name,service_key,contact_name,email,phone,notes,verified,available,updated_at').order('name'),
    db.from('fit_studio_settings').select('title,intro,merchant_notice,updated_at').eq('id', 'default').single(),
    db.from('fit_studio_audit_log').select('id,actor_email,action,profile_id,details,created_at').order('created_at', { ascending: false }).limit(50)
  ]);
  const failed = profilesResult.error || metricsResult.error || providersResult.error || settingsResult.error || auditResult.error;
  if (failed) {
    console.error('[AdminFitStudio] Could not load dashboard data:', failed.code);
    return migrationError(failed);
  }

  const profileRows = profilesResult.data || [];
  const memberIdsInPage = profileRows.map((profile: { member_id: string }) => profile.member_id);
  const consents = memberIdsInPage.length
    ? await db.from('fit_consent_records').select('id,member_id,purpose,channel,granted,captured_at')
      .in('member_id', memberIdsInPage)
      .order('captured_at', { ascending: false })
      .order('id', { ascending: false })
    : { data: [], error: null };
  if (consents.error) return migrationError(consents.error);
  const latestConsent = new Map<string, { purpose: string; channel: string; granted: boolean; capturedAt: string }>();
  for (const entry of consents.data || []) {
    const key = `${entry.member_id}:${entry.purpose}:${entry.channel}`;
    if (!latestConsent.has(key)) latestConsent.set(key, {
      purpose: entry.purpose as string,
      channel: entry.channel as string,
      granted: entry.granted as boolean,
      capturedAt: entry.captured_at as string
    });
  }
  const profiles = profileRows.map((profile: Record<string, unknown>) => ({
    ...profile,
    consent: [...latestConsent.entries()]
      .filter(([key]) => key.startsWith(`${String(profile.member_id)}:`))
      .map(([, consent]) => consent)
  }));

  return NextResponse.json({
    profiles,
    metrics: metricsResult.data,
    providers: providersResult.data || [],
    settings: settingsResult.data,
    audit: auditResult.data || [],
    page,
    pageSize,
    total: profilesResult.count || 0,
    hasMore: (page + 1) * pageSize < (profilesResult.count || 0)
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { session, response } = await authorize('view');
  if (response) return response;
  let body: { action?: unknown; profileId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid Fit Studio action is required.' }, { status: 400 });
  }
  if (body.action !== 'view_profile' || typeof body.profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.profileId)) {
    return NextResponse.json({ error: 'Choose a valid Fit Studio profile.' }, { status: 400 });
  }
  const db = getDatabase();
  if (!db) return migrationError(null);
  const { error } = await recordAudit(db, session?.email || session?.role, 'view_profile', body.profileId);
  if (error) {
    console.error('[AdminFitStudio] Could not record profile view:', error.code);
    return migrationError(error);
  }
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { session, response } = await authorize('manage');
  if (response) return response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid Fit Studio update is required.' }, { status: 400 });
  }
  const db = getDatabase();
  if (!db) return migrationError(null);
  const actor = session?.email || session?.role || 'admin';
  if (body.action === 'update_profile') {
    if (typeof body.profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.profileId)
      || typeof body.status !== 'string' || !statuses.includes(body.status as typeof statuses[number])
      || (body.providerId !== null && body.providerId !== '' && (typeof body.providerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.providerId)))) {
      return NextResponse.json({ error: 'Choose a valid profile status and provider.' }, { status: 400 });
    }
    const { error } = await db.rpc('update_waitlist_fit_profile', {
      p_profile_id: body.profileId,
      p_next_status: body.status,
      p_provider_id: typeof body.providerId === 'string' && body.providerId ? body.providerId : null,
      p_actor_email: actor
    });
    if (error) {
      console.error('[AdminFitStudio] Could not update profile:', error.code);
      if (error.code === 'PGRST202' || error.code === '42883') return migrationError(error);
      return NextResponse.json({ error: error.message.includes('verified provider') || error.message.includes('Assign a verified')
        || error.message.includes('member must opt in')
        ? error.message
        : 'The Fit Studio profile could not be updated.' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }
  if (body.action === 'save_provider') {
    const provider = body.provider && typeof body.provider === 'object' ? body.provider as Record<string, unknown> : {};
    const stringValue = (key: string, max: number) => typeof provider[key] === 'string' ? provider[key].trim().slice(0, max) : '';
    const id = provider.id;
    if ((id !== null && id !== undefined && id !== '' && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)))
      || !serviceKeys.includes(stringValue('service_key', 40) as typeof serviceKeys[number])
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue('email', 254)) && stringValue('email', 254) !== ''
      || !/^[+\d ()-]{7,32}$/.test(stringValue('phone', 32)) && stringValue('phone', 32) !== '') {
      return NextResponse.json({ error: 'Enter a provider name, valid service, email and phone.' }, { status: 400 });
    }
    const { data, error } = await db.rpc('save_waitlist_fit_provider', {
      p_provider_id: typeof id === 'string' && id ? id : null,
      p_name: stringValue('name', 120),
      p_service_key: stringValue('service_key', 40),
      p_contact_name: stringValue('contact_name', 120),
      p_email: stringValue('email', 254),
      p_phone: stringValue('phone', 32),
      p_notes: stringValue('notes', 1000),
      p_verified: provider.verified === true,
      p_available: provider.available === true,
      p_actor_email: actor
    });
    if (error || !data) {
      console.error('[AdminFitStudio] Could not save provider:', error?.code);
      return error?.code === 'PGRST202' || error?.code === '42883'
        ? migrationError(error)
        : NextResponse.json({ error: 'The provider could not be saved. Check the required fields.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, providerId: data });
  }
  if (body.action === 'save_settings') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const intro = typeof body.intro === 'string' ? body.intro.trim() : '';
    const merchantNotice = typeof body.merchantNotice === 'string' ? body.merchantNotice.trim() : '';
    if (title.length < 2 || title.length > 100 || intro.length < 10 || intro.length > 500
      || merchantNotice.length < 10 || merchantNotice.length > 500) {
      return NextResponse.json({ error: 'Keep the title under 100 characters and each public message between 10 and 500 characters.' }, { status: 400 });
    }
    const { error } = await db.rpc('update_waitlist_fit_studio_settings', {
      p_title: title, p_intro: intro, p_merchant_notice: merchantNotice, p_actor_email: actor
    });
    if (error) {
      console.error('[AdminFitStudio] Could not update public copy:', error.code);
      return error.code === 'PGRST202' || error.code === '42883'
        ? migrationError(error)
        : NextResponse.json({ error: 'Fit Studio public copy could not be saved.' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Choose a supported Fit Studio update.' }, { status: 400 });
}
