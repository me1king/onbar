import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

interface AnalyticsEvent {
    payload: Record<string, unknown> | null;
    page_url: string | null;
    created_at: string;
}

export async function GET(request: Request) {
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

    const requestedDays = Number(new URL(request.url).searchParams.get('days') || 7);
    const days = Number.isFinite(requestedDays) ? Math.min(30, Math.max(1, Math.floor(requestedDays))) : 7;
    const database = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const pageSize = 1000;
    const maximumSample = 20_000;
    const events: AnalyticsEvent[] = [];
    let totalEvents: number | null = null;

    for (let offset = 0; offset < maximumSample; offset += pageSize) {
        const { data, count, error } = await database
            .from('analytics_events')
            .select('payload,page_url,created_at', { count: 'exact' })
            .eq('event_name', 'UI_INTERACTION')
            .gte('created_at', since)
            .not('payload->>x_percent', 'is', null)
            .not('payload->>y_percent', 'is', null)
            .not('payload->>viewport_width', 'is', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) {
            console.error('[AnalyticsHeatmap] Could not load recorded clicks:', error);
            return NextResponse.json({ error: `Recorded click data could not be loaded: ${error.message}` }, { status: 500 });
        }

        if (totalEvents === null) totalEvents = count ?? data?.length ?? 0;
        events.push(...((data || []) as AnalyticsEvent[]));
        if (!data || data.length < pageSize || events.length >= totalEvents) break;
    }

    const clicks = events.flatMap(event => {
        const payload = event.payload;
        const x = payload?.x_percent;
        const y = payload?.y_percent;
        const width = payload?.viewport_width;
        if (
            typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 100 ||
            typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 100 ||
            typeof width !== 'number' || !Number.isFinite(width) || width < 1
        ) return [];

        const rawPath = event.page_url || payload?.url;
        const path = typeof rawPath === 'string' && rawPath.startsWith('/')
            ? rawPath.split('?')[0]
            : '/';

        return [{
            x,
            y,
            path,
            device: width < 768 ? 'mobile' as const : 'desktop' as const,
            coordinateSpace: payload?.coordinate_space === 'fixed' || payload?.coordinate_space === 'sticky'
                ? 'floating' as const
                : 'page' as const
        }];
    });

    return NextResponse.json({
        clicks,
        days,
        totalEvents: totalEvents ?? events.length,
        sampledEvents: events.length,
        truncated: (totalEvents ?? events.length) > events.length
    });
}
