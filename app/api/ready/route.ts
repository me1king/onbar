import { NextResponse } from "next/server";
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    const database = createServerSupabaseClient();
    if (!database) {
        return NextResponse.json({
            status: 'NOT_READY',
            checks: { application: 'OK', database: 'NOT_CONFIGURED' },
            timestamp: new Date().toISOString()
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    const { error } = await database.from('settings').select('key').limit(1);
    if (error) {
        console.error('[Readiness] Required database probe failed:', error);
        return NextResponse.json({
            status: 'NOT_READY',
            checks: { application: 'OK', database: 'UNAVAILABLE' },
            timestamp: new Date().toISOString()
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({
        status: 'READY',
        checks: { application: 'OK', database: 'OK' },
        timestamp: new Date().toISOString()
    }, { headers: { 'Cache-Control': 'no-store' } });
}
