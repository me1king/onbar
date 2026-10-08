import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const FUNNEL_WINDOW_DAYS = 30;

export async function GET() {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    if (!['owner', 'admin'].includes(session.role.toLowerCase())
        && !hasAdminPermission(session, 'can_view_revenue')) {
        return NextResponse.json({ error: 'Funnel analytics access is required.' }, { status: 403 });
    }

    const database = createServerSupabaseClient();
    if (!database) {
        return NextResponse.json({
            error: 'Server-side Supabase access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        }, { status: 503 });
    }

    const since = new Date(Date.now() - FUNNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [discovery, browse, cart, conversion] = await Promise.all([
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', 'PAGE_VIEW')
            .gte('created_at', since),
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', 'PRODUCT_VIEW')
            .gte('created_at', since),
        database.from('analytics_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_name', 'CHECKOUT_START')
            .gte('created_at', since),
        database.from('orders')
            .select('id', { count: 'exact', head: true })
            .ilike('status', 'delivered')
            .gte('created_at', since)
    ]);

    const metrics: Array<[string, typeof discovery]> = [
        ['page-view events', discovery],
        ['product-view events', browse],
        ['checkout-start events', cart],
        ['delivered orders', conversion]
    ];
    const failedMetric = metrics.find(([, result]) => result.error);

    if (failedMetric) {
        const [label, result] = failedMetric;
        console.error(`[AdminFunnel] Could not load ${label}:`, result.error);
        const missingSchema = result.error?.code === '42P01'
            || result.error?.code === '42703'
            || result.error?.code === 'PGRST204'
            || result.error?.code === 'PGRST202'
            || result.error?.code === 'PGRST205';
        return NextResponse.json({
            error: missingSchema
                ? `Could not load ${label}; the Supabase schema is missing the required table or column. Apply the documented core and analytics migrations, then reload.`
                : `Could not load ${label}: ${result.error?.message || 'Supabase returned an unknown error.'}`
        }, { status: 503 });
    }

    return NextResponse.json({
        discovery: discovery.count ?? 0,
        browse: browse.count ?? 0,
        cart: cart.count ?? 0,
        conversion: conversion.count ?? 0,
        windowDays: FUNNEL_WINDOW_DAYS
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
