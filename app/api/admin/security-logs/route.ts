import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function getAuthorizedClient(requireSecurityPermission = true) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (requireSecurityPermission && (
    session.role !== 'owner'
    && session.permissions?.can_manage_settings !== true
    && session.permissions?.can_view_audit_logs !== true
  ))) {
    return { response: NextResponse.json({ error: 'Security log access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Server-side security logging is not configured.' }, { status: 503 }) };
  }
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return { client, session };
}

export async function GET() {
  const result = await getAuthorizedClient();
  if ('response' in result) return result.response;

  const [attempts, threats] = await Promise.all([
    result.client
      .from('login_attempts')
      .select('id, ip_address, success, mode, identity_hint, reason, user_agent, attempt_time')
      .order('attempt_time', { ascending: false })
      .limit(100),
    result.client
      .from('security_threats')
      .select('id, type, severity, description, status, ip_address, metadata, created_at, resolved_at')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  if (attempts.error || threats.error) {
    const error = attempts.error || threats.error;
    console.error('[SecurityLogs] Could not load security records:', error);
    return NextResponse.json({ error: `Could not load security records: ${error?.message || 'Unknown database error.'}` }, { status: 500 });
  }
  return NextResponse.json({
    attempts: attempts.data || [],
    threats: (threats.data || []).map(threat => ({
      ...threat,
      status: threat.status === 'Flagged' ? 'OPEN' : threat.status
    }))
  });
}

export async function POST(request: Request) {
  let body: { action?: unknown; threatId?: unknown; threats?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid security action is required.' }, { status: 400 });
  }
  const result = await getAuthorizedClient(body.action === 'report' ? false : true);
  if ('response' in result) return result.response;

  if (body.action === 'report') {
    if (!Array.isArray(body.threats) || body.threats.length > 30) {
      return NextResponse.json({ error: 'A bounded list of security events is required.' }, { status: 400 });
    }
    const rows = body.threats.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return null;
      const threat = item as Record<string, unknown>;
      if (
        typeof threat.type !== 'string'
        || typeof threat.severity !== 'string'
        || typeof threat.description !== 'string'
        || threat.description.length > 1000
      ) return null;
      const metadata = typeof threat.metadata === 'object' && threat.metadata !== null && !Array.isArray(threat.metadata)
        ? threat.metadata as Record<string, unknown>
        : {};
      const ipAddress = typeof metadata.ip === 'string' ? metadata.ip.slice(0, 100) : null;
      return {
        type: threat.type.slice(0, 100),
        severity: threat.severity.slice(0, 30).toUpperCase(),
        description: threat.description,
        status: 'OPEN',
        ip_address: ipAddress,
        metadata,
        fingerprint: `${threat.type}:${threat.description}`.slice(0, 1000)
      };
    });
    if (rows.some(row => row === null)) {
      return NextResponse.json({ error: 'Security event fields are invalid.' }, { status: 400 });
    }
    if (rows.length === 0) return NextResponse.json({ success: true });
    const validRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    const uniqueRows = Array.from(new Map(validRows.map(row => [row.fingerprint, row])).values());
    const { error } = await result.client.from('security_threats').upsert(uniqueRows, {
      onConflict: 'fingerprint',
      ignoreDuplicates: true
    });
    if (error) {
      console.error('[SecurityLogs] Could not record scanner results:', error);
      return NextResponse.json({ error: `Could not record security events: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (result.session.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can change security threat status or block an origin.' }, { status: 403 });
  }
  if (
    (body.action !== 'ignore' && body.action !== 'block')
    || typeof body.threatId !== 'string'
    || !/^[0-9a-f-]{36}$/i.test(body.threatId)
  ) {
    return NextResponse.json({ error: 'A valid threat and action are required.' }, { status: 400 });
  }

  const { data: threat, error: threatError } = await result.client
    .from('security_threats')
    .select('id, ip_address, status')
    .eq('id', body.threatId)
    .maybeSingle();
  if (threatError) {
    console.error('[SecurityLogs] Could not load threat for action:', threatError);
    return NextResponse.json({ error: `Could not load security threat: ${threatError.message}` }, { status: 500 });
  }
  if (!threat) return NextResponse.json({ error: 'Security threat was not found.' }, { status: 404 });

  if (body.action === 'block') {
    if (!threat.ip_address || threat.ip_address === 'unknown') {
      return NextResponse.json({ error: 'This threat has no usable origin IP to block.' }, { status: 400 });
    }
    const { error } = await result.client.from('ip_blacklist').upsert({
      ip_address: threat.ip_address,
      reason: `Blocked from security threat ${threat.id}`,
      active: true,
      created_by: result.session.email || 'owner'
    });
    if (error) {
      console.error('[SecurityLogs] Could not block threat origin:', error);
      return NextResponse.json({ error: `Could not block origin: ${error.message}` }, { status: 500 });
    }
  }

  const { error: updateError } = await result.client
    .from('security_threats')
    .update({
      status: body.action === 'block' ? 'BLOCKED' : 'IGNORED',
      resolved_at: new Date().toISOString(),
      resolved_by: result.session.email || 'owner'
    })
    .eq('id', threat.id);
  if (updateError) {
    console.error('[SecurityLogs] Could not update threat status:', updateError);
    return NextResponse.json({ error: `Security action was applied, but the threat status could not be updated: ${updateError.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
