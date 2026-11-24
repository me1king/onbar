import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPeakHoursResponse(value: unknown, requestedDays: number): boolean {
  if (!isRecord(value)
    || typeof value.days !== 'number'
    || !Number.isInteger(value.days)
    || value.days !== requestedDays
    || typeof value.timezone !== 'string'
    || value.timezone !== 'Africa/Nairobi'
    || !Array.isArray(value.hours)
    || value.hours.length !== 24
    || !Array.isArray(value.heatmap)
    || value.heatmap.length !== 168
    || !Array.isArray(value.weekdays)
    || value.weekdays.length !== 7
    || !Array.isArray(value.funnel)
    || value.funnel.length !== 5
    || !Array.isArray(value.trafficSources)
    || !Array.isArray(value.shops)) {
    return false;
  }

  const isMetric = (item: unknown) => isRecord(item)
    && isNonNegativeNumber(item.visitors)
    && isNonNegativeNumber(item.orders)
    && isNonNegativeNumber(item.revenue);

  return value.hours.every(item => isMetric(item)
      && typeof item.hour === 'number' && Number.isInteger(item.hour) && item.hour >= 0 && item.hour < 24)
    && value.heatmap.every(item => isMetric(item)
      && typeof item.weekday === 'number' && Number.isInteger(item.weekday) && item.weekday >= 1 && item.weekday <= 7
      && typeof item.hour === 'number' && Number.isInteger(item.hour) && item.hour >= 0 && item.hour < 24)
    && value.weekdays.every(item => isMetric(item)
      && typeof item.weekday === 'number' && Number.isInteger(item.weekday) && item.weekday >= 1 && item.weekday <= 7
      && typeof item.sampleDays === 'number' && Number.isInteger(item.sampleDays) && item.sampleDays >= 0)
    && value.funnel.every(item => isRecord(item)
      && typeof item.label === 'string'
      && isNonNegativeNumber(item.sessions)
      && (item.percentage === null || (isNonNegativeNumber(item.percentage) && item.percentage <= 100)))
    && value.trafficSources.every(item => isRecord(item)
      && typeof item.source === 'string'
      && isNonNegativeNumber(item.sessions))
    && value.shops.every(item => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.acceptingOrders === 'boolean'
      && typeof item.openNow === 'boolean');
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Analytics access requires revenue permission.' }, { status: 403 });
  }

  const daysParameter = new URL(request.url).searchParams.get('days');
  const days = daysParameter === null ? 90 : Number(daysParameter);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return NextResponse.json({ error: 'Choose a reporting period between 1 and 90 days.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side analytics database access is not configured.' }, { status: 503 });
  }

  const { data, error } = await database.rpc('get_customer_time_insights', { p_days: days });
  if (error) {
    console.error('[PeakHours] Could not load customer time analytics:', error);
    const migrationMissing = error.code === '42883' || error.code === 'PGRST202';
    return NextResponse.json({
      error: migrationMissing
        ? 'Customer time analytics is not installed. Apply supabase/CUSTOMER_TIME_ANALYTICS_MIGRATION.sql and its prerequisites.'
        : `Customer time analytics could not be loaded: ${error.message}`
    }, { status: migrationMissing ? 503 : 500 });
  }
  if (!isPeakHoursResponse(data, days)) {
    return NextResponse.json({ error: 'Customer time analytics returned incomplete or invalid data.' }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
