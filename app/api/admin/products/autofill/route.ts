import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export async function GET(request: Request) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    if (!hasAdminPermission(session, 'can_manage_inventory')) {
        return NextResponse.json({ error: "Inventory permission required." }, { status: 403 });
    }
    if (!supabase) return NextResponse.json({ error: "DB offline" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ suggestions: [] });
    }

    try {
        // Step 1: Search Local Master Catalog (High Precision)
        const { data: localMatches, error: localErr } = await supabase
            .from('master_drink_catalog')
            .select('*')
            .ilike('name', `%${query}%`)
            .limit(5);

        if (localErr) throw localErr;

        // Step 2: Failover to Open Food Facts (Optional - simplified for now)
        // In a real SaaS, we'd fetch from World Open Food Facts here.

        return NextResponse.json({
            suggestions: localMatches || []
        });

    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
