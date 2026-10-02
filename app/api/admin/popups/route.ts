import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const allowedStyles = new Set(['success', 'info', 'warning', 'error', 'default']);
const allowedPriorities = new Set(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);

type AdminClientResult =
    | { ok: true; client: SupabaseClient }
    | { ok: false; response: NextResponse };

async function getAdminClient() {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
        return { ok: false, response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) } satisfies AdminClientResult;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return { ok: false, response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 500 }) } satisfies AdminClientResult;
    }

    return { ok: true, client: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) } satisfies AdminClientResult;
}

export async function GET() {
    const admin = await getAdminClient();
    if (!admin.ok) return admin.response;

    const [{ data: templates, error: templatesError }, { data: logs, error: logsError }] = await Promise.all([
        admin.client.from('notification_templates').select('*').order('name'),
        admin.client.from('notifications_log')
            .select('id, order_id, status, created_at, notification_templates(name)')
            .order('created_at', { ascending: false })
            .limit(5)
    ]);

    if (templatesError || logsError) {
        const message = templatesError?.message || logsError?.message || 'Unable to read popup data.';
        console.error('[AdminPopups] Unable to read popup data:', templatesError || logsError);
        return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [], logs: logs || [] });
}

export async function POST(request: Request) {
    const admin = await getAdminClient();
    if (!admin.ok) return admin.response;

    try {
        const body = await request.json() as Record<string, unknown>;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : '';
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const style = typeof body.style === 'string' ? body.style : '';
        const priority = typeof body.priority === 'string' ? body.priority : '';
        const duration = Number(body.duration);

        if (!name || !eventType || !title || !message
            || !/^[A-Z][A-Z0-9_]{1,63}$/i.test(eventType)
            || !allowedStyles.has(style)
            || !allowedPriorities.has(priority)
            || !Number.isInteger(duration) || duration < 1 || duration > 60) {
            return NextResponse.json({ error: 'Provide a name, valid event type, title, message, style, priority, and duration from 1 to 60 seconds.' }, { status: 400 });
        }

        const template = {
            ...(typeof body.id === 'string' && body.id ? { id: body.id } : {}),
            name,
            event_type: eventType,
            title,
            message,
            icon: typeof body.icon === 'string' && body.icon ? body.icon : 'Bell',
            style,
            duration,
            priority,
            is_active: body.is_active === true,
            cta_url: typeof body.cta_url === 'string' && body.cta_url ? body.cta_url : null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await admin.client.from('notification_templates').upsert(template).select('*').single();
        if (error) throw error;
        return NextResponse.json({ template: data });
    } catch (error) {
        console.error('[AdminPopups] Unable to save popup template:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save popup template.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const admin = await getAdminClient();
    if (!admin.ok) return admin.response;

    try {
        const body = await request.json() as { id?: unknown; is_active?: unknown };
        if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)
            || typeof body.is_active !== 'boolean') {
            return NextResponse.json({ error: 'A valid template ID and active state are required.' }, { status: 400 });
        }

        const { error } = await admin.client.from('notification_templates')
            .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
            .eq('id', body.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[AdminPopups] Unable to update popup state:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update popup state.' }, { status: 500 });
    }
}
