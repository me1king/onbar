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

export async function GET() {
    const result = await getAuditClient();
    if ('response' in result) return result.response;

    const { data, error } = await result.client
        .from('audit_logs')
        .select('id, staff_email, actor_id, action, details, resource_type, resource_id, old_value, new_value, correlation_id, request_id, ip_address, device_info, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error('[AdminAudit] Could not load audit logs:', error);
        return NextResponse.json({ error: `Could not load audit logs: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ logs: data || [] });
}

export async function POST() {
    const result = await getAuditClient();
    if ('response' in result) return result.response;

    const { error, count } = await result.client
        .from('audit_logs')
        .select('id', { count: 'exact', head: true });
    if (error) {
        console.error('[AdminAudit] Audit health check failed:', error);
        return NextResponse.json({ error: `Audit log health check failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ healthy: true, count: count ?? 0 });
}

export async function DELETE() {
    const result = await getAuditClient(true);
    if ('response' in result) return result.response;

    const { error } = await result.client
        .from('audit_logs')
        .delete()
        .neq('action', 'NUCLEAR_RESET');
    if (error) {
        console.error('[AdminAudit] Could not clear audit logs:', error);
        return NextResponse.json({ error: `Could not clear audit logs: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
