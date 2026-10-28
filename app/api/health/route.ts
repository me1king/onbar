import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

/**
 * ONLINE BAR: DEEP HEALTH CHECK
 * Verifies all system dependencies are operational.
 */
export async function GET() {
    const start = performance.now();
    const reports: Record<string, unknown> = {};
    let isHealthy = true;
    const warnings: string[] = [];

    try {
        // 1. Database Pulse
        if (!supabase) throw new Error("Supabase Client Not Configured");
        const dbStart = performance.now();
        const { error: dbError } = await supabase.from('settings').select('key').limit(1);
        const dbLatency = Math.round(performance.now() - dbStart);
        const dbStatus = dbError ? 'ERROR' : dbLatency > 1500 ? 'SLOW' : 'OK';
        reports.database = {
            status: dbStatus,
            latency: `${dbLatency}ms`,
            error: dbError?.message
        };
        if (dbError || dbLatency > 1500) {
            isHealthy = false;
            if (dbLatency > 1500) warnings.push(`Supabase DB is slow: ${dbLatency}ms latency`);
        }

        // 2. Storage Pulse
        const storageStart = performance.now();
        const { error: stError } = await supabase.storage.listBuckets();
        const storageLatency = Math.round(performance.now() - storageStart);
        const storageStatus = stError ? 'ERROR' : storageLatency > 1500 ? 'SLOW' : 'OK';
        reports.storage = {
            status: storageStatus,
            latency: `${storageLatency}ms`
        };
        if (stError || storageLatency > 1500) {
            isHealthy = false;
            if (storageLatency > 1500) warnings.push(`Supabase storage is slow: ${storageLatency}ms latency`);
        }

        // 3. Environment Context
        reports.environment = process.env.NODE_ENV;
        reports.email = (
            process.env.JMSURF_MAIL_KEY?.trim() && process.env.JMSURF_FROM_EMAIL?.trim()
        ) || (
            process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()
        )
            ? 'Configured'
            : 'Not configured';
        reports.total_latency = `${Math.round(performance.now() - start)}ms`;
        if (warnings.length) reports.warnings = warnings;

        return NextResponse.json(
            { status: isHealthy ? 'HEALTHY' : 'DEGRADED', ...reports },
            { status: isHealthy ? 200 : 503 }
        );

    } catch (err: unknown) {
        return NextResponse.json(
            { status: 'DOWN', error: (err as Error).message },
            { status: 500 }
        );
    }
}
