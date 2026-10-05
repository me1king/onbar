import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
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

const FALLBACK_WARNING = 'The behavior metrics migration is not installed. Showing available legacy metrics; engagement time is unavailable until the migration is applied.';

function getNairobiDayStart() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return new Date(Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        -3
    )).toISOString();
}

async function getEventSessionIds(
    database: SupabaseClient,
    eventName: string,
    since: string
) {
    const sessionIds = new Set<string>();
    const pageSize = 1000;
    const maxRows = 100_000;

    for (let offset = 0; offset < maxRows; offset += pageSize) {
        const { data, error } = await database
            .from('analytics_events')
            .select('session_id')
            .eq('event_name', eventName)
            .gte('created_at', since)
            .not('session_id', 'is', null)
            .range(offset, offset + pageSize - 1);
        if (error) throw new Error(`Could not load ${eventName} sessions: ${error.message}`);

        for (const row of data || []) {
            if (typeof row.session_id === 'string') sessionIds.add(row.session_id);
        }
        if (!data || data.length < pageSize) return sessionIds;
    }

    throw new Error(`Behavior event scan exceeded ${maxRows} rows.`);
}

async function getLegacyMetrics(database: SupabaseClient): Promise<BehaviorMetrics> {
    const now = new Date();
    const dayStart = getNairobiDayStart();
    const [liveUsers, eventsToday, rageClicks, zeroResults, visitorSessions, cartSessions] = await Promise.all([
        database.from('customer_sessions')
            .select('id', { count: 'exact', head: true })
            .gte('last_seen_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString()),
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', dayStart),
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', 'RAGE_CLICK')
            .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', 'ZERO_RESULTS')
            .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
        getEventSessionIds(database, 'PAGE_VIEW', dayStart),
        getEventSessionIds(database, 'ADD_TO_CART', dayStart)
    ]);

    for (const result of [liveUsers, eventsToday, rageClicks, zeroResults]) {
        if (result.error) throw new Error(`Could not load legacy behavior metrics: ${result.error.message}`);
        if (result.count === null) throw new Error('Supabase did not return an exact legacy metric count.');
    }

    const visitorIds = visitorSessions;
    const cartIds = cartSessions;
    const cartSessionCount = [...cartIds].filter(id => visitorIds.has(id)).length;

    return {
        live_users: liveUsers.count!,
        events_today: eventsToday.count!,
        avg_active_sec: null,
        cart_rate: visitorIds.size === 0 ? null : Math.round(1000 * cartSessionCount / visitorIds.size) / 10,
        cart_sessions: cartSessionCount,
        visitor_sessions: visitorIds.size,
        rage_clicks_24h: rageClicks.count!,
        zero_results_24h: zeroResults.count!
    };
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
        const missingFunction = error.code === '42883' || error.code === 'PGRST202';
        if (missingFunction) {
            try {
                console.warn('[BehaviorMetrics] Database metrics function is missing; returning available legacy metrics.');
                const metrics = await getLegacyMetrics(database);
                return NextResponse.json({ metrics, warning: FALLBACK_WARNING });
            } catch (fallbackError) {
                console.error('[BehaviorMetrics] Legacy metrics fallback failed:', fallbackError);
                return NextResponse.json({
                    error: fallbackError instanceof Error ? fallbackError.message : 'Legacy behavior metrics could not be loaded.',
                    migrationRequired: true
                }, { status: 503 });
            }
        }

        console.error('[BehaviorMetrics] Could not load behavior metrics:', error);
        return NextResponse.json({
            error: `Behavior metrics could not be loaded: ${error.message}`
        }, { status: 500 });
    }

    const metrics = (Array.isArray(data) ? data[0] : data) as BehaviorMetrics | null;
    if (!metrics) {
        return NextResponse.json({ error: 'The database returned no behavior metrics.' }, { status: 502 });
    }

    return NextResponse.json({ metrics });
}
