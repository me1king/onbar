import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const readinessStatuses = ['not_started', 'in_progress', 'blocked', 'verified', 'not_applicable'] as const;

function canViewReadiness(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>) {
  return ['owner', 'admin'].includes(session.role.toLowerCase())
    || hasAdminPermission(session, 'can_manage_settings')
    || hasAdminPermission(session, 'can_view_revenue');
}

function getConfigurationChecks() {
  const configured = (names: string[]) => names.every(name => Boolean(process.env[name]?.trim()));
  return [
    {
      id: 'supabase-env',
      label: 'Supabase server credentials',
      ready: configured(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']),
      detail: 'Configuration only; verify project, RLS and deployed schema separately.',
      blocker: true
    },
    {
      id: 'admin-session-secret',
      label: 'Admin session signing secret',
      ready: Boolean(process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim()),
      detail: 'A separate high-entropy ADMIN_SESSION_SECRET is recommended.',
      blocker: true
    },
    {
      id: 'paystack-env',
      label: 'Paystack credentials',
      ready: configured(['PAYSTACK_SECRET_KEY', 'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY']),
      detail: 'Configured credentials do not prove live transactions or webhook delivery.',
      blocker: true
    },
    {
      id: 'email-env',
      label: 'Transactional email credentials',
      ready: configured(['JMSURF_MAIL_KEY', 'JMSURF_FROM_EMAIL'])
        || configured(['RESEND_API_KEY', 'RESEND_FROM_EMAIL']),
      detail: 'Configured credentials do not prove sender-domain authentication or delivery.',
      blocker: true
    },
    {
      id: 'whatsapp-env',
      label: 'WhatsApp credentials',
      ready: configured(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID']),
      detail: 'Configured credentials do not prove secure webhook or message delivery.',
      blocker: true
    },
    {
      id: 'maps-env',
      label: 'Maps API key',
      ready: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()),
      detail: 'Configured key does not prove routing, billing or ETA correctness.',
      blocker: false
    }
  ];
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!canViewReadiness(session)) {
    return NextResponse.json({ error: 'Launch readiness access required.' }, { status: 403 });
  }

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(7, Math.floor(requestedDays))) : 30;
  const checks = getConfigurationChecks().map(check => ({
    ...check,
    status: check.ready ? 'configured' : 'missing'
  }));
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      items: [],
      checks: [...checks, {
        id: 'database-connection',
        label: 'Supabase database connection',
        status: 'unavailable',
        detail: 'Server-side Supabase credentials are missing.',
        blocker: true
      }],
      searchInsights: [],
      searchDays: days,
      setupErrors: {
        checklist: 'Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
      }
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  const [databaseResult, storageResult, checklistResult, searchResult, forensicsResult, deliveryResult] = await Promise.all([
    database.from('settings').select('key').limit(1),
    database.storage.listBuckets(),
    database.from('launch_readiness_items')
      .select('id, category, title, description, status, is_critical, status_note, updated_by, updated_at')
      .order('category')
      .order('id'),
    database.rpc('get_launch_search_insights', { p_days: days }),
    database.from('audit_logs').select('event_hash').limit(0),
    database.from('delivery_events').select('id').limit(0)
  ]);

  if (databaseResult.error) console.error('[LaunchReadiness] Database probe failed:', databaseResult.error);
  if (storageResult.error) console.error('[LaunchReadiness] Storage probe failed:', storageResult.error);
  if (checklistResult.error) console.error('[LaunchReadiness] Checklist could not be loaded:', checklistResult.error);
  if (searchResult.error) console.error('[LaunchReadiness] Search insights could not be loaded:', searchResult.error);
  if (forensicsResult.error) console.error('[LaunchReadiness] Forensics schema probe failed:', forensicsResult.error);
  if (deliveryResult.error) console.error('[LaunchReadiness] Delivery schema probe failed:', deliveryResult.error);

  const databaseCheck = {
    id: 'database-connection',
    label: 'Supabase database connection',
    status: databaseResult.error ? 'unavailable' : 'verified',
    detail: databaseResult.error ? 'A server-side query failed.' : 'A server-side database query succeeded.',
    blocker: true
  };
  const checksWithRuntime = [
    ...checks,
    databaseCheck,
    {
      id: 'storage-access',
      label: 'Supabase storage access',
      status: storageResult.error ? 'unavailable' : 'verified',
      detail: storageResult.error ? 'The server could not list storage buckets.' : 'The server can reach Supabase Storage; required bucket contents still need review.',
      blocker: false
    },
    {
      id: 'forensics-schema',
      label: 'Append-only audit schema',
      status: forensicsResult.error ? 'missing' : 'verified',
      detail: forensicsResult.error ? 'Run the forensics migration and verify the audit chain.' : 'Forensics columns are available; use Verify Chain to validate record integrity.',
      blocker: true
    },
    {
      id: 'delivery-schema',
      label: 'Delivery event schema',
      status: deliveryResult.error ? 'missing' : 'verified',
      detail: deliveryResult.error ? 'Run the documented delivery migration before the forensics migration.' : 'Delivery events table is reachable; end-to-end dispatch still needs testing.',
      blocker: true
    },
    {
      id: 'search-analytics',
      label: 'Search-demand analytics',
      status: searchResult.error ? 'missing' : 'verified',
      detail: searchResult.error ? 'Run the launch-readiness migration and collect analytics-consented traffic.' : 'Search aggregates are available; no traffic yet is different from broken tracking.',
      blocker: false
    }
  ];

  return NextResponse.json({
    items: checklistResult.data || [],
    checks: checksWithRuntime,
    searchInsights: searchResult.data || [],
    searchDays: days,
    setupErrors: {
      ...(checklistResult.error ? { checklist: 'Run supabase/LAUNCH_READINESS_MIGRATION.sql in the production Supabase project.' } : {}),
      ...(searchResult.error ? { search: 'Run supabase/LAUNCH_READINESS_MIGRATION.sql and enable analytics consent before testing search tracking.' } : {})
    },
    ...(databaseResult.error ? { warning: 'Database connectivity is not healthy; readiness must remain blocked.' } : {})
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (
    !['owner', 'admin'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_settings')
  ) {
    return NextResponse.json({ error: 'Settings management access required to update launch readiness.' }, { status: 403 });
  }

  let body: { id?: unknown; status?: unknown; status_note?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid readiness item update is required.' }, { status: 400 });
  }

  if (
    typeof body.id !== 'string'
    || !/^[a-z0-9-]{1,100}$/.test(body.id)
    || typeof body.status !== 'string'
    || !readinessStatuses.includes(body.status as typeof readinessStatuses[number])
    || (body.status_note !== undefined && typeof body.status_note !== 'string')
    || (typeof body.status_note === 'string' && body.status_note.length > 2000)
  ) {
    return NextResponse.json({ error: 'A valid readiness item ID, status and note are required.' }, { status: 400 });
  }
  if (
    (body.status === 'verified' || body.status === 'not_applicable')
    && !(typeof body.status_note === 'string' && body.status_note.trim())
  ) {
    return NextResponse.json({
      error: body.status === 'verified'
        ? 'Add verification evidence before marking this item verified.'
        : 'Add a reason before marking this item not applicable.'
    }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side Supabase access is not configured.' }, { status: 503 });

  const { data, error } = await database
    .from('launch_readiness_items')
    .update({
      status: body.status,
      status_note: typeof body.status_note === 'string' ? body.status_note.trim() : '',
      updated_by: session.email || session.role,
      updated_at: new Date().toISOString()
    })
    .eq('id', body.id)
    .select('id, category, title, description, status, is_critical, status_note, updated_by, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[LaunchReadiness] Could not update checklist item:', error);
    return NextResponse.json({ error: 'The launch checklist update could not be saved.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'The requested launch checklist item was not found.' }, { status: 404 });
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } });
}
