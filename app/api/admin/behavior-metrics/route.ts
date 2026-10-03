import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

interface BehaviorMetrics {
    live_users: number;
    events_today: number;
    avg_active_sec: number | null;
    cart_rate: number | null;
    cart_sessions: number;
    visitor_sessions: number;
    rage_clicks_24h: number;
    zero_results_24h: number;
}

export async function GET() {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 500 });
    }

    const database = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await database.rpc('get_behavioral_metrics');
    if (error) {
        console.error('[BehaviorMetrics] Could not load behavior metrics:', error);
        const missingFunction = error.code === '42883' || error.code === 'PGRST202';
        return NextResponse.json({
            error: missingFunction
                ? 'Behavior metrics database update is missing. Run supabase/BEHAVIOR_METRICS_MIGRATION.sql in Supabase.'
                : `Behavior metrics could not be loaded: ${error.message}`
        }, { status: 500 });
    }

    const metrics = (Array.isArray(data) ? data[0] : data) as BehaviorMetrics | null;
    if (!metrics) {
        return NextResponse.json({ error: 'The database returned no behavior metrics.' }, { status: 502 });
    }

    return NextResponse.json({ metrics });
}
