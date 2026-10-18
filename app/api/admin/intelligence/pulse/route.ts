import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export async function GET() {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    if (!hasAdminPermission(session, 'can_view_revenue')) {
        return NextResponse.json({ error: "Analytics permission required." }, { status: 403 });
    }
    if (!supabase) return NextResponse.json({ error: "DB offline" }, { status: 500 });

    try {
        const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();

        // 1. Fetch Unique Visitors in last 60s (Heartbeats or Page Views)
        const { data: heartbeats } = await supabase
            .from('analytics_events')
            .select('anonymous_id, user_id, event_name, payload')
            .or(`event_name.eq.HEARTBEAT,event_name.eq.PAGE_VIEW`)
            .gte('timestamp', sixtySecondsAgo);

        const uniqueVisitors = new Set();
        let shoppingCount = 0;
        let checkoutCount = 0;

        heartbeats?.forEach(event => {
            const id = event.user_id || event.anonymous_id;
            if (id) uniqueVisitors.add(id);

            const payload = event.payload as { url?: string } | null;
            const path = payload?.url || '';
            if (path.includes('/shop')) shoppingCount++;
            if (path.includes('/checkout') || path.includes('/cart')) checkoutCount++;
        });

        return NextResponse.json({
            live_now: uniqueVisitors.size,
            shopping: shoppingCount,
            checkout: checkoutCount,
            timestamp: new Date().toISOString()
        });

    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
