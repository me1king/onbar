import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function authorize() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  const allowed = ['owner', 'admin'].includes(session.role.toLowerCase())
    || session.permissions.can_manage_communications === true
    || session.permissions.can_manage_customer_care === true;
  if (!allowed) {
    return { response: NextResponse.json({ error: 'Waitlist notification access is required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return {
    database: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const { data, error } = await access.database.from('waitlist_lifecycle_events')
    .select('id,event_type,waitlist_id,user_id,order_id,created_at,read_at,market_waitlist(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[AdminWaitlistNotifications] Could not load lifecycle notifications:', error);
    return NextResponse.json({
      error: 'Waitlist notifications are not ready. Apply supabase/WAITLIST_ACCOUNT_GIFT_MIGRATION.sql.'
    }, { status: 503 });
  }
  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { ids?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid notification update is required.' }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length > 100
    || body.ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: 'Choose valid waitlist notifications to mark as read.' }, { status: 400 });
  }
  if (!body.ids.length) return NextResponse.json({ success: true });

  const { error } = await access.database.from('waitlist_lifecycle_events')
    .update({ read_at: new Date().toISOString() })
    .in('id', body.ids)
    .is('read_at', null);
  if (error) {
    console.error('[AdminWaitlistNotifications] Could not mark notifications as read:', error);
    return NextResponse.json({ error: 'Waitlist notifications could not be marked as read.' }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
