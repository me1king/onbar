import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid alert dispatch request is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: 'A valid order is required.' }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return NextResponse.json({ error: 'Alert processing is not configured.' }, { status: 503 });

  const database = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  try {
    const result = await alertAllocatedMerchants(database, orderId);
    if (result.applications > 0 && !result.escalationQueued) {
      return NextResponse.json({ error: 'The delayed alert ladder could not be scheduled.', result }, { status: 503 });
    }
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[MerchantAlertDispatch] Could not dispatch newly allocated merchant alerts:', error);
    return NextResponse.json({ error: 'Merchant alerts could not be dispatched.' }, { status: 503 });
  }
}
