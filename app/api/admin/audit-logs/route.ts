import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function getAuditClient(ownerOnly = false) {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    const canViewLogs = session?.role === 'owner'
        || session?.permissions?.can_view_audit_logs === true;
    if (!session || (ownerOnly ? session.role !== 'owner' : !canViewLogs)) {
        return {
            response: NextResponse.json({ error: 'Audit log access required.' }, { status: 403 })
        };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return {
            response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 500 })
        };
    }

    return {
        client: createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })
    };
}

export async function GET(request: Request) {
    const result = await getAuditClient();
    if ('response' in result) return result.response;

    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get('verify') === 'true') {
        const { data, error } = await result.client.rpc('verify_audit_log_chain');
        if (error) {
            console.error('[AdminAudit] Could not verify the audit hash chain:', error);
            return NextResponse.json({ error: `Could not verify audit integrity: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ integrity: data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const actorId = searchParams.get('actorId');
    const resourceId = searchParams.get('resourceId')?.trim();
    const resourceType = searchParams.get('resourceType')?.trim();
    const action = searchParams.get('action')?.trim();
    const search = searchParams.get('q')?.trim();
    if (actorId && !/^[0-9a-f-]{36}$/i.test(actorId)) {
        return NextResponse.json({ error: 'A valid staff actor ID is required.' }, { status: 400 });
    }
    if (
        (resourceId && resourceId.length > 200)
        || (resourceType && !/^[a-z0-9_-]{1,100}$/i.test(resourceType))
        || (action && !/^[a-z0-9_-]{1,100}$/i.test(action))
        || (search && search.length > 100)
    ) {
        return NextResponse.json({ error: 'Audit search filters are invalid.' }, { status: 400 });
    }
    let query = result.client
        .from('audit_logs')
        .select('id, staff_email, actor_id, actor_type, actor_label, actor_role, action, outcome, details, resource_type, resource_id, old_value, new_value, previous_hash, event_hash, correlation_id, request_id, ip_address, device_info, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
    if (actorId) query = query.eq('actor_id', actorId);
    if (resourceId) query = query.eq('resource_id', resourceId);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (action) query = query.eq('action', action);
    if (search) {
        const safeSearch = search.replace(/[^a-zA-Z0-9@._:+\- ]/g, '').trim();
        if (safeSearch) {
            const pattern = `%${safeSearch}%`;
            query = query.or(`staff_email.ilike.${pattern},action.ilike.${pattern},resource_id.ilike.${pattern}`);
        }
    }
    const { data, error } = await query;

    if (error) {
        console.error('[AdminAudit] Could not load audit logs:', error);
        return NextResponse.json({ error: `Could not load audit logs: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ logs: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

function redactSensitiveAuditFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactSensitiveAuditFields);
    if (typeof value !== 'object' || value === null) return value;

    return Object.fromEntries(
        Object.entries(value).flatMap(([key, child]) =>
            /password|token|secret|authorization|cookie|session|pin|cvv|card.?number|payment.?credential/i.test(key)
                ? []
                : [[key, redactSensitiveAuditFields(child)]]
        )
    );
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 });
    }
    const client = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    let rawBody = '';
    try {
        rawBody = await request.text();
    } catch {
        return NextResponse.json({ error: 'Could not read audit request.' }, { status: 400 });
    }

    if (!rawBody) {
        if (
            session.role !== 'owner'
            && session.permissions?.can_view_audit_logs !== true
        ) return NextResponse.json({ error: 'Audit log access required.' }, { status: 403 });

        const { error, count } = await client
            .from('audit_logs')
            .select('id', { count: 'exact', head: true });
        if (error) {
            console.error('[AdminAudit] Audit health check failed:', error);
            return NextResponse.json({ error: `Audit log health check failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ healthy: true, count: count ?? 0 });
    }
    if (rawBody.length > 16_384) {
        return NextResponse.json({ error: 'Audit event is too large.' }, { status: 413 });
    }

    let body: {
        action?: unknown;
        details?: unknown;
        resource?: { type?: unknown; id?: unknown };
        diff?: { old?: unknown; new?: unknown };
    };
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'A valid audit event is required.' }, { status: 400 });
    }
    if (
        typeof body.action !== 'string'
        || !/^[A-Z0-9_]{1,100}$/i.test(body.action)
        || (body.details !== undefined && (
            typeof body.details !== 'object' || body.details === null || Array.isArray(body.details)
        ))
    ) {
        return NextResponse.json({ error: 'A valid audit action and details are required.' }, { status: 400 });
    }

    const email = session.email || (session.role === 'owner' ? 'Owner (PIN)' : 'Admin');
    let actorId: string | null = null;
    if (email !== 'Owner (PIN)' && email !== 'Admin') {
        const { data: staff } = await client.from('staff').select('id').eq('email', email).maybeSingle();
        actorId = staff?.id || null;
    }
    const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? body.details as Record<string, unknown>
        : {};
    const inferredResourceType = body.action.toUpperCase().includes('ORDER')
        ? 'order'
        : body.action.toUpperCase().includes('PRODUCT')
            ? 'product'
            : null;
    const inferredResourceId = typeof details.id === 'string' || typeof details.id === 'number'
        ? String(details.id)
        : null;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')?.trim()
        || 'unknown';
    const { error } = await client.from('audit_logs').insert({
        staff_email: email,
        actor_id: actorId,
        actor_type: 'staff',
        actor_label: email,
        actor_role: session.role,
        action: body.action,
        outcome: 'SUCCESS',
        details: redactSensitiveAuditFields(details),
        resource_type: typeof body.resource?.type === 'string'
            ? body.resource.type.slice(0, 100)
            : inferredResourceType,
        resource_id: typeof body.resource?.id === 'string'
            ? body.resource.id.slice(0, 200)
            : inferredResourceId,
        old_value: redactSensitiveAuditFields(body.diff?.old ?? null),
        new_value: redactSensitiveAuditFields(body.diff?.new ?? null),
        correlation_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        ip_address: ipAddress.slice(0, 100),
        device_info: request.headers.get('user-agent')?.slice(0, 512) || 'Unknown',
        created_at: new Date().toISOString()
    });
    if (error) {
        console.error('[AdminAudit] Could not record audit event:', error);
        return NextResponse.json({ error: `Could not record audit event: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
