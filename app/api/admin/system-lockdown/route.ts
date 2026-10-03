import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getAdminDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

export async function GET() {
    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'System status is not configured on the server.' }, { status: 500 });
    }

    const { data, error } = await database
        .from('settings')
        .select('value')
        .eq('key', 'system_lockdown')
        .maybeSingle();

    if (error) {
        console.error('[SystemLockdown] Could not load lockdown status:', error);
        return NextResponse.json({ error: `Could not load lockdown status: ${error.message}` }, { status: 500 });
    }

    const value: unknown = data?.value;
    const active = typeof value === 'object' && value !== null && 'active' in value && value.active === true;
    return NextResponse.json({ active });
}

export async function PUT(request: Request) {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    let body: { active?: unknown };
    try {
        body = await request.json() as { active?: unknown };
    } catch {
        return NextResponse.json({ error: 'A valid lockdown state is required.' }, { status: 400 });
    }

    if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'A valid lockdown state is required.' }, { status: 400 });
    }

    const database = getAdminDatabase();
    if (!database) {
        return NextResponse.json({ error: 'System settings are not configured on the server.' }, { status: 500 });
    }

    const { error } = await database.from('settings').upsert({
        key: 'system_lockdown',
        value: { active: body.active, timestamp: new Date().toISOString() },
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    if (error) {
        console.error('[SystemLockdown] Could not save lockdown status:', error);
        return NextResponse.json({ error: `Could not save lockdown status: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ active: body.active });
}
