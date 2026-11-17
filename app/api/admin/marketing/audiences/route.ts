import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function parseRules(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const spendMin = Number(record.spend_min);
  const ordersMin = Number(record.orders_min);
  const lastOrderDays = Number(record.last_order_days);
  if (
    !Number.isFinite(spendMin) || spendMin < 0 || spendMin > 1_000_000_000 ||
    !Number.isSafeInteger(ordersMin) || ordersMin < 0 || ordersMin > 1_000_000 ||
    !Number.isSafeInteger(lastOrderDays) || lastOrderDays < 0 || lastOrderDays > 36_500
  ) return null;

  return { spend_min: spendMin, orders_min: ordersMin, last_order_days: lastOrderDays };
}

async function getAuthorizedAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return { response: NextResponse.json({ error: 'Marketing permission is required.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Marketing database access is not configured on the server.' }, { status: 503 }) };
  }
  return { database };
}

async function estimateReach(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>, rules: ReturnType<typeof parseRules>) {
  if (!rules) return { error: 'Audience rules are invalid.' };
  const { data, error } = await database.rpc('count_matching_audience_members', {
    p_spend_min: rules.spend_min,
    p_orders_min: rules.orders_min,
    p_last_order_days: rules.last_order_days
  });
  if (error) {
    console.error('[Audiences] Could not calculate estimated reach:', error);
    return { error: 'Audience reach is unavailable. Check that the marketing CRM migration is installed.' };
  }
  return { reach: Number(data ?? 0) };
}

export async function GET() {
  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('audience_segments')
    .select('id, name, rules, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[Audiences] Could not load audience segments:', error);
    return NextResponse.json({ error: 'Could not load audience segments. Check the marketing schema and server database configuration.' }, { status: 503 });
  }

  const segments = await Promise.all((data || []).map(async segment => {
    const rules = parseRules(segment.rules) || { spend_min: 0, orders_min: 0, last_order_days: 0 };
    const estimate = await estimateReach(access.database, rules);
    return { ...segment, rules, estimated_reach: 'reach' in estimate ? estimate.reach : null };
  }));
  return NextResponse.json({ segments }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let body: JsonRecord;
  try {
    const record = asRecord(await request.json());
    if (!record) throw new Error('Invalid request body.');
    body = record;
  } catch {
    return NextResponse.json({ error: 'Send valid audience segment details.' }, { status: 400 });
  }

  const action = body.action;
  const rules = parseRules(body.rules);
  if (!rules) return NextResponse.json({ error: 'Spend, minimum orders, and last-order days must be valid non-negative values.' }, { status: 400 });

  if (action === 'estimate') {
    const estimate = await estimateReach(access.database, rules);
    if ('error' in estimate) return NextResponse.json({ error: estimate.error }, { status: 503 });
    return NextResponse.json({ reach: estimate.reach }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  if (action !== 'create') {
    return NextResponse.json({ error: 'Unsupported audience operation.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: 'Segment name must be between 2 and 120 characters.' }, { status: 400 });
  }

  const { data: segment, error } = await access.database
    .from('audience_segments')
    .insert({ name, rules })
    .select('id')
    .single();
  if (error) {
    console.error('[Audiences] Could not save audience segment:', error);
    return NextResponse.json({ error: 'Could not save the audience segment.' }, { status: 500 });
  }
  return NextResponse.json({ id: String(segment.id) }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let body: JsonRecord;
  try {
    const record = asRecord(await request.json());
    if (!record) throw new Error('Invalid request body.');
    body = record;
  } catch {
    return NextResponse.json({ error: 'Send a valid audience segment ID.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid audience segment ID is required.' }, { status: 400 });
  }

  const { data, error } = await access.database
    .from('audience_segments')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[Audiences] Could not delete audience segment:', error);
    return NextResponse.json({ error: 'Could not delete the audience segment.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'The audience segment was not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
