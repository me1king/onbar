import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

interface DataQualityAlert {
    id: number;
    issue_type: string;
    severity: string | null;
    description: string | null;
    affected_count: number | null;
    status: string | null;
    created_at: string;
}

type AdminClientResult =
    | { ok: true; client: SupabaseClient }
    | { ok: false; response: NextResponse };

async function getAdminClient(): Promise<AdminClientResult> {
    const cookieStore = await cookies();
    const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
    if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 })
        };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 500 })
        };
    }

    return {
        ok: true,
        client: createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })
    };
}

export async function GET() {
    const admin = await getAdminClient();
    if (!admin.ok) return admin.response;

    const [alertsResult, consentResult, profilesResult] = await Promise.all([
        admin.client
            .from('data_quality_alerts')
            .select('id, issue_type, severity, description, affected_count, status, created_at')
            .eq('status', 'OPEN')
            .order('created_at', { ascending: false })
            .limit(100),
        admin.client.from('user_consent').select('id', { count: 'exact', head: true }),
        admin.client.from('profiles').select('id', { count: 'exact', head: true })
    ]);

    const queryError = alertsResult.error || consentResult.error || profilesResult.error;
    if (queryError) {
        console.error('[AdminGovernance] Unable to load governance data:', queryError);
        const isMissingGovernanceSchema = queryError.code === '42P01' || queryError.code === 'PGRST205';
        return NextResponse.json(
            {
                error: isMissingGovernanceSchema
                    ? 'Governance tables are not installed. Run supabase/GOVERNANCE_MIGRATION.sql in the Supabase SQL Editor.'
                    : `Governance data could not be loaded: ${queryError.message}`
            },
            { status: 500 }
        );
    }

    if (consentResult.count === null || profilesResult.count === null) {
        return NextResponse.json(
            { error: 'Supabase did not return exact governance record counts. Check database access and retry.' },
            { status: 502 }
        );
    }

    return NextResponse.json({
        consentRecords: consentResult.count,
        profiles: profilesResult.count,
        alerts: (alertsResult.data || []) as DataQualityAlert[]
    });
}
