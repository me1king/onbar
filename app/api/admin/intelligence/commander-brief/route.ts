import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const BUSINESS_TIME_ZONE = 'Africa/Nairobi';
const PAGE_SIZE = 1000;
const MAX_REVENUE_ROWS = 100_000;

function getNairobiMidnight(date: Date, daysOffset = 0) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const utcMidnight = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day) + daysOffset
    );

    // Nairobi uses UTC+03:00; convert its calendar midnight to a UTC instant.
    return new Date(utcMidnight - 3 * 60 * 60 * 1000).toISOString();
}

async function getRevenueTotal(database: SupabaseClient, start: string, end: string) {
    let total = 0;

    for (let offset = 0; offset < MAX_REVENUE_ROWS; offset += PAGE_SIZE) {
        const { data, error } = await database
            .from('financial_ledger')
            .select('amount')
            .eq('entry_type', 'REVENUE')
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Could not load revenue ledger: ${error.message}`);

        for (const row of data || []) {
            const amount = Number(row.amount);
            if (!Number.isFinite(amount)) throw new Error('Revenue ledger contains an invalid amount.');
            total += amount;
        }

        if (!data || data.length < PAGE_SIZE) return total;
    }

    throw new Error(`Revenue ledger scan exceeded ${MAX_REVENUE_ROWS} rows.`);
}

async function getCommanderBriefResponse() {
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

    try {
        const now = new Date();
        const todayStart = getNairobiMidnight(now);
        const yesterdayStart = getNairobiMidnight(now, -1);
        const comparisonStart = getNairobiMidnight(now, -8);

        const countQuery = (table: string, start: string, end: string) => database
            .from(table)
            .select('id', { count: 'exact', head: true })
            .gte('created_at', start)
            .lt('created_at', end);

        const [
            yesterdayOrders,
            previousWeekOrders,
            revenueTotal,
            executedAutomations,
            totalAutomations,
            openExceptions
        ] = await Promise.all([
            countQuery('orders', yesterdayStart, todayStart),
            countQuery('orders', comparisonStart, yesterdayStart),
            getRevenueTotal(database, yesterdayStart, todayStart),
            database.from('automation_runs')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'EXECUTED')
                .gte('created_at', yesterdayStart)
                .lt('created_at', todayStart),
            countQuery('automation_runs', yesterdayStart, todayStart),
            database.from('exception_log')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'Open')
        ]);

        const countResults = [
            yesterdayOrders,
            previousWeekOrders,
            executedAutomations,
            totalAutomations,
            openExceptions
        ];
        const failedCount = countResults.find(result => result.error || result.count === null);
        if (failedCount?.error) throw new Error(`Could not load dashboard metrics: ${failedCount.error.message}`);
        if (failedCount) throw new Error('The database did not return an exact dashboard metric count.');

        const orderCount = yesterdayOrders.count!;
        const priorWeekAverage = (previousWeekOrders.count || 0) / 7;
        const executionCount = executedAutomations.count!;
        const automationCount = totalAutomations.count!;
        const autoRate = automationCount === 0
            ? null
            : Math.round((executionCount / automationCount) * 1000) / 10;
        const dateLabel = new Intl.DateTimeFormat('en-KE', {
            timeZone: BUSINESS_TIME_ZONE,
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(new Date(yesterdayStart));

        let brief = `For ${dateLabel}, ${orderCount} ${orderCount === 1 ? 'order was' : 'orders were'} recorded, versus a previous 7-day daily average of ${priorWeekAverage.toFixed(1)}. Revenue ledger entries totalled KSh ${revenueTotal.toLocaleString('en-KE')}.`;
        if (orderCount === 0 && revenueTotal === 0) {
            brief += ' If sales were expected, verify that orders and payments synced before treating this as a confirmed zero.';
        } else if (orderCount > 0 && revenueTotal === 0) {
            brief += ' Orders exist but no revenue entries were found; check payment and ledger sync.';
        }

        return NextResponse.json({
            brief,
            autoRate,
            automationCount,
            executedAutomationCount: executionCount,
            exceptionsCount: openExceptions.count,
            orderCount,
            revenueTotal,
            periodStart: yesterdayStart,
            periodEnd: todayStart,
            comparisonAverageOrders: Math.round(priorWeekAverage * 10) / 10,
            generatedAt: now.toISOString(),
            timeZone: BUSINESS_TIME_ZONE
        });
    } catch (error) {
        console.error('[CommanderBrief] Could not generate an accurate brief:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Could not load Commander Brief metrics.'
        }, { status: 500 });
    }
}

export async function GET() {
    try {
        return await getCommanderBriefResponse();
    } catch (error) {
        console.error('[CommanderBrief] Request failed before metrics could be generated:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Could not load Commander Brief metrics.'
        }, { status: 500, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }
}
