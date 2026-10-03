import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const contentSources = new Set(['TRENDING', 'LOW_STOCK', 'EDITORIAL']);

function getAdminDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function authorizeAdmin() {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    return session && (
        session.role === 'owner'
        || session.role === 'admin'
        || session.permissions?.can_manage_marketing === true
    );
}

function isValidId(id: unknown): id is string {
    return typeof id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET() {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Autopilot database access is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database
        .from('growth_autopilot_rules')
        .select('id, slot_day_of_week, slot_time, platform, content_source, is_active')
        .order('slot_day_of_week')
        .order('slot_time');

    if (error) {
        console.error('[AutopilotRules] Could not load rules:', error);
        const missingTable = error.code === '42P01' || error.code === 'PGRST205';
        return NextResponse.json({
            error: missingTable
                ? 'Autopilot storage is missing. Run supabase/ADMIN_CONTROLS_MIGRATION.sql in Supabase.'
                : `Could not load autopilot rules: ${error.message}`
        }, { status: 500 });
    }

    return NextResponse.json({ rules: data || [] });
}

export async function POST(request: Request) {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    let body: { slot_day_of_week?: unknown; slot_time?: unknown; platform?: unknown; content_source?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid autopilot schedule is required.' }, { status: 400 });
    }

    const day = body.slot_day_of_week;
    const time = typeof body.slot_time === 'string' ? body.slot_time : '';
    const platform = typeof body.platform === 'string' ? body.platform.trim().toUpperCase() : '';
    const source = typeof body.content_source === 'string' ? body.content_source : '';
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
        || !/^[A-Z][A-Z0-9_ -]{1,31}$/.test(platform)
        || !contentSources.has(source)) {
        return NextResponse.json({ error: 'Choose a weekday, valid time, platform, and content source.' }, { status: 400 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Autopilot database access is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database.from('growth_autopilot_rules').insert({
        slot_day_of_week: day,
        slot_time: time,
        platform,
        content_source: source,
        is_active: true
    }).select('id, slot_day_of_week, slot_time, platform, content_source, is_active').single();

    if (error) {
        console.error('[AutopilotRules] Could not create rule:', error);
        return NextResponse.json({ error: `Could not create autopilot slot: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
}

export async function PATCH(request: Request) {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    let body: { id?: unknown; is_active?: unknown };
    try {
        body = await request.json() as typeof body;
    } catch {
        return NextResponse.json({ error: 'A valid rule ID and active state are required.' }, { status: 400 });
    }

    if (!isValidId(body.id) || typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'A valid rule ID and active state are required.' }, { status: 400 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Autopilot database access is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database
        .from('growth_autopilot_rules')
        .update({ is_active: body.is_active })
        .eq('id', body.id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[AutopilotRules] Could not update rule:', error);
        return NextResponse.json({ error: `Could not update autopilot slot: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Autopilot slot was not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
    if (!await authorizeAdmin()) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!isValidId(id)) {
        return NextResponse.json({ error: 'A valid autopilot rule ID is required.' }, { status: 400 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'Autopilot database access is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database
        .from('growth_autopilot_rules')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[AutopilotRules] Could not delete rule:', error);
        return NextResponse.json({ error: `Could not delete autopilot slot: ${error.message}` }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Autopilot slot was not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
}
